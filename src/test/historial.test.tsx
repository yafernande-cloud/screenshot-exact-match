import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/** El historial solo consulta cotizaciones finalizadas y su informe guardado. */
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cotizacion-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cotizacion-api")>();
  return {
    ...actual,
    listarCotizaciones: listarCotizacionesMock,
    obtenerInforme: obtenerInformeMock,
  };
});

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

async function renderizarHistorial() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/historial"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

const finalizada = {
  quote_id: "q-9",
  title: null,
  status: "closed" as const,
  version: 4,
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T11:00:00Z",
  report_number: 1,
  report_label: "COT-000001",
  finalized_at: "2026-11-11T11:00:00Z",
  finalized_by: "u-1",
  supplier_count: 2,
  line_count: 5,
};

const informe = {
  schema_version: 1,
  quote_id: "q-9",
  title: null,
  number: 1,
  label: "COT-000001",
  finalized_at: "2026-11-11T11:00:00Z",
  finalized_by: "u-1",
  currency: "CLP",
  suppliers: [],
  items: [],
  total: { amount: "8000.00", currency: "CLP" },
  warnings: [],
  release: { released: [], pending: [] },
  note: null,
};

beforeEach(() => {
  listarCotizacionesMock.mockReset();
  listarCotizacionesMock.mockResolvedValue([]);
  obtenerInformeMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("historial de cotizaciones", () => {
  it("pide solo finalizadas y no muestra el carrito activo", async () => {
    listarCotizacionesMock.mockResolvedValue([finalizada]);

    await renderizarHistorial();

    expect(await screen.findByText("COT-000001")).toBeInTheDocument();
    expect(listarCotizacionesMock).toHaveBeenCalledWith({ finalized: true, limit: 50 });
    // Una sola fila de datos: la lista no incluye cotizaciones en preparación.
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Ver informe")).toBeInTheDocument();
  });

  it("recupera el informe guardado al abrir el detalle", async () => {
    listarCotizacionesMock.mockResolvedValue([finalizada]);
    obtenerInformeMock.mockResolvedValue({
      quote_id: "q-9",
      report_number: 1,
      report_label: "COT-000001",
      finalized_at: "2026-11-11T11:00:00Z",
      finalized_by: "u-1",
      report: informe,
    });

    await renderizarHistorial();
    fireEvent.click(await screen.findByText("Ver informe"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(obtenerInformeMock).toHaveBeenCalledWith("q-9");
    expect(screen.getByText(/Informe COT-000001/)).toBeInTheDocument();
  });

  it("muestra un estado vacío claro cuando no hay cotizaciones finalizadas", async () => {
    listarCotizacionesMock.mockResolvedValue([]);

    await renderizarHistorial();

    expect(await screen.findByText(/Todavía no hay cotizaciones finalizadas/)).toBeInTheDocument();
  });
});
