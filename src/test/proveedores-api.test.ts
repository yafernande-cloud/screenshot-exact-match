import { afterEach, describe, expect, it, vi } from "vitest";

/** Sesión única de Supabase simulada: el cliente real no debe abrirse en las pruebas. */
const supabase = vi.hoisted(() => ({ token: "token-vigente", signOut: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: supabase.token } },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session: null },
        error: new Error("sin refresco"),
      }),
      signOut: async () => {
        supabase.signOut();
        return { error: null };
      },
    },
  }),
}));

import { ApiError } from "@/lib/api";
import {
  actualizarFuente,
  actualizarProveedor,
  crearFuente,
  crearProveedor,
  esConflictoDeVersion,
  guardarPerfilImportacion,
  importarListaDePrecios,
  listarFuentes,
  listarOfertasProveedor,
  listarProveedores,
  mensajeDeErrorProveedores,
  obtenerPerfilImportacion,
  previsualizarImportacion,
  type Fuente,
  type Proveedor,
} from "@/lib/proveedores-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function proveedor(overrides: Partial<Proveedor> = {}): Proveedor {
  return {
    supplier_id: "sup-1",
    name: "Distribuidora Andes",
    supplier_code: null,
    status: "active",
    version: 3,
    sources: [],
    internal_notes: null,
    portal_url: null,
    has_portal_credentials: false,
    portal_status: "not_configured",
    has_price_list: false,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

function fuente(overrides: Partial<Fuente> = {}): Fuente {
  return {
    source_id: "src-1",
    name: "Lista de precios Andes",
    kind: "supplier",
    supplier_id: "sup-1",
    mode: "manual_import",
    capabilities: ["price", "stock"],
    enabled: true,
    status: "not_configured",
    has_secret: false,
    last_success_at: null,
    last_error: null,
    version: 1,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("proveedores", () => {
  it("lista los proveedores de la organización con la identidad vigente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ suppliers: [proveedor()] }));
    vi.stubGlobal("fetch", fetchMock);

    const lista = await listarProveedores();

    expect(lista.map((p) => p.supplier_id)).toEqual(["sup-1"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/suppliers");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-vigente" });
  });

  it("crea un proveedor con null cuando el código y las notas van vacíos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(proveedor({ supplier_id: "sup-2", name: "Droguería Pacífico" }), 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    await crearProveedor({ name: "  Droguería Pacífico  ", supplier_code: "  ", notes: "" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/suppliers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Droguería Pacífico",
      supplier_code: null,
      notes: null,
    });
  });

  it("actualiza solo los campos presentes con If-Match de la versión leída", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(proveedor({ status: "inactive", version: 4 })));
    vi.stubGlobal("fetch", fetchMock);

    await actualizarProveedor(proveedor({ version: 3 }), { status: "inactive" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/suppliers/sup-1");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"3"');
    expect(JSON.parse(String(init.body))).toEqual({ status: "inactive" });
  });

  it("envía las credenciales del portal solo al guardarlas y nunca las recibe de vuelta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        proveedor({
          portal_url: "https://compras.andes.cl",
          has_portal_credentials: true,
          portal_status: "credentials_saved",
        }),
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const creado = await crearProveedor({
      name: "Andes",
      portal_url: "https://compras.andes.cl",
      portal_username: "compras-andes",
      portal_password: "clave-secreta",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Andes",
      supplier_code: null,
      notes: null,
      portal_url: "https://compras.andes.cl",
      portal_username: "compras-andes",
      portal_password: "clave-secreta",
    });
    // La respuesta no trae usuario ni contraseña: el backend solo informa que existen.
    expect(creado).not.toHaveProperty("portal_password");
    expect(creado).not.toHaveProperty("portal_username");
    expect(creado.has_portal_credentials).toBe(true);
    expect(creado.portal_status).toBe("credentials_saved");
  });

  it("permite cambiar solo la dirección del portal sin tocar las credenciales", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(proveedor({ portal_url: "https://nuevo.andes.cl" })));
    vi.stubGlobal("fetch", fetchMock);

    await actualizarProveedor(proveedor({ version: 3 }), {
      portal_url: "  https://nuevo.andes.cl  ",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ portal_url: "https://nuevo.andes.cl" });
  });
});

