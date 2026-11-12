import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FichaOfertaEnVivo } from "@/components/FichaOfertaEnVivo";
import { TarjetaPrecioLista } from "@/components/PreciosListasCargadas";
import type { OfertaImportada } from "@/lib/proveedores-api";
import type { OfertaEnVivo } from "@/lib/proveedores-en-vivo";

/**
 * Estados visuales del botón «Agregar a cotización».
 *
 * El botón no decide nada: solo refleja el resultado de la acción que recibe. Mientras la
 * solicitud está en curso muestra «Agregando…» y no admite un segundo clic; si la acción confirma
 * el alta muestra «Agregado» un instante; si falla vuelve a su estado normal sin inventar un éxito.
 */

/** Promesa que la prueba resuelve a mano, para observar el estado «enviando». */
function diferida() {
  let resolver!: (valor: boolean | void) => void;
  let rechazar!: (motivo?: unknown) => void;
  const promesa = new Promise<boolean | void>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

function ofertaViva(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "107581",
    trade_item_id: null,
    name: "Salonpas x 10 parches",
    laboratory: null,
    presentation: null,
    price: { amount: "2990", currency: "CLP" },
    price_basis: null,
    sale_unit: null,
    stock_status: "in_stock",
    stock_quantity: "5",
    stock_unit: null,
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: true,
    cart_blockers: [],
    ...over,
  };
}

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

describe("estados visuales del botón en una oferta viva (FarmaLoop)", () => {
  it("muestra «Agregando…», bloquea el botón y no repite la solicitud mientras espera", async () => {
    const { promesa, resolver } = diferida();
    const onAgregar = vi.fn(() => promesa);

    render(<FichaOfertaEnVivo oferta={ofertaViva()} proveedor="FarmaLoop" onAgregar={onAgregar} />);
    const boton = screen.getByRole("button", { name: /Agregar a cotización/ });
    fireEvent.click(boton);
    fireEvent.click(boton);

    const enCurso = await screen.findByRole("button", { name: /Agregando…/ });
    expect(enCurso).toBeDisabled();
    expect(enCurso).toHaveAttribute("aria-busy", "true");
    // El indicador también se detiene con movimiento reducido.
    const indicador = enCurso.querySelector("svg");
    expect(indicador).not.toBeNull();
    expect(indicador).toHaveClass("motion-reduce:animate-none");
    expect(onAgregar).toHaveBeenCalledTimes(1);

    resolver(true);
    await screen.findByRole("button", { name: /Agregado/ });
  });

  it("confirma con un check y «Agregado», y vuelve a «Agregar a cotización»", async () => {
    const onAgregar = vi.fn(() => Promise.resolve(true));

    render(<FichaOfertaEnVivo oferta={ofertaViva()} proveedor="FarmaLoop" onAgregar={onAgregar} />);
    fireEvent.click(screen.getByRole("button", { name: /Agregar a cotización/ }));

    const confirmado = await screen.findByRole("button", { name: /Agregado/ });
    expect(confirmado).toHaveAttribute("aria-disabled", "true");
    expect(confirmado).not.toHaveAttribute("aria-busy", "true");

    await waitFor(
      () => expect(screen.getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled(),
      { timeout: 2000 },
    );
  });

  it("se restaura sin confirmar cuando la acción informa que no se agregó", async () => {
    const onAgregar = vi.fn(() => Promise.resolve(false));

    render(<FichaOfertaEnVivo oferta={ofertaViva()} proveedor="FarmaLoop" onAgregar={onAgregar} />);
    fireEvent.click(screen.getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: /Agregado/ })).toBeNull();
  });

  it("se restaura si la acción falla, sin ocultar el error de quien la ejecutó", async () => {
    const onAgregar = vi.fn(() => Promise.reject(new Error("sin conexión")));

    render(<FichaOfertaEnVivo oferta={ofertaViva()} proveedor="FarmaLoop" onAgregar={onAgregar} />);
    fireEvent.click(screen.getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: /Agregado/ })).toBeNull();
  });

  it("reduce la escala al pulsar con una transición breve y respeta el movimiento reducido", () => {
    render(<FichaOfertaEnVivo oferta={ofertaViva()} proveedor="FarmaLoop" onAgregar={vi.fn()} />);

    const boton = screen.getByRole("button", { name: /Agregar a cotización/ });
    expect(boton).toHaveClass("enabled:active:scale-[0.98]");
    expect(boton).toHaveClass("transition-transform");
    expect(boton).toHaveClass("duration-100");
    expect(boton).toHaveClass("motion-reduce:transition-none");
    expect(boton).toHaveClass("motion-reduce:enabled:active:scale-100");
  });
});

describe("estados visuales del botón en un precio de lista cargada", () => {
  it("muestra «Agregando…», bloquea el botón y luego confirma con «Agregado»", async () => {
    const { promesa, resolver } = diferida();
    const onAgregar = vi.fn(() => promesa);

    render(
      <TarjetaPrecioLista
        oferta={ofertaLista()}
        proveedor="Distribuidora Andes"
        proveedorId="sup-andes"
        onAgregar={onAgregar}
      />,
    );
    const tarjeta = screen.getByRole("article", {
      name: /^Precio de lista de Distribuidora Andes:/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    const enCurso = await within(tarjeta).findByRole("button", { name: /Agregando…/ });
    expect(enCurso).toBeDisabled();
    expect(onAgregar).toHaveBeenCalledTimes(1);

    resolver(true);
    const confirmado = await within(tarjeta).findByRole("button", { name: /Agregado/ });
    expect(confirmado).toHaveAttribute("aria-disabled", "true");

    await waitFor(
      () =>
        expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled(),
      { timeout: 2000 },
    );
  });

  it("se restaura sin confirmar cuando la lista no se pudo agregar", async () => {
    const onAgregar = vi.fn(() => Promise.resolve(false));

    render(
      <TarjetaPrecioLista
        oferta={ofertaLista()}
        proveedor="Distribuidora Andes"
        proveedorId="sup-andes"
        onAgregar={onAgregar}
      />,
    );
    const tarjeta = screen.getByRole("article", {
      name: /^Precio de lista de Distribuidora Andes:/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() =>
      expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled(),
    );
    expect(within(tarjeta).queryByRole("button", { name: /Agregado/ })).toBeNull();
  });
});
