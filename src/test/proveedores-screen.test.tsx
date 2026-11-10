import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { ApiError } from "@/lib/api";
import type {
  EstadoConexionFuente,
  Fuente,
  Proveedor,
  RevisionImportacion,
  VistaPreviaImportacion,
} from "@/lib/proveedores-api";

vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({
    status: "authorized",
    profile: { display_name: "Prueba", roles: ["admin"] },
    error: null,
    signInWithGoogle: async () => {},
    signOut: async () => {},
    retry: async () => {},
  }),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return {
    ...actual,
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

vi.mock("@/lib/proveedores-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/proveedores-api")>();
  return {
    ...actual,
    listarProveedores: vi.fn(),
    listarFuentes: vi.fn(),
    crearProveedor: vi.fn(),
    actualizarProveedor: vi.fn(),
    crearFuente: vi.fn(),
    actualizarFuente: vi.fn(),
    obtenerEstadoConexionFuente: vi.fn(),
    obtenerPerfilImportacion: vi.fn(),
    guardarPerfilImportacion: vi.fn(),
    previsualizarImportacion: vi.fn(),
    revisarImportacion: vi.fn(),
    importarListaDePrecios: vi.fn(),
    listarOfertasProveedor: vi.fn(),
    nuevaClaveIdempotencia: vi.fn(),
  };
});

import { toast } from "sonner";
import {
  actualizarFuente,
  actualizarProveedor,
  crearFuente,
  crearProveedor,
  guardarPerfilImportacion,
  importarListaDePrecios,
  listarFuentes,
  listarOfertasProveedor,
  listarProveedores,
  nuevaClaveIdempotencia,
  obtenerEstadoConexionFuente,
  obtenerPerfilImportacion,
  previsualizarImportacion,
  revisarImportacion,
} from "@/lib/proveedores-api";

const listarProveedoresMock = listarProveedores as unknown as Mock;
const listarFuentesMock = listarFuentes as unknown as Mock;
const crearProveedorMock = crearProveedor as unknown as Mock;
const actualizarProveedorMock = actualizarProveedor as unknown as Mock;
const crearFuenteMock = crearFuente as unknown as Mock;
const actualizarFuenteMock = actualizarFuente as unknown as Mock;
const obtenerEstadoConexionMock = obtenerEstadoConexionFuente as unknown as Mock;
const obtenerPerfilMock = obtenerPerfilImportacion as unknown as Mock;
const guardarPerfilMock = guardarPerfilImportacion as unknown as Mock;
const previsualizarMock = previsualizarImportacion as unknown as Mock;
const revisarMock = revisarImportacion as unknown as Mock;
const importarMock = importarListaDePrecios as unknown as Mock;
const listarOfertasMock = listarOfertasProveedor as unknown as Mock;
const claveMock = nuevaClaveIdempotencia as unknown as Mock;
const toastSuccess = toast.success as unknown as Mock;
const toastError = toast.error as unknown as Mock;

/** jsdom no implementa ResizeObserver; Radix Checkbox lo usa al montar. */
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: ResizeObserverStub,
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

function perfilConector(overrides: Partial<EstadoConexionFuente> = {}): EstadoConexionFuente {
  return {
    source_id: "src-api",
    configured: true,
    state: "connected",
    reason: null,
    enabled: true,
    mechanism: "algolia",
    last_success_at: "2026-11-10T03:03:29Z",
    ...overrides,
  };
}

function vistaPrevia(overrides: Partial<VistaPreviaImportacion> = {}): VistaPreviaImportacion {
  return {
    file_format: "csv",
    sheets: [],
    sheet: null,
    suggested_sheet: null,
    header_row: 1,
    headers: ["Código", "Producto", "Precio", "Unidad"],
    sample_rows: [{ row: 2, values: ["SKU-1", "Paracetamol", "1990", "caja"] }],
    row_count: 1,
    suggested_columns: {
      sku: { position: 1 },
      name: { position: 2 },
      price: { position: 3 },
      sale_unit: { position: 4 },
    },
    suggested_options: {
      decimal_separator: ".",
      currency: null,
      price_basis: null,
      default_sale_unit: null,
    },
    ...overrides,
  };
}

function archivoCsv(nombre = "lista.csv"): File {
  return new File(["codigo,producto,precio,unidad\nSKU-1,Paracetamol,1990,caja\n"], nombre, {
    type: "text/csv",
  });
}

