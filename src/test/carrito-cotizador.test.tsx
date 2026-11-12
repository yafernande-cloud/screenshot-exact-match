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
const crearCotizacionActivaMock = vi.hoisted(() => vi.fn());
const obtenerCotizacionMock = vi.hoisted(() => vi.fn());
const finalizarCotizacionMock = vi.hoisted(() => vi.fn());
const cambiarCantidadMock = vi.hoisted(() => vi.fn());
const quitarLineaMock = vi.hoisted(() => vi.fn());
const listarFaltantesMock = vi.hoisted(() => vi.fn());
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: toastMock };
});

vi.mock("@/lib/cotizacion-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cotizacion-api")>();
  return {
    ...actual,
    ultimaCotizacionEnPreparacion: ultimaCotizacionMock,
    obtenerCotizacion: obtenerCotizacionMock,
    crearCotizacion: vi.fn(),
    crearCotizacionActiva: crearCotizacionActivaMock,
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

const informeFinalizado = {
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

/** Respuesta real del backend al finalizar, tal como la consume el cotizador. */
function responderFinalizacion() {
  finalizarCotizacionMock.mockResolvedValue({
    quote: {
      quote_id: "q-1",
      status: "closed",
      version: 2,
      report_number: 1,
      report_label: "COT-000001",
    },
    report: informeFinalizado,
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
    report: informeFinalizado,
  });
}

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
  crearCotizacionActivaMock.mockReset();
  obtenerCotizacionMock.mockReset();
  obtenerCotizacionMock.mockResolvedValue(detalleGuardado);
  cambiarCantidadMock.mockReset();
  quitarLineaMock.mockReset();
  finalizarCotizacionMock.mockReset();
  toastMock.mockReset();
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

  it("refresca la bandeja cuando cambia la cantidad de una línea", async () => {
    cambiarCantidadMock.mockResolvedValue({ line: lineaCotizada, cart: {}, warnings: [] });

    await renderizarCotizador();
    expect(await screen.findByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    listarFaltantesMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));

    // D-155: la cantidad operativa del faltante sigue a la línea; la bandeja se vuelve a leer.
    await waitFor(() => expect(listarFaltantesMock).toHaveBeenCalled());
  });

  it("pide confirmación con el nombre real antes de quitar una línea", async () => {
    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );

    const dialogo = screen.getByRole("dialog", { name: "Confirmar quitar Ibuprofeno 400 mg" });
    expect(dialogo).toHaveTextContent("¿Quitar «Ibuprofeno 400 mg» de la cotización?");
    expect(dialogo).toHaveTextContent("Se quitará del carrito de Proveedor Uno.");
    expect(quitarLineaMock).not.toHaveBeenCalled();
  });

  it("cancelar cierra el diálogo sin modificar la cotización", async () => {
    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Confirmar quitar Ibuprofeno 400 mg" })).toBeNull();
    expect(quitarLineaMock).not.toHaveBeenCalled();
    expect(obtenerCotizacionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
  });

  it("confirmar quita solo la línea seleccionada y refresca los faltantes", async () => {
    quitarLineaMock.mockResolvedValue({ ...lineaCotizada, status: "removed" });

    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar producto" }));

    await waitFor(() => expect(quitarLineaMock).toHaveBeenCalledWith("q-1", "l-1"));
    expect(screen.queryByRole("dialog", { name: "Confirmar quitar Ibuprofeno 400 mg" })).toBeNull();
    expect(listarFaltantesMock).toHaveBeenCalled();
    expect(cambiarCantidadMock).not.toHaveBeenCalled();
    expect(finalizarCotizacionMock).not.toHaveBeenCalled();
  });

  it("un doble clic en confirmar ejecuta la eliminación una sola vez", async () => {
    quitarLineaMock.mockResolvedValue({ ...lineaCotizada, status: "removed" });

    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );
    const confirmar = screen.getByRole("button", { name: "Sí, quitar producto" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(quitarLineaMock).toHaveBeenCalledTimes(1));
  });

  it("si la eliminación falla muestra el error y conserva la cotización", async () => {
    quitarLineaMock.mockRejectedValue(new Error("No se pudo quitar la línea."));

    await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: "Quitar Ibuprofeno 400 mg de Proveedor Uno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar producto" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith("No se pudo quitar la línea."));
    // Se vuelve a leer el carrito del servidor: la línea sigue en su lugar.
    await waitFor(() => expect(obtenerCotizacionMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
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

  it("un error de red al releer el carrito no borra las líneas ya mostradas", async () => {
    cambiarCantidadMock.mockRejectedValue(new Error("sin conexión"));
    // Primera lectura (al montar) bien; la relectura posterior falla por red.
    obtenerCotizacionMock.mockResolvedValueOnce(detalleGuardado);
    obtenerCotizacionMock.mockRejectedValueOnce(new Error("sin conexión"));

    await renderizarCotizador();
    expect(await screen.findByText("Ibuprofeno 400 mg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));

    await waitFor(() => expect(obtenerCotizacionMock).toHaveBeenCalledTimes(2));
    // El fallo de relectura no vacía la cotización: lo mostrado se conserva.
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    expect(screen.queryByText(/Tu carrito está vacío/)).toBeNull();
  });

  it("sin carrito activo el cotizador queda vacío y no crea un borrador por cargar", async () => {
    // Esto es lo que ve la pantalla al recargar después de finalizar: el borrador anterior al
    // último cierre no es el carrito vigente y el servidor no devuelve ninguno.
    ultimaCotizacionMock.mockReset();
    ultimaCotizacionMock.mockResolvedValue(null);

    await renderizarCotizador();

    expect(await screen.findByText(/Tu carrito está vacío/)).toBeInTheDocument();
    expect(screen.queryByText("Ibuprofeno 400 mg")).toBeNull();
    expect(obtenerCotizacionMock).not.toHaveBeenCalled();
    // El borrador se crea recién al agregar el primer producto.
    expect(crearCotizacionActivaMock).not.toHaveBeenCalled();
  });

  it("«Generar orden de compra» finaliza y redirige a la orden recién generada", async () => {
    responderFinalizacion();

    const router = await renderizarCotizador();
    fireEvent.click(
      await screen.findByRole("button", { name: /Generar orden de compra y finalizar/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));

    await waitFor(() =>
      expect(finalizarCotizacionMock).toHaveBeenCalledWith("q-1", {
        version: 1,
        clave: expect.any(String),
      }),
    );
    // Ya no se queda en el carrito cerrado: el historial abre la orden recién generada.
    await waitFor(() => expect(router.state.location.pathname).toBe("/historial"));
    expect(router.state.location.search).toMatchObject({ informe: "q-1" });
    expect(
      await screen.findByRole("article", { name: "Orden de compra COT-000001" }),
    ).toBeInTheDocument();
  });
});
