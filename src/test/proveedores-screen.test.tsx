import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { ApiError } from "@/lib/api";
import type { Fuente, Proveedor, VistaPreviaImportacion } from "@/lib/proveedores-api";

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
    obtenerPerfilImportacion: vi.fn(),
    guardarPerfilImportacion: vi.fn(),
    previsualizarImportacion: vi.fn(),
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
  obtenerPerfilImportacion,
  previsualizarImportacion,
} from "@/lib/proveedores-api";

const listarProveedoresMock = listarProveedores as unknown as Mock;
const listarFuentesMock = listarFuentes as unknown as Mock;
const crearProveedorMock = crearProveedor as unknown as Mock;
const actualizarProveedorMock = actualizarProveedor as unknown as Mock;
const crearFuenteMock = crearFuente as unknown as Mock;
const actualizarFuenteMock = actualizarFuente as unknown as Mock;
const obtenerPerfilMock = obtenerPerfilImportacion as unknown as Mock;
const guardarPerfilMock = guardarPerfilImportacion as unknown as Mock;
const previsualizarMock = previsualizarImportacion as unknown as Mock;
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

function vistaPrevia(overrides: Partial<VistaPreviaImportacion> = {}): VistaPreviaImportacion {
  return {
    file_format: "csv",
    sheets: [],
    sheet: null,
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
  obtenerPerfilMock.mockReset();
  obtenerPerfilMock.mockResolvedValue({ profile: null, version: 0 });
  guardarPerfilMock.mockReset();
  previsualizarMock.mockReset();
  importarMock.mockReset();
  listarOfertasMock.mockReset();
  listarOfertasMock.mockResolvedValue([]);
  claveMock.mockReset();
  claveMock.mockReturnValue("clave-prueba");
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("pantalla de proveedores", () => {
  it("muestra los proveedores y fuentes reales, sin datos de demostración", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);

    await renderizarProveedores();

    expect(await screen.findByText("Distribuidora Andes")).toBeInTheDocument();
    expect(screen.getByText("Lista de precios Andes")).toBeInTheDocument();
    expect(screen.getByText("1 activos de 1")).toBeInTheDocument();
    expect(screen.queryByText(/\(demo\)/)).toBeNull();
    expect(screen.queryByText(/No se guardan|no se guardan/)).toBeNull();
    expect(screen.queryByText("Laboratorio Sur")).toBeNull();
    expect(screen.queryByText("Proveedor X")).toBeNull();
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
    expect(await screen.findByText("Lista de precios · Droguería Pacífico")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Droguería Pacífico quedó registrado. Carga su lista de precios en la tarjeta del proveedor.",
    );
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
    expect(await screen.findByText("Credenciales guardadas · sin conectar")).toBeInTheDocument();
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
    expect(await screen.findByText("Lista de precios · Droguería Pacífico")).toBeInTheDocument();
    expect(screen.getByText("Credenciales guardadas · sin conectar")).toBeInTheDocument();
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

    const interruptor = screen.getByRole("switch", {
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

    expect(await screen.findByText("Credenciales guardadas · sin conectar")).toBeInTheDocument();
    expect(screen.getByText("https://compras.andes.cl")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Cambiar datos" }));
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
    expect(await screen.findByText("Credenciales guardadas · sin conectar")).toBeInTheDocument();
  });

  it("agrega una lista de precios a un proveedor que todavía no tiene fuente", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor()]);
    crearFuenteMock.mockResolvedValue(
      fuente({ source_id: "src-nueva", name: "Lista de precios · Distribuidora Andes" }),
    );

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Agregar lista de precios" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Agregar fuente" }));
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
    await screen.findByText("Lista de precios Andes");

    fireEvent.click(
      screen.getByRole("switch", { name: "Activar o desactivar Lista de precios Andes" }),
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

  it("lee la vista previa de un archivo real y guarda el mapeo antes de importar", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    listarFuentesMock.mockResolvedValue([fuente()]);
    previsualizarMock.mockResolvedValue(vistaPrevia());
    guardarPerfilMock.mockResolvedValue({
      source_id: "src-1",
      file_format: "csv",
      sheet: null,
      header_row: 1,
      columns: {
        sku: { position: 1 },
        name: { position: 2 },
        price: { position: 3 },
        sale_unit: { position: 4 },
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

    fireEvent.click(screen.getByRole("button", { name: "Cargar lista" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Guardar e importar" }));

    await waitFor(() =>
      expect(guardarPerfilMock).toHaveBeenCalledWith(
        "src-1",
        {
          file_format: "csv",
          sheet: null,
          header_row: 1,
          columns: {
            sku: { position: 1 },
            name: { position: 2 },
            price: { position: 3 },
            sale_unit: { position: 4 },
          },
          units: { caja: "box" },
          options: {
            decimal_separator: ".",
            create_missing_items: false,
            currency: "CLP",
            price_basis: "per_commercial_unit",
          },
        },
        0,
      ),
    );
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

    fireEvent.click(screen.getByRole("button", { name: "Cargar lista" }));
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
    listarProveedoresMock.mockResolvedValue([proveedor()]);
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

    fireEvent.click(screen.getByRole("button", { name: "Ver precios" }));

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

    fireEvent.click(
      screen.getByRole("switch", { name: "Activar o desactivar Distribuidora Andes" }),
    );

    await waitFor(() => expect(listarProveedoresMock).toHaveBeenCalledTimes(2));
    expect(toastError).toHaveBeenCalledWith(
      "Otro cambio se guardó primero. Actualizamos la lista; revisa los datos antes de volver a guardar.",
    );
  });
});
