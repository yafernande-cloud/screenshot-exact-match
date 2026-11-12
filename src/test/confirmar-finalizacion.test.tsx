/**
 * Confirmación previa a finalizar la cotización.
 *
 * «Generar orden de compra y finalizar» nunca llama al backend por sí solo: abre un modal con el resumen
 * del carrito y la finalización se ejecuta únicamente al confirmarla. Aquí se prueba el carrito
 * como componente, con sus acciones dobladas; la prueba del flujo completo —finalizar, navegar al
 * historial y ver la orden de compra— vive en `carrito-cotizador.test.tsx`.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SeccionCotizaciones,
  type AccionesCotizacion,
  type ResultadoFinalizar,
} from "@/components/MiCotizacion";
import type { CarritoCotizacion, DetalleCotizacion, LineaCotizacion } from "@/lib/cotizacion-api";

const linea: LineaCotizacion = {
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
  status: "active",
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

const carrito: CarritoCotizacion = {
  cart_id: "c-1",
  supplier_id: "s-1",
  supplier_name: "Proveedor Uno",
  status: "active",
  line_count: 1,
  version: 1,
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T10:00:00Z",
  derived_state: "draft",
  lines: [linea],
};

const detalle: DetalleCotizacion = {
  quote_id: "q-1",
  title: null,
  status: "draft",
  version: 1,
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T10:00:00Z",
  report_number: null,
  report_label: null,
  finalized_at: null,
  finalized_by: null,
  data_origin: "captured",
  derived_state: "draft",
  carts: [carrito],
  coverage: [],
  estimated_total: {},
};

function renderizarCarrito(opciones?: {
  detalle?: DetalleCotizacion;
  onFinalizar?: () => Promise<ResultadoFinalizar>;
}) {
  const onFinalizar = vi.fn(
    opciones?.onFinalizar ?? (async () => ({ estado: "finalizada" }) as ResultadoFinalizar),
  );
  const acciones: AccionesCotizacion = {
    onCantidad: vi.fn(),
    onQuitar: vi.fn(),
    onVaciar: vi.fn(),
    onFinalizar,
    ocupadas: new Set<string>(),
    finalizando: false,
  };
  render(<SeccionCotizaciones detalle={opciones?.detalle ?? detalle} acciones={acciones} />);
  return { acciones, onFinalizar };
}

const abrirModal = () =>
  fireEvent.click(screen.getByRole("button", { name: /Generar orden de compra y finalizar/ }));

const dialogoFinalizar = () =>
  screen.queryByRole("dialog", { name: "¿Finalizar esta cotización?" });

describe("confirmación antes de finalizar la cotización", () => {
  it("muestra el resumen del carrito y no finaliza hasta confirmar", () => {
    const { onFinalizar } = renderizarCarrito();
    abrirModal();

    const dialogo = dialogoFinalizar();
    expect(dialogo).not.toBeNull();
    // Resumen del carrito actual: referencias, proveedores, cantidades y total.
    const resumen = within(dialogo!);
    expect(resumen.getByText("Referencia")).toBeInTheDocument();
    expect(resumen.getByText("Proveedor")).toBeInTheDocument();
    expect(resumen.getByText("Total")).toBeInTheDocument();
    expect(resumen.getAllByText("1")).toHaveLength(2);
    expect(resumen.getByText("$5.100")).toBeInTheDocument();
    // La cantidad solicitada se muestra con su unidad comercial, sin inventar equivalencias.
    expect(dialogo).toHaveTextContent("Cantidades solicitadas: 3 cajas");
    expect(dialogo).toHaveTextContent(
      "Estás por generar la orden de compra definitiva con los productos que tienes actualmente en el carrito. ¿Quieres agregar más productos o generarla ahora?",
    );
    // Sin faltantes de Telegram asociados la advertencia se omite.
    expect(dialogo).not.toHaveTextContent(/faltantes? de Telegram/);
    expect(onFinalizar).not.toHaveBeenCalled();
  });

  it("«Seguir agregando» cierra el modal y conserva el carrito sin ejecutar nada", () => {
    const { acciones, onFinalizar } = renderizarCarrito();
    abrirModal();
    fireEvent.click(screen.getByRole("button", { name: "Seguir agregando" }));

    expect(dialogoFinalizar()).toBeNull();
    expect(onFinalizar).not.toHaveBeenCalled();
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    // Se puede seguir editando: la cantidad vuelve a estar disponible.
    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(acciones.onCantidad).toHaveBeenCalledWith(linea, 4);
  });

  it("Escape cierra el modal sin finalizar", () => {
    const { onFinalizar } = renderizarCarrito();
    abrirModal();

    fireEvent.keyDown(dialogoFinalizar()!, { key: "Escape" });

    expect(dialogoFinalizar()).toBeNull();
    expect(onFinalizar).not.toHaveBeenCalled();
  });

  it("«Generar orden de compra» recién ahí ejecuta la finalización", async () => {
    const { onFinalizar } = renderizarCarrito();
    abrirModal();
    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
  });

  it("mientras finaliza deshabilita ambos botones y no envía dos veces", async () => {
    let resolver: (resultado: ResultadoFinalizar) => void = () => {};
    const { onFinalizar } = renderizarCarrito({
      onFinalizar: () =>
        new Promise<ResultadoFinalizar>((resolverPromesa) => {
          resolver = resolverPromesa;
        }),
    });
    abrirModal();
    const confirmar = screen.getByRole("button", { name: "Generar orden de compra" });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole("button", { name: "Seguir agregando" })).toBeDisabled();

    resolver({ estado: "finalizada" });
    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
  });

  it("un error recuperable mantiene el modal abierto, muestra el mensaje y permite reintentar", async () => {
    const onFinalizar = vi
      .fn<() => Promise<ResultadoFinalizar>>()
      .mockResolvedValueOnce({
        estado: "error",
        mensaje: "La cotización tiene asignaciones inconsistentes.",
      })
      .mockResolvedValueOnce({ estado: "finalizada" });
    renderizarCarrito({ onFinalizar });
    abrirModal();

    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));

    // El modal sigue abierto con el error del intento; el carrito no se tocó.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "La cotización tiene asignaciones inconsistentes.",
      ),
    );
    expect(dialogoFinalizar()).not.toBeNull();
    expect(screen.getByText("Ibuprofeno 400 mg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();

    // Cada clic dispara una sola solicitud; el segundo intento recién cierra al confirmarse.
    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));
    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("una acción que falla sin veredicto también deja reintentar", async () => {
    const { onFinalizar } = renderizarCarrito({
      onFinalizar: async () => {
        throw new Error("No se pudo finalizar la cotización.");
      },
    });
    abrirModal();
    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo finalizar la cotización.");
    expect(dialogoFinalizar()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Generar orden de compra" })).toBeEnabled();
  });

  it("si la cotización cambió de estado cierra el modal sin dejar reintentar", async () => {
    const onFinalizar = vi
      .fn<() => Promise<ResultadoFinalizar>>()
      .mockResolvedValue({ estado: "estado_cambiado" });
    renderizarCarrito({ onFinalizar });
    abrirModal();

    fireEvent.click(screen.getByRole("button", { name: "Generar orden de compra" }));

    await waitFor(() => expect(dialogoFinalizar()).toBeNull());
    expect(onFinalizar).toHaveBeenCalledTimes(1);
    // No se muestra un error reintentable: el carrito se actualizó en el cotizador.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("advierte solo los faltantes asociados que quedarán completamente cubiertos", () => {
    const lineaConFaltantes: LineaCotizacion = {
      ...linea,
      demand_item_id: "d-1",
      demand_allocations: [
        { demand_item_id: "d-1", quantity: "1" },
        { demand_item_id: "d-3", quantity: "1" },
      ],
    };
    renderizarCarrito({
      detalle: {
        ...detalle,
        carts: [{ ...carrito, lines: [lineaConFaltantes] }],
        coverage: [
          // Cubierto: el servidor informa cantidad pendiente 0 con cantidad pedida conocida.
          {
            demand_item_id: "d-1",
            display_name: "Losartán 50 mg",
            target_quantity: "2",
            pending_quantity: "0",
          },
          // Asociado pero todavía sin cubrir: no se anuncia que se libere.
          {
            demand_item_id: "d-3",
            display_name: "Metformina 850 mg",
            target_quantity: "4",
            pending_quantity: "2",
          },
        ],
      },
    });
    abrirModal();

    const dialogo = dialogoFinalizar()!;
    expect(dialogo).toHaveTextContent("2 faltantes de Telegram");
    expect(dialogo).toHaveTextContent("Losartán 50 mg");
    expect(dialogo).not.toHaveTextContent("Metformina 850 mg");
  });
});
