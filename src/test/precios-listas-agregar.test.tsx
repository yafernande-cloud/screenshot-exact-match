import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TarjetaPrecioLista } from "@/components/PreciosListasCargadas";
import type { OfertaImportada } from "@/lib/proveedores-api";

/**
 * Alta en la cotización desde un precio de lista cargada.
 *
 * La tarjeta solo habilita la acción cuando la lista declara un precio válido y, si informó stock,
 * existencias. Un stock no informado no es una falta: no bloquea la cotización.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

function ofertaLista(over: Partial<OfertaImportada> = {}): OfertaImportada {
  return {
    offer_id: "of-lista-1",
    source_id: "src-andes",
    source_name: "Distribuidora Andes",
    source_mode: "manual_import",
    external_id: "AND-100",
    external_name: "Paracetamol 500 mg",
    trade_item_id: "art-paracetamol",
    trade_item_name: "Paracetamol 500 mg comprimidos",
    price_amount: "12990",
    currency: "CLP",
    price_basis: "per_commercial_unit",
    sale_unit: "box",
    sale_unit_text: null,
    pack_units_per_commercial_unit: null,
    pack_base_unit: null,
    stock_status: "unknown",
    stock_quantity: null,
    stock_unit: null,
    review_status: "accepted",
    notes: null,
    valid_from: null,
    valid_to: null,
    is_current: true,
    fresh_until: "2099-01-01T00:00:00Z",
    is_stale: false,
    observed_at: "2026-11-10T09:00:00Z",
    imported_at: "2026-11-10T09:00:00Z",
    ...over,
  };
}

function renderizar(
  over: Partial<OfertaImportada> = {},
  props: { onAgregar?: () => void; agregando?: boolean } = {},
) {
  const { onAgregar = vi.fn(), agregando = false } = props;
  render(
    <TarjetaPrecioLista
      oferta={ofertaLista(over)}
      proveedor="Distribuidora Andes"
      proveedorId="sup-andes"
      onAgregar={onAgregar}
      agregando={agregando}
    />,
  );
  const tarjeta = screen.getByRole("article", {
    name: /^Precio de lista de Distribuidora Andes:/,
  });
  return {
    tarjeta,
    boton: within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }),
    onAgregar,
  };
}

describe("agregar a la cotización desde una lista cargada", () => {
  it("permite agregar con precio válido y stock disponible", () => {
    const { boton, onAgregar, tarjeta } = renderizar({
      stock_status: "known",
      stock_quantity: "12.000",
      stock_unit: "box",
    });

    expect(boton).toBeEnabled();
    expect(within(tarjeta).queryByText("No disponible para agregar a la cotización.")).toBeNull();
    expect(
      within(tarjeta).getByText(
        "Se agrega con el precio de esta lista; no se vuelve a consultar al proveedor.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(boton);
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });

  it("permite agregar con precio válido y stock no informado", () => {
    const { boton, onAgregar } = renderizar({ stock_status: "unknown", stock_quantity: null });

    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });

  it("bloquea un precio en cero", () => {
    const { boton, tarjeta, onAgregar } = renderizar({ price_amount: "0" });

    expect(boton).toBeDisabled();
    expect(
      within(tarjeta).getByText("No disponible para agregar a la cotización."),
    ).toBeInTheDocument();
    fireEvent.click(boton);
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it("bloquea un precio que no es un monto válido", () => {
    const { boton, tarjeta } = renderizar({ price_amount: "no informado" });

    expect(boton).toBeDisabled();
    expect(
      within(tarjeta).getByText("No disponible para agregar a la cotización."),
    ).toBeInTheDocument();
  });

  it("bloquea cuando el stock confirmado es cero", () => {
    const { boton, tarjeta } = renderizar({
      stock_status: "known",
      stock_quantity: "0.000",
      stock_unit: "box",
    });

    expect(boton).toBeDisabled();
    expect(
      within(tarjeta).getByText("No disponible para agregar a la cotización."),
    ).toBeInTheDocument();
  });

  it("bloquea si no hay una acción de carrito conectada", () => {
    render(
      <TarjetaPrecioLista
        oferta={ofertaLista({ stock_status: "known", stock_quantity: "5.000" })}
        proveedor="Distribuidora Andes"
        proveedorId="sup-andes"
      />,
    );

    const tarjeta = screen.getByRole("article", {
      name: /^Precio de lista de Distribuidora Andes:/,
    });
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    expect(
      within(tarjeta).getByText("No disponible para agregar a la cotización."),
    ).toBeInTheDocument();
  });

  it("deshabilita el botón mientras la oferta se está agregando", () => {
    render(
      <TarjetaPrecioLista
        oferta={ofertaLista({ stock_status: "known", stock_quantity: "5.000" })}
        proveedor="Distribuidora Andes"
        proveedorId="sup-andes"
        onAgregar={vi.fn()}
        agregando
      />,
    );

    // La solicitud en curso se informa con el indicador girando y el texto «Agregando…».
    const boton = screen.getByRole("button", { name: /Agregando…/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
  });
});
