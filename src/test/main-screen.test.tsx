import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { Faltante } from "@/lib/faltantes-api";

/**
 * Monta la pantalla principal con una sesión ya autorizada. Es el único estado en el que se
 * renderizan `AppSidebar` y `MenuPrincipal`, que consumen `useSidebar()`; así se comprueba que el
 * proveedor envuelve de verdad a toda la aplicación.
 */
/** La bandeja real consulta el backend al montar; cada prueba decide qué responde. */
const listarFaltantesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/faltantes-api", () => ({
  listarFaltantes: listarFaltantesMock,
  fijarCantidad: vi.fn(),
  cancelarFaltante: vi.fn(),
  esConflictoDeVersion: () => false,
  mensajeDeErrorFaltantes: () => "No pudimos cargar los faltantes.",
}));

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

const SIDEBAR_ERROR = "useSidebar must be used within a SidebarProvider.";

const reporteReal: Faltante = {
  id: "f-1",
  display_name: "Omeprazol 20 mg",
  ingredient: "omeprazol",
  status: "active",
  version: 3,
  observation_count: 1,
  reporters: ["Pato"],
  data_origin: "captured",
  created_at: "2026-11-05T10:00:00Z",
  reported_by: "u-1",
  reported_by_name: "Pato",
  branch_label: "Parque Lantaño",
  declared_quantity: "2",
  declared_unit: "box",
  requested_quantity: "2",
  requested_unit: "box",
  requested_quantity_origin: "explicit",
  target_quantity: null,
  quantity_unit: null,
  quantity_status: "unknown",
  needs_quantity: true,
  reported_at: "2026-11-05T10:00:00Z",
  cancelled_at: null,
  last_raw_text: null,
};

function consoleOutput(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .flat()
    .map((value) => (value instanceof Error ? value.message : String(value)))
    .join(" ");
}

async function renderizarPantalla() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();

  render(<RouterProvider router={router} />);
}

describe("pantalla principal con sesión autorizada", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listarFaltantesMock.mockReset();
    listarFaltantesMock.mockResolvedValue([]);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza el cotizador y el menú lateral dentro de SidebarProvider", async () => {
    await renderizarPantalla();

    expect(await screen.findByRole("heading", { name: "Buscar producto" })).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="sidebar"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: /Mis cotizaciones/i })).toBeInTheDocument();
    expect(consoleOutput(errorSpy)).not.toContain(SIDEBAR_ERROR);
  });

  it("muestra el faltante real del backend con producto, cantidad, auxiliar y estado", async () => {
    listarFaltantesMock.mockResolvedValue([reporteReal]);

    await renderizarPantalla();

    expect(await screen.findByText("Omeprazol 20 mg")).toBeInTheDocument();
    expect(screen.getByText("Pato")).toBeInTheDocument();
    expect(screen.getByText(/Solicitado: 2 cajas/)).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.queryByText(/Juanito Pérez|María González|Pedro Soto/)).toBeNull();
  });

  it("muestra un error claro y nunca cae a reportes ficticios si falla la API", async () => {
    listarFaltantesMock.mockRejectedValue(new Error("sin conexión"));

    await renderizarPantalla();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar los faltantes.");
    expect(screen.queryByText(/Juanito Pérez|María González|Pedro Soto/)).toBeNull();
    expect(screen.queryByText(/No hay faltantes pendientes/)).toBeNull();
  });
});