describe("fuentes de proveedor", () => {
  it("pide solo las fuentes de proveedor: las de cadena no se administran aquí", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sources: [fuente()] }));
    vi.stubGlobal("fetch", fetchMock);

    const fuentes = await listarFuentes();

    expect(fuentes.map((f) => f.source_id)).toEqual(["src-1"]);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sources");
    expect(url).toContain("kind=supplier");
  });

  it("crea una fuente de archivo fija en manual_import para el proveedor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fuente(), 201));
    vi.stubGlobal("fetch", fetchMock);

    await crearFuente({
      name: "  Lista de precios Andes ",
      supplier_id: "sup-1",
      capabilities: ["price", "stock"],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sources");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Lista de precios Andes",
      kind: "supplier",
      supplier_id: "sup-1",
      mode: "manual_import",
      capabilities: ["price", "stock"],
      enabled: true,
    });
  });

  it("actualiza la fuente con If-Match y sin tocar el modo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(fuente({ enabled: false, version: 2 })));
    vi.stubGlobal("fetch", fetchMock);

    await actualizarFuente(fuente({ version: 1 }), { enabled: false });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sources/src-1");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"1"');
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false });
  });
});

describe("listas de precios importadas", () => {
  const archivo = () =>
    new File(["codigo,producto,precio,unidad\nSKU-1,Paracetamol,1990,caja\n"], "lista.csv", {
      type: "text/csv",
    });

  it("lee la vista previa como multipart, sin fijar Content-Type y con hoja y cabecera opcionales", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        file_format: "xlsx",
        sheets: ["Lista", "Otra"],
        sheet: "Otra",
        header_row: 3,
        headers: ["Código", "Producto", "Precio", "Unidad"],
        sample_rows: [{ row: 4, values: ["SKU-1", "Paracetamol", "1990", "caja"] }],
        row_count: 1,
        suggested_columns: { sku: { position: 1 }, price: { position: 3 } },
        suggested_options: {
          decimal_separator: ".",
          currency: null,
          price_basis: null,
          default_sale_unit: null,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const vista = await previsualizarImportacion("src-1", archivo(), {
      hoja: "Otra",
      filaEncabezado: 3,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sources/src-1/import-preview");
    const cuerpo = init.body as FormData;
    expect(cuerpo.get("sheet")).toBe("Otra");
    expect(cuerpo.get("header_row")).toBe("3");
    expect(cuerpo.get("file")).toBeInstanceOf(File);
    // Sin Content-Type explícito: el navegador debe agregar el límite del multipart.
    expect(init.headers as Record<string, string>).not.toHaveProperty("Content-Type");
    expect(vista.sheets).toEqual(["Lista", "Otra"]);
  });

  it("obtiene el perfil y guarda con If-Match 0 cuando todavía no existe", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ profile: null, version: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          source_id: "src-1",
          file_format: "csv",
          sheet: null,
          header_row: 1,
          columns: { sku: { position: 1 }, price: { position: 3 }, sale_unit: { position: 4 } },
          units: {},
          options: { currency: "CLP", price_basis: "per_commercial_unit" },
          status: "active",
          version: 1,
          created_at: "2026-11-08T10:00:00Z",
          updated_at: "2026-11-08T10:00:00Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const inicial = await obtenerPerfilImportacion("src-1");
    expect(inicial).toEqual({ profile: null, version: 0 });

    await guardarPerfilImportacion(
      "src-1",
      {
        file_format: "csv",
        sheet: null,
        header_row: 1,
        columns: { sku: { position: 1 }, price: { position: 3 }, sale_unit: { position: 4 } },
        units: {},
        options: { currency: "CLP", price_basis: "per_commercial_unit" },
      },
      0,
    );

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/api/v1/sources/src-1/import-profile");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"0"');
  });

  it("importa con Idempotency-Key y los identificadores del proveedor y la fuente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        import_id: "imp-1",
        status: "completed",
        rows_total: 1,
        rows_accepted: 1,
        rows_rejected: 0,
        errors: [],
        observed_at: "2026-11-08T10:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await importarListaDePrecios({
      supplierId: "sup-1",
      sourceId: "src-1",
      archivo: archivo(),
      idempotencyKey: "clave-12345678",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/imports");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("clave-12345678");
    const cuerpo = init.body as FormData;
    expect(cuerpo.get("supplier_id")).toBe("sup-1");
    expect(cuerpo.get("source_id")).toBe("src-1");
    expect(resultado.rows_accepted).toBe(1);
  });

  it("lista las últimas ofertas por SKU del proveedor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        offers: [
          {
            offer_id: "of-1",
            source_id: "src-1",
            source_name: "Lista Andes",
            external_id: "SKU-1",
            external_name: "Paracetamol",
            trade_item_id: "item-1",
            trade_item_name: "Paracetamol 500 mg",
            price_amount: "1990.00",
            currency: "CLP",
            price_basis: "per_commercial_unit",
            sale_unit: "box",
            sale_unit_text: "caja",
            pack_units_per_commercial_unit: null,
            pack_base_unit: null,
            stock_status: "unknown",
            stock_quantity: null,
            review_status: "pending",
            observed_at: "2026-11-08T10:00:00Z",
            imported_at: "2026-11-08T10:01:00Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ofertas = await listarOfertasProveedor("sup-1", 50);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/suppliers/sup-1/offers");
    expect(url).toContain("limit=50");
    expect(ofertas[0]?.external_id).toBe("SKU-1");
  });
});

