import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * El carrito activo vive en el servidor: al montar se recupera la cotización en borrador más
 * reciente y cada acción (cantidad, quitar, finalizar) es una llamada al backend. Aquí se dobla el
 * cliente HTTP para comprobar el contrato que se envía y lo que se muestra.
 */
const ultimaCotizacionMock = vi.hoisted(() => vi.fn());
const obtenerCotizacionMock = vi.hoisted(() => vi.fn());
const finalizarCotizacionMock = vi.hoisted(() => vi.fn());
const cambiarCantidadMock = vi.hoisted(() => vi.fn());
const quitarLineaMock = vi.hoisted(() => vi.fn());
const listarFaltantesMock = vi.hoisted(() => vi.fn());
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cotizacion-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cotizacion-api")>();
  return {
    ...actual,
    ultimaCotizacionEnPreparacion: ultimaCotizacionMock,
    obtenerCotizacion: obtenerCotizacionMock,
    crearCotizacion: vi.fn(),
    agregarLinea: vi.fn(),
    cambiarCantidadLinea: cambiarCantidadMock,
    quitarLinea: quitarLineaMock,
    finalizarCotizacion: finalizarCotizacionMock,
    listarCotizaciones: listarCotizacionesMock,
    obtenerInforme: obtenerInformeMock,
  };
});

