import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { cotizacionFinalizada, informeRecuperado } from "@/test/historial-fixtures";

/** El historial solo consulta cotizaciones finalizadas y su informe guardado. */
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());
const generarInformePdfMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cotizacion-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cotizacion-api")>();
  return {
    ...actual,
    listarCotizaciones: listarCotizacionesMock,
    obtenerInforme: obtenerInformeMock,
  };
});

// El PDF se prueba en historial-pdf.test.tsx; aquí solo se comprueba la vista y sus botones.
vi.mock("@/lib/informe-pdf", () => ({
  generarInformePdf: generarInformePdfMock,
  nombreArchivoInforme: vi.fn(),
  descargarInformePdf: vi.fn(),
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

async function renderizarHistorial(entrada = "/historial") {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [entrada] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  listarCotizacionesMock.mockReset();
  listarCotizacionesMock.mockResolvedValue([]);
  obtenerInformeMock.mockReset();
  generarInformePdfMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("historial de cotizaciones", () => {
  it("pide solo finalizadas y no muestra el carrito activo", async () => {
    listarCotizacionesMock.mockResolvedValue([cotizacionFinalizada]);

    await renderizarHistorial();

    expect(await screen.findByText("COT-000001")).toBeInTheDocument();
    expect(listarCotizacionesMock).toHaveBeenCalledWith({ finalized: true, limit: 50 });
    // Una sola fila de datos: la lista no incluye cotizaciones en preparación.
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Ver vista/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver orden de compra/ })).toBeInTheDocument();
  });

  it("distingue referencias de productos distintos y muestra cantidades por unidad", async () => {
    listarCotizacionesMock.mockResolvedValue([cotizacionFinalizada]);

    await renderizarHistorial();

    const fila = (await screen.findByText("COT-000001")).closest("tr")!;
    // «Referencias» conserva line_count; los productos distintos se anuncian aparte.
    expect(fila).toHaveTextContent("5");
    expect(fila).toHaveTextContent("3 productos distintos");
    // Las cantidades nunca se suman entre unidades comerciales distintas.
    expect(fila).toHaveTextContent("6 cajas + 2 unidades");
  });

  it("sigue mostrando filas de un backend anterior, sin resumen de cantidades", async () => {
    const {
      distinct_product_count: _productos,
      quantity_totals: _cantidades,
      ...anteriores
    } = cotizacionFinalizada;
    listarCotizacionesMock.mockResolvedValue([anteriores]);

    await renderizarHistorial();

    const fila = (await screen.findByText("COT-000001")).closest("tr")!;
    expect(fila).toHaveTextContent("5");
    expect(fila).not.toHaveTextContent(/productos? distintos?/);
    expect(fila).toHaveTextContent("—");
  });

  it("recupera el informe guardado al abrir la vista", async () => {
    listarCotizacionesMock.mockResolvedValue([cotizacionFinalizada]);
    obtenerInformeMock.mockResolvedValue(informeRecuperado);

    await renderizarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: /Ver vista/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(obtenerInformeMock).toHaveBeenCalledWith("q-9");
    expect(screen.getByText(/Orden de compra COT-000001/)).toBeInTheDocument();
    expect(generarInformePdfMock).not.toHaveBeenCalled();
  });

  it("muestra un estado vacío claro cuando no hay cotizaciones finalizadas", async () => {
    listarCotizacionesMock.mockResolvedValue([]);

    await renderizarHistorial();

    expect(await screen.findByText(/Todavía no hay cotizaciones finalizadas/)).toBeInTheDocument();
  });

  it("abre automáticamente la vista indicada en la URL", async () => {
    listarCotizacionesMock.mockResolvedValue([cotizacionFinalizada]);
    obtenerInformeMock.mockResolvedValue(informeRecuperado);

    await renderizarHistorial("/historial?informe=q-9");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(obtenerInformeMock).toHaveBeenCalledWith("q-9");
    expect(screen.getByText(/Orden de compra COT-000001/)).toBeInTheDocument();
  });
});
