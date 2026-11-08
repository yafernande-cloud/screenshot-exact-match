import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { ApiError } from "@/lib/api";
import type { Fuente, Proveedor } from "@/lib/proveedores-api";

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
  };
});

import { toast } from "sonner";
import {
  actualizarFuente,
  actualizarProveedor,
  crearFuente,
  crearProveedor,
  listarFuentes,
  listarProveedores,
} from "@/lib/proveedores-api";

const listarProveedoresMock = listarProveedores as unknown as Mock;
const listarFuentesMock = listarFuentes as unknown as Mock;
const crearProveedorMock = crearProveedor as unknown as Mock;
const actualizarProveedorMock = actualizarProveedor as unknown as Mock;
const crearFuenteMock = crearFuente as unknown as Mock;
const actualizarFuenteMock = actualizarFuente as unknown as Mock;
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

  it("crea un proveedor y lo agrega solo cuando la API confirma", async () => {
    const creado = proveedor({
      supplier_id: "sup-2",
      name: "Droguería Pacífico",
      version: 1,
    });
    crearProveedorMock.mockResolvedValue(creado);

    await renderizarProveedores();
    await screen.findByText(/Todavía no hay proveedores registrados/);

    fireEvent.change(screen.getByLabelText("Nombre del proveedor"), {
      target: { value: "  Droguería Pacífico  " },
    });
    fireEvent.change(screen.getByLabelText("Código interno (opcional)"), {
      target: { value: "PAC-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));

    await waitFor(() =>
      expect(crearProveedorMock).toHaveBeenCalledWith({
        name: "Droguería Pacífico",
        supplier_code: "PAC-01",
        notes: "",
      }),
    );
    expect(await screen.findByText("Droguería Pacífico")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Droguería Pacífico quedó registrado.");
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

  it("crea una fuente de archivo para el proveedor con las capacidades elegidas", async () => {
    listarProveedoresMock.mockResolvedValue([proveedor({ sources: ["src-1"] })]);
    const nueva = fuente({ name: "Lista de precios Andes", supplier_id: "sup-1" });
    crearFuenteMock.mockResolvedValue(nueva);

    await renderizarProveedores();
    await screen.findByText("Distribuidora Andes");

    fireEvent.click(screen.getByRole("button", { name: "Agregar fuente" }));
    fireEvent.change(screen.getByLabelText("Nombre de la fuente"), {
      target: { value: "Lista de precios Andes" },
    });
    // «Precios» viene marcada por defecto; se agrega «Stock disponible».
    fireEvent.click(screen.getByLabelText("Stock disponible"));
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(crearFuenteMock).toHaveBeenCalledWith({
        name: "Lista de precios Andes",
        supplier_id: "sup-1",
        capabilities: ["price", "stock"],
      }),
    );
    expect(await screen.findByText("Lista de precios Andes")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("La fuente «Lista de precios Andes» quedó creada.");
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