vi.mock("@/lib/faltantes-api", () => ({
  listarFaltantes: listarFaltantesMock,
  cargarFotografia: vi.fn(),
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

const lineaCotizada = {
  line_id: "l-1",
  quote_id: "q-1",
  quote_cart_id: "c-1",
  supplier_id: "s-1",
  offer_snapshot_id: "o-1",
  trade_item_id: "t-1",
  product: {
    name: "Ibuprofeno 400 mg",
    laboratory: "ASCEND",
    brand: null,
    presentation: "Caja de 20 comprimidos",
    code: "IBU-400",
  },
  unit_price: {
    amount: "1700.00",
    currency: "CLP",
    basis: "per_commercial_unit",
    sale_unit: "box",
  },
  subtotal: { amount: "5100.00", currency: "CLP" },
  quantity: { value: "3", unit: "box" },
  status: "active" as const,
  removed_at: null,
  removed_by: null,
  demand_item_id: null,
  coverage_relation: null,
  demand_allocations: [],
  price_state: "complete",
  causes: [],
  warnings: [],
  version: 1,
  added_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T10:00:00Z",
};

const detalleGuardado = {
  quote_id: "q-1",
  title: null,
  status: "draft" as const,
  version: 1,
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T10:00:00Z",
  report_number: null,
  report_label: null,
  finalized_at: null,
  finalized_by: null,
  data_origin: "captured",
  derived_state: "draft",
  carts: [
    {
      cart_id: "c-1",
      supplier_id: "s-1",
      supplier_name: "Proveedor Uno",
      status: "active" as const,
      line_count: 1,
      version: 1,
      created_at: "2026-11-11T10:00:00Z",
      updated_at: "2026-11-11T10:00:00Z",
      derived_state: "draft",
      lines: [lineaCotizada],
    },
  ],
  coverage: [],
  estimated_total: {},
};

async function renderizarCotizador() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  listarFaltantesMock.mockReset();
  listarFaltantesMock.mockResolvedValue([]);
  listarCotizacionesMock.mockReset();
  listarCotizacionesMock.mockResolvedValue([]);
  obtenerInformeMock.mockReset();
  ultimaCotizacionMock.mockReset();
  ultimaCotizacionMock.mockResolvedValue({ quote_id: "q-1" });
  obtenerCotizacionMock.mockReset();
  obtenerCotizacionMock.mockResolvedValue(detalleGuardado);
  cambiarCantidadMock.mockReset();
  quitarLineaMock.mockReset();
  finalizarCotizacionMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("carrito persistente en el cotizador", () => {
  it("recupera la cotización guardada con producto, proveedor, cantidad y subtotal", async () => {
    await renderizarCotizador();

    expect(await screen.findByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    expect(screen.getByText(/Proveedor Uno/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    // El subtotal aparece en la línea, en su proveedor y en el total general.
    expect(screen.getAllByText("$5.100").length).toBeGreaterThan(0);
    expect(screen.getByText(/Total general/).parentElement).toHaveTextContent("$5.100");
  });

  it("envía la cantidad nueva con la versión de la línea", async () => {
    cambiarCantidadMock.mockResolvedValue({ line: lineaCotizada, cart: {}, warnings: [] });

    await renderizarCotizador();
    fireEvent.click(await screen.findByRole("button", { name: "Aumentar" }));

    await waitFor(() =>
      expect(cambiarCantidadMock).toHaveBeenCalledWith("q-1", "l-1", {
        quantity: "4",
        unit: "box",
        version: 1,
      }),
    );
  });

  it("quita una línea de forma lógica sin tocar los faltantes", async () => {
    quitarLineaMock.mockResolvedValue({ ...lineaCotizada, status: "removed" });

    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );

    await waitFor(() => expect(quitarLineaMock).toHaveBeenCalledWith("q-1", "l-1"));
    expect(listarFaltantesMock).toHaveBeenCalled();
  });

  it("declara la base del precio no confirmada y envía la unidad nula", async () => {
    const lineaSinTerminos = {
      ...lineaCotizada,
      unit_price: { ...lineaCotizada.unit_price, basis: null, sale_unit: null },
      quantity: { value: "2", unit: null },
    };
    obtenerCotizacionMock.mockResolvedValue({
      ...detalleGuardado,
      carts: [{ ...detalleGuardado.carts[0], lines: [lineaSinTerminos] }],
    });
    cambiarCantidadMock.mockResolvedValue({ line: lineaSinTerminos, cart: {}, warnings: [] });

    await renderizarCotizador();
    expect(await screen.findByText("Base del precio no confirmada")).toBeInTheDocument();
    expect(screen.queryByText(/por unidad comercial/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    await waitFor(() =>
      expect(cambiarCantidadMock).toHaveBeenCalledWith("q-1", "l-1", {
        quantity: "3",
        unit: null,
        version: 1,
      }),
    );
  });

  it("finaliza con versión y clave, y redirige al informe recién generado", async () => {
    const informe = {
      schema_version: 1,
      quote_id: "q-1",
      title: null,
      number: 1,
      label: "COT-000001",
      finalized_at: "2026-11-11T12:00:00Z",
      finalized_by: "u-1",
      currency: "CLP",
      suppliers: [
        {
          supplier_id: "s-1",
          supplier_name: "Proveedor Uno",
          line_count: 1,
          subtotal: { amount: "5100.00", currency: "CLP" },
        },
      ],
      items: [],
      total: { amount: "5100.00", currency: "CLP" },
      warnings: [],
      release: { released: [], pending: [] },
      note: null,
    };
    finalizarCotizacionMock.mockResolvedValue({
      quote: {
        quote_id: "q-1",
        status: "closed",
        version: 2,
        report_number: 1,
        report_label: "COT-000001",
      },
      report: informe,
      released: [],
      pending: [],
      deduplicated: false,
    });
    obtenerInformeMock.mockResolvedValue({
      quote_id: "q-1",
      report_number: 1,
      report_label: "COT-000001",
      finalized_at: "2026-11-11T12:00:00Z",
      finalized_by: "u-1",
      report: informe,
    });

    const router = await renderizarCotizador();
    fireEvent.click(await screen.findByRole("button", { name: /Generar informe y finalizar/ }));

    await waitFor(() =>
      expect(finalizarCotizacionMock).toHaveBeenCalledWith("q-1", {
        version: 1,
        clave: expect.any(String),
      }),
    );
    // Ya no se queda en el carrito cerrado: el historial abre el informe recién generado.
    await waitFor(() => expect(router.state.location.pathname).toBe("/historial"));
    expect(router.state.location.search).toMatchObject({ informe: "q-1" });
    expect(await screen.findByRole("article", { name: "Informe COT-000001" })).toBeInTheDocument();
  });
});