describe("errores reales de la API", () => {
  it("reconoce solo el conflicto de versión como caso que exige refrescar", () => {
    expect(esConflictoDeVersion(new ApiError(409, "VERSION_CONFLICT", "Cambió."))).toBe(true);
    expect(esConflictoDeVersion(new ApiError(409, "DUPLICATE_NAME", "Existe."))).toBe(false);
    expect(esConflictoDeVersion(new Error("otro"))).toBe(false);
  });

  it("explica conflicto de versión, permisos y sesión expirada sin detalles internos", () => {
    expect(mensajeDeErrorProveedores(new ApiError(409, "VERSION_CONFLICT", "Cambió."))).toContain(
      "Actualizamos la lista",
    );
    expect(mensajeDeErrorProveedores(new ApiError(403, "FORBIDDEN", "Detalle interno"))).toContain(
      "no tiene permiso",
    );
    expect(mensajeDeErrorProveedores(new ApiError(401, "UNAUTHENTICATED", "Token vencido"))).toBe(
      "Tu sesión expiró. Inicia sesión otra vez.",
    );
  });

  it("conserva el mensaje propio del backend para un nombre duplicado", () => {
    expect(
      mensajeDeErrorProveedores(
        new ApiError(409, "DUPLICATE_NAME", "Ya existe un proveedor llamado «Andes»."),
      ),
    ).toBe("Ya existe un proveedor llamado «Andes».");
  });

  it("explica que una contraseña no se guardó cuando falta la clave de cifrado", () => {
    expect(
      mensajeDeErrorProveedores(
        new ApiError(503, "SUPPLIER_CREDENTIALS_KEY_MISSING", "Detalle técnico"),
      ),
    ).toContain("no se guardó ninguna contraseña");
  });

  it("usa el mensaje de respaldo ante un error desconocido", () => {
    expect(mensajeDeErrorProveedores(new Error("boom"), "No pudimos guardar.")).toBe(
      "No pudimos guardar.",
    );
  });
});