function revision(overrides: Partial<RevisionImportacion> = {}): RevisionImportacion {
  return {
    file_format: "csv",
    sheets: [],
    sheet: null,
    header_row: 1,
    headers: ["Código", "Producto", "Precio", "Unidad"],
    rows_total: 1,
    rows_accepted: 1,
    rows_rejected: 0,
    rows_needs_review: 0,
    rows: [
      {
        row: 2,
        status: "ready",
        sku: "SKU-1",
        name: "Paracetamol",
        price: "1990.00",
        currency: "CLP",
        price_basis: "per_commercial_unit",
        sale_unit: "box",
        sale_unit_text: "caja",
        pack_units: null,
        stock: null,
        observed_at: "2026-11-10T10:00:00Z",
        warnings: [],
        problem: null,
      },
    ],
    rows_truncated: false,
    problems: [],
    unrecognised_units: [],
    profile_source: "request",
    profile_version: 0,
    file_hash: "a".repeat(64),
    ...overrides,
  };
}

async function renderizarProveedores() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/proveedores"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  listarProveedoresMock.mockReset();
  listarProveedoresMock.mockResolvedValue([]);
  listarFuentesMock.mockReset();
  listarFuentesMock.mockResolvedValue([]);
  crearProveedorMock.mockReset();
  actualizarProveedorMock.mockReset();
  crearFuenteMock.mockReset();
  actualizarFuenteMock.mockReset();
  obtenerEstadoConexionMock.mockReset();
  obtenerEstadoConexionMock.mockResolvedValue(perfilConector());
  obtenerPerfilMock.mockReset();
  obtenerPerfilMock.mockResolvedValue({ profile: null, version: 0 });
  guardarPerfilMock.mockReset();
  previsualizarMock.mockReset();
  revisarMock.mockReset();
  importarMock.mockReset();
  listarOfertasMock.mockReset();
  listarOfertasMock.mockResolvedValue([]);
  claveMock.mockReset();
  claveMock.mockReturnValue("clave-prueba");
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("pantalla de proveedores", () => {
  it("muestra una tarjeta por proveedor con lo esencial, sin datos de demostración", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);

    await renderizarProveedores();

    expect(await screen.findByText("Distribuidora Andes")).toBeInTheDocument();
    expect(screen.getByText("1 activos de 1")).toBeInTheDocument();
    expect(screen.getByText("Lista de precios Excel")).toBeInTheDocument();
    expect(screen.getByText("Estado de carga:")).toBeInTheDocument();
    expect(screen.getByText("Sin archivo cargado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar Excel" })).toBeInTheDocument();
    // Los detalles de cada fuente viven en la configuración, no en la tarjeta.
    expect(screen.queryByText("Lista de precios Andes")).toBeNull();
    expect(screen.queryByText("Fuentes de precios")).toBeNull();
    expect(screen.queryByText("Productos y precios importados")).toBeNull();
    expect(screen.queryByText(/\(demo\)/)).toBeNull();
    expect(screen.queryByText(/No se guardan|no se guardan/)).toBeNull();
    expect(screen.queryByText("Laboratorio Sur")).toBeNull();
    expect(screen.queryByText("Proveedor X")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Lista de precios Andes")).toBeInTheDocument();
    expect(screen.getByText("Fuentes de precios")).toBeInTheDocument();
  });

  it("muestra una lista vacía cuando la organización todavía no tiene proveedores", async () => {
    await renderizarProveedores();

    expect(await screen.findByText(/Todavía no hay proveedores registrados/)).toBeInTheDocument();
  });

  it("crea un proveedor con lista de precios y su fuente, sin inventar precios", async () => {
    const creado = proveedor({
      supplier_id: "sup-2",
      name: "Droguería Pacífico",
      version: 1,
    });
    const nuevaFuente = fuente({
      source_id: "src-nueva",
      name: "Lista de precios · Droguería Pacífico",
      supplier_id: "sup-2",
    });
    crearProveedorMock.mockResolvedValue(creado);
    crearFuenteMock.mockResolvedValue(nuevaFuente);

    await renderizarProveedores();
    await screen.findByText(/Todavía no hay proveedores registrados/);

    fireEvent.change(screen.getByLabelText("Nombre del proveedor"), {
      target: { value: "  Droguería Pacífico  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Datos internos (opcional)" }));
    fireEvent.change(screen.getByLabelText("Código interno (opcional)"), {
      target: { value: "PAC-01" },
    });
    fireEvent.change(screen.getByLabelText("Notas (opcional)"), {
      target: { value: "Contacto: ventas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));

    await waitFor(() =>
      expect(crearProveedorMock).toHaveBeenCalledWith({
        name: "Droguería Pacífico",
        supplier_code: "PAC-01",
        notes: "Contacto: ventas",
      }),
    );
    await waitFor(() =>
      expect(crearFuenteMock).toHaveBeenCalledWith({
        name: "Lista de precios · Droguería Pacífico",
        supplier_id: "sup-2",
        capabilities: ["product_detail", "price"],
      }),
    );
    expect(await screen.findByText("Droguería Pacífico")).toBeInTheDocument();
    expect(screen.getByText("Lista de precios Excel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar Excel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Lista de precios · Droguería Pacífico")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Droguería Pacífico quedó registrado. Carga su lista de precios en la tarjeta del proveedor.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar configuración" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("crea un proveedor solo con portal y envía las credenciales sin mostrarlas después", async () => {
    crearProveedorMock.mockResolvedValue(
      proveedor({
        supplier_id: "sup-3",
        name: "Droguería Pacífico",
        portal_url: "https://compras.pacifico.cl",
        has_portal_credentials: true,
        portal_status: "credentials_saved",
        version: 1,
      }),
    );

    await renderizarProveedores();
    await screen.findByText(/Todavía no hay proveedores registrados/);

    fireEvent.change(screen.getByLabelText("Nombre del proveedor"), {
      target: { value: "Droguería Pacífico" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Portal web/ }));
    fireEvent.change(screen.getByLabelText("Dirección del portal"), {
      target: { value: "https://compras.pacifico.cl" },
    });
    fireEvent.change(screen.getByLabelText("Usuario del portal"), {
      target: { value: "compras" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña del portal"), {
      target: { value: "secreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));

    await waitFor(() =>
      expect(crearProveedorMock).toHaveBeenCalledWith({
        name: "Droguería Pacífico",
        supplier_code: "",
        notes: "",
        portal_url: "https://compras.pacifico.cl",
        portal_username: "compras",
        portal_password: "secreta",
      }),
    );
    expect(crearFuenteMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Portal de compras")).toBeInTheDocument();
    expect(screen.getByText(/Credenciales guardadas · sin conectar/)).toBeInTheDocument();
    // La contraseña no queda en pantalla ni se puede leer desde la tarjeta.
    expect(screen.queryByDisplayValue("secreta")).toBeNull();
    expect(screen.queryByText(/^Conectado$/)).toBeNull();
  });

  it("registra las dos modalidades juntas: portal y lista de precios", async () => {
    crearProveedorMock.mockResolvedValue(
      proveedor({
        supplier_id: "sup-4",
        name: "Droguería Pacífico",
        portal_url: "https://compras.pacifico.cl",
        has_portal_credentials: true,
        portal_status: "credentials_saved",
        version: 1,
      }),
    );
    crearFuenteMock.mockResolvedValue(
      fuente({
        source_id: "src-4",
        name: "Lista de precios · Droguería Pacífico",
        supplier_id: "sup-4",
      }),
    );

    await renderizarProveedores();
    await screen.findByText(/Todavía no hay proveedores registrados/);

    fireEvent.change(screen.getByLabelText("Nombre del proveedor"), {
      target: { value: "Droguería Pacífico" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Portal y lista/ }));
    fireEvent.change(screen.getByLabelText("Dirección del portal"), {
      target: { value: "https://compras.pacifico.cl" },
    });
    fireEvent.change(screen.getByLabelText("Usuario del portal"), {
      target: { value: "compras" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña del portal"), {
      target: { value: "secreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));

    await waitFor(() =>
      expect(crearProveedorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Droguería Pacífico",
          portal_url: "https://compras.pacifico.cl",
          portal_username: "compras",
        }),
      ),
    );
    await waitFor(() =>
      expect(crearFuenteMock).toHaveBeenCalledWith({
        name: "Lista de precios · Droguería Pacífico",
        supplier_id: "sup-4",
        capabilities: ["product_detail", "price"],
      }),
    );
    expect(
      await screen.findByText("Lista de precios Excel · Portal de compras"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Credenciales guardadas · sin conectar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Lista de precios · Droguería Pacífico")).toBeInTheDocument();
    expect(screen.getAllByText(/Credenciales guardadas · sin conectar/).length).toBeGreaterThan(0);
  });

  it("edita nombre, código y notas con la versión leída", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ supplier_code: "AND-01", internal_notes: "Contacto: ventas" }),
    ]);
    actualizarProveedorMock.mockResolvedValue(
      proveedor({
        name: "Distribuidora Andes Norte",
        supplier_code: "AND-02",
        internal_notes: "Contacto: compras",
        version: 4,
      }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Distribuidora Andes Norte" },
    });
    fireEvent.change(screen.getByLabelText("Código interno del proveedor (opcional)"), {
      target: { value: "AND-02" },
    });
    fireEvent.change(screen.getByLabelText("Notas del proveedor (opcional)"), {
      target: { value: "Contacto: compras" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(actualizarProveedorMock).toHaveBeenCalledWith(
        expect.objectContaining({ supplier_id: "sup-1", version: 3 }),
        {
          name: "Distribuidora Andes Norte",
          supplier_code: "AND-02",
          notes: "Contacto: compras",
        },
      ),
    );
    expect(await screen.findByText("Distribuidora Andes Norte")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Cambios guardados.");
  });

  it("desactiva al proveedor sin borrar su historial", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor()]);
    actualizarProveedorMock.mockResolvedValue(proveedor({ status: "inactive", version: 4 }));

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const interruptor = await screen.findByRole("switch", {
      name: "Activar o desactivar Distribuidora Andes",
    });
    expect(interruptor).toHaveAttribute("data-state", "checked");
    fireEvent.click(interruptor);

    await waitFor(() =>
      expect(actualizarProveedorMock).toHaveBeenCalledWith(
        expect.objectContaining({ supplier_id: "sup-1" }),
        { status: "inactive" },
      ),
    );
    await waitFor(() => expect(interruptor).toHaveAttribute("data-state", "unchecked"));
    expect(toastSuccess).toHaveBeenCalledWith(
      "Distribuidora Andes quedó inactivo. Su historial se conserva.",
    );
  });

  it("muestra el portal como guardado, nunca como conectado", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({
        portal_url: "https://compras.andes.cl",
        has_portal_credentials: true,
        portal_status: "credentials_saved",
      }),
    ]);

    await renderizarProveedores();

    expect(await screen.findByText(/Credenciales guardadas · sin conectar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByText("https://compras.andes.cl")).toBeInTheDocument();
    expect(screen.getByText(/Guardar credenciales no conecta el portal/)).toBeInTheDocument();
    expect(screen.queryByText(/^Conectado$/)).toBeNull();
  });

  it("guarda las credenciales del portal y limpia la contraseña de la pantalla", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ portal_url: "https://compras.andes.cl", version: 3 }),
    ]);
    actualizarProveedorMock.mockResolvedValue(
      proveedor({
        portal_url: "https://compras.andes.cl",
        has_portal_credentials: true,
        portal_status: "credentials_saved",
        version: 4,
      }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar datos" }));
    fireEvent.change(screen.getByLabelText("Usuario del portal"), {
      target: { value: "compras" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña del portal"), {
      target: { value: "secreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));

    await waitFor(() =>
      expect(actualizarProveedorMock).toHaveBeenCalledWith(
        expect.objectContaining({ supplier_id: "sup-1", version: 3 }),
        {
          portal_url: "https://compras.andes.cl",
          portal_username: "compras",
          portal_password: "secreta",
        },
      ),
    );
    await waitFor(() => expect(screen.queryByDisplayValue("secreta")).toBeNull());
    expect(screen.getAllByText(/Credenciales guardadas · sin conectar/).length).toBeGreaterThan(0);
  });

  it("agrega una lista de precios a un proveedor que todavía no tiene fuente", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor()]);
    crearFuenteMock.mockResolvedValue(
      fuente({ source_id: "src-nueva", name: "Lista de precios · Distribuidora Andes" }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar lista de precios" }));

    await waitFor(() =>
      expect(crearFuenteMock).toHaveBeenCalledWith({
        name: "Lista de precios · Distribuidora Andes",
        supplier_id: "sup-1",
        capabilities: ["product_detail", "price"],
      }),
    );
    expect(await screen.findByText("Lista de precios · Distribuidora Andes")).toBeInTheDocument();
  });

  it("crea una fuente adicional con las capacidades elegidas", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    crearFuenteMock.mockResolvedValue(
      fuente({ source_id: "src-2", name: "Lista de precios 2026" }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar fuente" }));
    fireEvent.change(screen.getByLabelText("Nombre de la fuente"), {
      target: { value: "Lista de precios 2026" },
    });
    fireEvent.click(screen.getByLabelText("Stock disponible"));
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(crearFuenteMock).toHaveBeenCalledWith({
        name: "Lista de precios 2026",
        supplier_id: "sup-1",
        capabilities: ["price", "stock"],
      }),
    );
    expect(await screen.findByText("Lista de precios 2026")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("La fuente «Lista de precios 2026» quedó creada.");
  });

  it("activa y desactiva una fuente existente", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    actualizarFuenteMock.mockResolvedValue(fuente({ enabled: false, version: 2 }));

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(
      await screen.findByRole("switch", { name: "Activar o desactivar Lista de precios Andes" }),
    );

    await waitFor(() =>
      expect(actualizarFuenteMock).toHaveBeenCalledWith(
        expect.objectContaining({ source_id: "src-1", version: 1 }),
        { enabled: false },
      ),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "La fuente «Lista de precios Andes» quedó desactivada.",
    );
  });

  it("revisa los productos antes de importar y no guarda ni importa hasta confirmar", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    previsualizarMock.mockResolvedValue(vistaPrevia());
    revisarMock.mockResolvedValue(revision());
    guardarPerfilMock.mockResolvedValue({
      source_id: "src-1",
      file_format: "csv",
      sheet: null,
      header_row: 1,
      columns: {
        sku: { header: "Código", position: 1 },
        name: { header: "Producto", position: 2 },
        price: { header: "Precio", position: 3 },
        sale_unit: { header: "Unidad", position: 4 },
      },
      units: { caja: "box" },
      options: {
        currency: "CLP",
        price_basis: "per_commercial_unit",
        decimal_separator: ".",
        create_missing_items: false,
      },
      status: "active",
      version: 1,
      created_at: "2026-11-08T10:00:00Z",
      updated_at: "2026-11-08T10:00:00Z",
    });
    importarMock.mockResolvedValue({
      import_id: "imp-1",
      status: "completed",
      rows_total: 1,
      rows_accepted: 1,
      rows_rejected: 0,
      errors: [],
      observed_at: "2026-11-08T10:00:00Z",
    });

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Cargar Excel" }));
    const entrada = await screen.findByLabelText("Archivo de la lista de precios");
    const archivo = archivoCsv();
    fireEvent.change(entrada, { target: { files: [archivo] } });

    await waitFor(() =>
      expect(previsualizarMock).toHaveBeenCalledWith("src-1", archivo, {
        hoja: null,
        filaEncabezado: undefined,
      }),
    );

    // La vista previa completó el mapeo sugerido y la traducción de la unidad vista.
    await waitFor(() =>
      expect(screen.getByLabelText("Código del producto (obligatorio)")).toHaveValue("1"),
    );
    expect(screen.getByLabelText("Precio (obligatorio)")).toHaveValue("3");
    expect(screen.getByLabelText("Unidad de venta (obligatorio)")).toHaveValue("4");
    fireEvent.change(screen.getByLabelText("Moneda de la lista"), {
      target: { value: "clp" },
    });
    fireEvent.change(screen.getByLabelText("Base del precio"), {
      target: { value: "per_commercial_unit" },
    });
    fireEvent.change(screen.getByLabelText("Traducción de la unidad caja"), {
      target: { value: "box" },
    });

    // Se revisa, pero todavía no se escribe nada.
    fireEvent.click(screen.getByRole("button", { name: "Revisar productos" }));

    const datosEsperados = {
      file_format: "csv",
      sheet: null,
      header_row: 1,
      columns: {
        sku: { header: "Código", position: 1 },
        name: { header: "Producto", position: 2 },
        price: { header: "Precio", position: 3 },
        sale_unit: { header: "Unidad", position: 4 },
      },
      units: { caja: "box" },
      options: {
        decimal_separator: ".",
        create_missing_items: false,
        currency: "CLP",
        price_basis: "per_commercial_unit",
      },
    };

    await waitFor(() =>
      expect(revisarMock).toHaveBeenCalledWith("src-1", archivo, datosEsperados, {
        hoja: null,
        filaEncabezado: 1,
      }),
    );
    expect(guardarPerfilMock).not.toHaveBeenCalled();
    expect(importarMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Revisa los productos")).toBeInTheDocument();
    expect(
      screen.getByText(/De 1 filas, 1 se pueden importar y 0 tienen problemas/),
    ).toBeInTheDocument();
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
    expect(screen.getByText("1 listos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Confirma la importación")).toBeInTheDocument();
    expect(guardarPerfilMock).not.toHaveBeenCalled();
    expect(importarMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));

    await waitFor(() => expect(guardarPerfilMock).toHaveBeenCalledWith("src-1", datosEsperados, 0));
    await waitFor(() =>
      expect(importarMock).toHaveBeenCalledWith({
        supplierId: "sup-1",
        sourceId: "src-1",
        archivo,
        idempotencyKey: "clave-prueba",
      }),
    );
    expect(await screen.findByText("Importación completa")).toBeInTheDocument();
    expect(screen.getByText("1 de 1 filas aceptadas")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Se importaron 1 filas.");
  });

  it("pide solo la moneda que falta y no permite continuar sin actualizar la revisión", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    previsualizarMock.mockResolvedValue(vistaPrevia());
    revisarMock.mockResolvedValue(
      revision({
        rows_accepted: 0,
        rows_rejected: 1,
        rows: [
          {
            row: 2,
            status: "rejected",
            sku: "SKU-1",
            name: "Paracetamol",
            price: "1990.00",
            currency: null,
            price_basis: null,
            sale_unit: "box",
            sale_unit_text: "caja",
            pack_units: null,
            stock: null,
            observed_at: "2026-11-10T10:00:00Z",
            warnings: [],
            problem: {
              code: "INVALID_CURRENCY",
              message: "La fila no trae moneda y el mapeo no la declara.",
              fields: ["currency"],
              values: { currency: null },
            },
          },
        ],
        problems: [
          {
            code: "INVALID_CURRENCY",
            message: "La fila no trae moneda y el mapeo no la declara.",
            fields: ["currency"],
            count: 1,
            sample_rows: [2],
          },
        ],
      }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Cargar Excel" }));
    const entrada = await screen.findByLabelText("Archivo de la lista de precios");
    fireEvent.change(entrada, { target: { files: [archivoCsv()] } });
    await waitFor(() =>
      expect(screen.getByLabelText("Código del producto (obligatorio)")).toHaveValue("1"),
    );

    // Sin moneda en el archivo: se revisa y la revisión explica el problema.
    fireEvent.change(screen.getByLabelText("Traducción de la unidad caja"), {
      target: { value: "box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revisar productos" }));

    expect(
      await screen.findByLabelText("¿En qué moneda están los precios? (código de 3 letras)"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Falta la moneda · 1 fila")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(guardarPerfilMock).not.toHaveBeenCalled();
    expect(importarMock).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText("¿En qué moneda están los precios? (código de 3 letras)"),
      { target: { value: "CLP" } },
    );
    // La corrección exige una nueva revisión: los conteos anteriores ya no valen.
    expect(await screen.findByText("La revisión está desactualizada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(importarMock).not.toHaveBeenCalled();
  });

  it("avisa cuando el mapeo guardado no calza por nombre de columna y no aplica posiciones viejas", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    obtenerPerfilMock.mockResolvedValue({
      profile: {
        source_id: "src-1",
        file_format: "csv",
        sheet: null,
        header_row: 1,
        columns: {
          sku: { header: "Código Interno" },
          price: { header: "Precio final" },
          sale_unit: { header: "Envase" },
        },
        units: {},
        options: { currency: "CLP", price_basis: "per_commercial_unit" },
        status: "active",
        version: 2,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
      version: 2,
    });
    previsualizarMock.mockResolvedValue(vistaPrevia());

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Cargar Excel" }));
    expect(await screen.findByText("Mapeo guardado (versión 2)")).toBeInTheDocument();
    const entrada = await screen.findByLabelText("Archivo de la lista de precios");
    fireEvent.change(entrada, { target: { files: [archivoCsv()] } });

    expect(
      await screen.findByText("El mapeo guardado no calza con este archivo"),
    ).toBeInTheDocument();
    expect(screen.getByText(/El archivo cambió de columnas/)).toBeInTheDocument();
    // Se usan las columnas sugeridas del archivo actual, no las posiciones del mapeo viejo.
    expect(screen.getByLabelText("Código del producto (obligatorio)")).toHaveValue("1");
    expect(screen.getByLabelText("Precio (obligatorio)")).toHaveValue("3");
    expect(revisarMock).not.toHaveBeenCalled();
    expect(importarMock).not.toHaveBeenCalled();
  });

  it("informa cuando un archivo no se puede leer y no deja importarlo", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    previsualizarMock.mockRejectedValue(
      new ApiError(
        422,
        "IMPORT_FORMAT_INVALID",
        "El archivo no se puede abrir como planilla .xlsx.",
      ),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Cargar Excel" }));
    const entrada = await screen.findByLabelText("Archivo de la lista de precios");
    fireEvent.change(entrada, {
      target: { files: [new File(["roto"], "lista.xlsx", { type: "application/vnd.ms-excel" })] },
    });

    expect(await screen.findByText("No pudimos leer el archivo")).toBeInTheDocument();
    expect(
      screen.getByText("El archivo no se puede abrir como planilla .xlsx."),
    ).toBeInTheDocument();
    expect(guardarPerfilMock).not.toHaveBeenCalled();
    expect(importarMock).not.toHaveBeenCalled();
  });

  it("muestra los precios importados y aclara que no son precios de farmacias", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    listarOfertasMock.mockResolvedValue([
      {
        offer_id: "of-1",
        source_id: "src-1",
        source_name: "Lista de precios Andes",
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
    ]);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver precios" }));

    expect(await screen.findByText("Paracetamol 500 mg")).toBeInTheDocument();
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
    expect(screen.getByText(/No son precios de referencia de farmacias/)).toBeInTheDocument();
  });

  it("explica un error de permisos y permite reintentar", async () => {
    listarProveedoresMock.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Detalle interno"));

    await renderizarProveedores();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No pudimos cargar los proveedores");
    expect(alerta).toHaveTextContent("Tu cuenta no tiene permiso para administrar proveedores");

    listarProveedoresMock.mockResolvedValue([proveedor()]);
    listarFuentesMock.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Distribuidora Andes")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refresca la lista cuando la versión cambió en otra sesión", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ version: 3 })]);
    actualizarProveedorMock.mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Cambió."));

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");
    expect(listarProveedoresMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(
      await screen.findByRole("switch", { name: "Activar o desactivar Distribuidora Andes" }),
    );

    await waitFor(() => expect(listarProveedoresMock).toHaveBeenCalledTimes(2));
    expect(toastError).toHaveBeenCalledWith(
      "Otro cambio se guardó primero. Actualizamos la lista; revisa los datos antes de volver a guardar.",
    );
  });

  it("muestra una fuente API como consulta en vivo, con su estado real y sin importador", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ name: "Proveedor FarmaLoop", sources: ["src-api"] }),
    ]);
    listarFuentesMock.mockResolvedValue([
      fuente({
        source_id: "src-api",
        name: "Farmaloop API",
        mode: "api",
        capabilities: ["search", "price"],
      }),
    ]);
    obtenerEstadoConexionMock.mockResolvedValue(perfilConector({ source_id: "src-api" }));

    await renderizarProveedores();

    expect(await screen.findByText("Proveedor FarmaLoop")).toBeInTheDocument();
    expect(screen.getByText("Consulta en vivo")).toBeInTheDocument();
    expect(await screen.findByText("Estado de conexión:")).toBeInTheDocument();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    // La tarjeta no expone el nombre técnico de la fuente ni ofrece un importador.
    expect(screen.queryByText("Farmaloop API")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cargar Excel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver precios" })).toBeNull();
    // La configuración conserva el detalle y la última respuesta registrada, sin fingir una
    // comprobación actual.
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Farmaloop API")).toBeInTheDocument();
    expect(screen.getByText(/Última conexión exitosa registrada:/)).toBeInTheDocument();
    expect(screen.queryByText(/La conexión está disponible\./)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cargar lista" })).toBeNull();
    expect(screen.queryByText("Sin cargas todavía")).toBeNull();
    expect(obtenerEstadoConexionMock).toHaveBeenCalledWith("src-api");
  });

  it("no presenta como conectada una fuente API cuyo estado real es un error", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ name: "Proveedor FarmaLoop", sources: ["src-api"] }),
    ]);
    listarFuentesMock.mockResolvedValue([
      fuente({ source_id: "src-api", name: "Farmaloop API", mode: "api" }),
    ]);
    obtenerEstadoConexionMock.mockResolvedValue(
      perfilConector({
        source_id: "src-api",
        state: "error",
        reason: "network_error",
        last_success_at: null,
      }),
    );

    await renderizarProveedores();

    expect(await screen.findByText("Estado de conexión:")).toBeInTheDocument();
    expect(screen.getByText("Error de conexión")).toBeInTheDocument();
    expect(screen.queryByText("Conectado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(
      await screen.findByText("No pudimos comunicarnos con el proveedor."),
    ).toBeInTheDocument();
  });

  it("no muestra la sección del portal cuando el proveedor no usa portal", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    expect(screen.queryByText("Portal de compras")).toBeNull();
    expect(screen.queryByText("Portal sin configurar")).toBeNull();

    // La modalidad se puede agregar desde la configuración, sin dejar una sección vacía
    // siempre visible en la tarjeta.
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar portal" }));
    expect(await screen.findByLabelText("Dirección del portal")).toBeInTheDocument();
  });

  it("muestra el portal y la consulta en vivo por separado cuando conviven", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({
        name: "Proveedor FarmaLoop",
        sources: ["src-api"],
        portal_url: "https://compras.farmaloop.cl",
        has_portal_credentials: true,
        portal_status: "credentials_saved",
      }),
    ]);
    listarFuentesMock.mockResolvedValue([
      fuente({
        source_id: "src-api",
        name: "Farmaloop API",
        mode: "api",
        capabilities: ["search"],
      }),
    ]);

    await renderizarProveedores();

    expect(await screen.findByText("Consulta en vivo · Portal de compras")).toBeInTheDocument();
    expect(screen.getByText(/Credenciales guardadas · sin conectar/)).toBeInTheDocument();
    expect(await screen.findByText("Estado de conexión:")).toBeInTheDocument();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.queryByText("Portal sin configurar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cargar lista" })).toBeNull();
    // La configuración reúne el portal y la conexión en vivo por separado.
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("https://compras.farmaloop.cl")).toBeInTheDocument();
    expect(screen.getByText("Farmaloop API")).toBeInTheDocument();
  });

  it("filtra por nombre en tiempo real sin distinguir mayúsculas ni tildes", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ supplier_id: "sup-1", name: "Distribuidora Andes", sources: ["src-1"] }),
      proveedor({ supplier_id: "sup-2", name: "Droguería Pacífico" }),
    ]);
    listarFuentesMock.mockResolvedValue([fuente()]);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");
    expect(listarProveedoresMock).toHaveBeenCalledTimes(1);

    const buscador = screen.getByLabelText("Buscar proveedor por nombre");
    fireEvent.change(buscador, { target: { value: "PACIFICO" } });

    expect(screen.getByText("Droguería Pacífico")).toBeInTheDocument();
    expect(screen.queryByText("Distribuidora Andes")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 de 2 proveedores coinciden");
    // El total registrado sigue visible mientras hay un filtro.
    expect(screen.getByText("2 activos de 2")).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "ándes" } });
    expect(screen.getByText("Distribuidora Andes")).toBeInTheDocument();
    expect(screen.queryByText("Droguería Pacífico")).toBeNull();

    // El filtro es local: no se pidió de nuevo la lista al servidor.
    expect(listarProveedoresMock).toHaveBeenCalledTimes(1);
  });

  it("vuelve a mostrar todas las tarjetas cuando la búsqueda queda vacía", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ supplier_id: "sup-1", name: "Distribuidora Andes" }),
      proveedor({ supplier_id: "sup-2", name: "Droguería Pacífico" }),
    ]);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    const buscador = screen.getByLabelText("Buscar proveedor por nombre");
    fireEvent.change(buscador, { target: { value: "andes" } });
    expect(screen.queryByText("Droguería Pacífico")).toBeNull();

    fireEvent.change(buscador, { target: { value: "" } });
    expect(screen.getByText("Distribuidora Andes")).toBeInTheDocument();
    expect(screen.getByText("Droguería Pacífico")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("avisa cuando ninguna tarjeta coincide con la búsqueda", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ name: "Distribuidora Andes" })]);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.change(screen.getByLabelText("Buscar proveedor por nombre"), {
      target: { value: "inexistente" },
    });

    expect(screen.getByText("No se encontraron proveedores")).toBeInTheDocument();
    expect(screen.queryByText("Distribuidora Andes")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("0 de 1 proveedores coinciden");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });

  it("mantiene las acciones y la configuración de la tarjeta filtrada", async () => {
    listarProveedoresMock.mockResolvedValue([
      proveedor({ supplier_id: "sup-1", name: "Distribuidora Andes", sources: ["src-1"] }),
      proveedor({ supplier_id: "sup-2", name: "Droguería Pacífico" }),
    ]);
    listarFuentesMock.mockResolvedValue([fuente()]);

    await renderizarProveedores();
    await screen.findByText("Droguería Pacífico");

    fireEvent.change(screen.getByLabelText("Buscar proveedor por nombre"), {
      target: { value: "andes" },
    });

    expect(screen.getByText("Sin archivo cargado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar Excel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Lista de precios Andes")).toBeInTheDocument();
  });
});
