/**
 * Reintento de la finalización desde el modal de confirmación.
 *
 * Un error recuperable no cierra el modal ni toca el carrito: se muestra el mensaje y se puede
 * reintentar, reutilizando la clave de idempotencia cuando el resultado anterior fue desconocido.
 * Un cierre o cambio de estado en el servidor relee el carrito y no admite reintento con los datos
 * anteriores. La prueba del flujo exitoso vive en `carrito-cotizador.test.tsx`.
 */

import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

import { ApiError } from "@/lib/api";

const ultimaCotizacionMock = vi.hoisted(() => vi.fn());
const obtenerCotizacionMock = vi.hoisted(() => vi.fn());
const finalizarCotizacionMock = vi.hoisted(() => vi.fn());
const listarFaltantesMock = vi.hoisted(() => vi.fn());
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
// El doble refleja la regla real: un conflicto de versión es el código `VERSION_CONFLICT`.
const esConflictoDeVersionMock = vi.hoisted(
  () => (error: unknown) => (error as { code?: string })?.code === "VERSION_CONFLICT",
);

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
    crearCotizacionActiva: vi.fn(),
    agregarLinea: vi.fn(),
    cambiarCantidadLinea: vi.fn(),
    quitarLinea: vi.fn(),
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
  esConflictoDeVersion: esConflictoDeVersionMock,
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

const dialogoFinalizar = () =>
  screen.queryByRole("dialog", { name: "¿Finalizar esta cotización?" });

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

/** Abre el modal desde el botón principal y confirma una vez. */
async function confirmarUnaVez() {
  fireEvent.click(await screen.findByRole("button", { name: /Generar informe y finalizar/ }));
  fireEvent.click(screen.getByRole("button", { name: "Generar informe" }));
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
  finalizarCotizacionMock.mockReset();
  toastMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reintento de la finalización", () => {
  it("un fallo recuperable mantiene el modal, conserva el carrito y reintenta con la misma clave", async () => {
    finalizarCotizacionMock.mockRejectedValue(new ApiError(0, "NETWORK", "sin conexión"));

    await renderizarCotizador();
    await confirmarUnaVez();

    await waitFor(() => expect(finalizarCotizacionMock).toHaveBeenCalledTimes(1));
    const dialogo = dialogoFinalizar();
    expect(dialogo).not.toBeNull();
    expect(await within(dialogo!).findByRole("alert")).toHaveTextContent(/conexión/i);
    // Nada se dio por guardado: el carrito sigue visible y no hay navegación ni aviso de éxito.
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo!).getByRole("button", { name: "Generar informe" }));

    await waitFor(() => expect(finalizarCotizacionMock).toHaveBeenCalledTimes(2));
    const [primera, segunda] = finalizarCotizacionMock.mock.calls;
    // El resultado anterior fue desconocido: el reintento no puede generar un segundo informe.
    expect(primera?.[1]?.clave).toEqual(expect.any(String));
    expect(segunda?.[1]?.clave).toBe(primera?.[1]?.clave);
    // El modal sigue abierto tras el segundo fallo, con el carrito intacto para reintentar.
    expect(dialogoFinalizar()).not.toBeNull();
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
  });

  it("si la cotización ya está finalizada actualiza el carrito y no deja reintentar", async () => {
    finalizarCotizacionMock.mockRejectedValue(
      new ApiError(409, "QUOTE_ALREADY_FINALIZED", "La cotización ya generó su informe."),
    );
    // Tras el cierre, el servidor ya no devuelve un carrito activo.
    ultimaCotizacionMock.mockReset();
    ultimaCotizacionMock.mockResolvedValueOnce({ quote_id: "q-1" });
    ultimaCotizacionMock.mockResolvedValue(null);

    const router = await renderizarCotizador();
    await confirmarUnaVez();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith("La cotización ya tiene su informe guardado."),
    );
    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
    // Una sola solicitud de finalización; el carrito se releyó y quedó vacío.
    expect(finalizarCotizacionMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ultimaCotizacionMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Tu carrito está vacío/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("un conflicto de versión se trata como cambio de estado y muestra el carrito actualizado", async () => {
    finalizarCotizacionMock.mockRejectedValue(
      new ApiError(409, "VERSION_CONFLICT", "La cotización cambió."),
    );
    const detalleActualizado = {
      ...detalleGuardado,
      version: 2,
      carts: [
        {
          ...detalleGuardado.carts[0],
          version: 2,
          lines: [
            {
              ...lineaCotizada,
              version: 2,
              quantity: { value: "4", unit: "box" },
              subtotal: { amount: "6800.00", currency: "CLP" },
            },
          ],
        },
      ],
    };
    obtenerCotizacionMock.mockReset();
    obtenerCotizacionMock.mockResolvedValueOnce(detalleGuardado);
    obtenerCotizacionMock.mockResolvedValue(detalleActualizado);

    await renderizarCotizador();
    await confirmarUnaVez();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "La cotización cambió de estado. Actualizamos el carrito con lo más reciente.",
      ),
    );
    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
    // No se repite la finalización con la versión anterior: se muestra lo que hay en el servidor.
    expect(finalizarCotizacionMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByDisplayValue("4")).toBeInTheDocument();
    expect(obtenerCotizacionMock).toHaveBeenCalledTimes(2);
  });
});
