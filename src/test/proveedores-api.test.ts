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
  listarFuentes,
  listarProveedores,
  mensajeDeErrorProveedores,
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

  it("usa el mensaje de respaldo ante un error desconocido", () => {
    expect(mensajeDeErrorProveedores(new Error("boom"), "No pudimos guardar.")).toBe(
      "No pudimos guardar.",
    );
  });
});
