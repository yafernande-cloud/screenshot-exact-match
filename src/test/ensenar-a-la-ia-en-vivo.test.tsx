import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfertasProveedorEnVivo } from "@/components/OfertasProveedorEnVivo";
import type {
  EstadoFuenteEnVivo,
  OfertaEnVivo,
  ProductoPublicadoEnVivo,
  ResultadoEnVivo,
} from "@/lib/proveedores-en-vivo";

/**
 * «Enseñar a la IA» en las tarjetas de proveedores en vivo.
 *
 * Regla de producto: la persona ya eligió el producto al buscar. Pulsar el botón abre el
 * comentario libre directamente, sin selector, vínculo ni confirmación de artículo. La oferta se
 * envía con sus datos comerciales reales para que el backend resuelva la identidad interna.
 *
 * `apiRequest` está doblado: no se sale a la red ni se llama a OpenAI.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

const ARTICULO_VINCULADO = "art-vinculado-1";

function oferta(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "PRE-001",
    trade_item_id: null,
    name: "Predual 30 mg comprimidos",
    laboratory: "Laboratorio Ficticio",
    presentation: "Caja 30 comprimidos",
    price: { amount: "12990", currency: "CLP" },
    price_basis: "per_commercial_unit",
    sale_unit: "box",
    stock_status: "in_stock",
    stock_quantity: "12",
    stock_unit: "box",
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: ["sale_unit_unconfirmed"],
    ...over,
  };
}

function publicado(over: Partial<ProductoPublicadoEnVivo> = {}): ProductoPublicadoEnVivo {
  return {
    external_id: "140640",
    trade_item_id: null,
    name: "Predual Pamabron 25 mg 12 Comprimidos",
    laboratory: "Laboratorio Maver",
    presentation: "Comprimido",
    stock_status: "out_of_stock",
    reference_price: { amount: "2290", currency: "CLP" },
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: ["not_available_for_sale"],
    ...over,
  };
}

function resultado(over: Partial<ResultadoEnVivo> = {}): ResultadoEnVivo {
  return {
    search_id: "busq-vivo-1",
    source_id: "src-1",
    source_name: "Fuente en vivo",
    query: "Predual",
    state: "connected",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-10T01:20:56Z",
    created_at: "2026-11-10T01:20:56Z",
    expires_at: "2026-11-10T01:30:56Z",
    cached: false,
    profile_version: 1,
    discarded: 0,
    warnings: [],
    offers: [],
    published: [],
    ...over,
  };
}

function estado(
  nombreProveedor: string,
  over: Partial<EstadoFuenteEnVivo> = {},
  resultadoOver: Partial<ResultadoEnVivo> = {},
): EstadoFuenteEnVivo {
  return {
    fuente: {
      sourceId: "src-1",
      sourceName: `${nombreProveedor} API`,
      supplierId: "sup-1",
      supplierName: nombreProveedor,
      state: "connected",
      reason: null,
      consultable: true,
      lastSuccessAt: null,
      error: null,
    },
    cargando: false,
    resultado: resultado({ offers: [oferta()], ...resultadoOver }),
    error: null,
    ...over,
  };
}

function observacionGuardada(tradeItemId: string) {
  return {
    observation_id: "obs-vivo-1",
    text: "Prefiero este producto",
    trade_item_id: tradeItemId,
    supplier_id: "sup-1",
    offer_snapshot_id: null,
    interpretation_status: "sin_interpretacion",
    interpretation: null,
    retired_subject_kinds: [],
  };
}

function interpretacionAplicada(tradeItemId: string) {
  return {
    replayed: false,
    observation: {
      ...observacionGuardada(tradeItemId),
      interpretation_status: "suggested",
      interpretation: {
        interpretation_id: "int-vivo-1",
        status: "suggested",
        error_code: null,
        retired_subject_kinds: [],
        created_at: "2026-11-10T01:00:00Z",
        preferences: [
          {
            preference_id: "pref-vivo-1",
            subject_kind: "laboratory",
            subject_label: "ASCEND",
            effect: "prefer",
            tolerance: null,
            price_reference: null,
          },
        ],
      },
    },
  };
}

function renderizar(estados: EstadoFuenteEnVivo[]) {
  return render(
    <OfertasProveedorEnVivo
      estados={estados}
      consulta="Predual"
      descubriendo={false}
      error={null}
    />,
  );
}

function tarjetaDe(proveedor: string, nombre: string) {
  return screen.getByRole("article", {
    name: new RegExp(`(Oferta de|Producto publicado por) ${proveedor}: ${nombre}`),
  });
}

function cuerpoDeLlamada(ruta: string) {
  const llamada = apiRequestMock.mock.calls.find(([url]) => url === ruta);
  return llamada ? JSON.parse((llamada[1] as RequestInit).body as string) : null;
}

function rutasLlamadas(): string[] {
  return apiRequestMock.mock.calls.map(([ruta]) => ruta as string);
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("«Enseñar a la IA» en proveedores en vivo", () => {
  it("abre el comentario directo aunque la oferta no tenga artículo y envía su contexto real", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/commercial-observations")
        return observacionGuardada(ARTICULO_VINCULADO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada(ARTICULO_VINCULADO);
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("FarmaLoop")]);

    const tarjeta = tarjetaDe("FarmaLoop", "Predual 30 mg comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));

    // No hay selector, vínculo ni confirmación de artículo: el formulario de siempre.
    const campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    expect(screen.queryByText("Vincular con el catálogo interno")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.change(campo, { target: { value: "Prefiero ASCEND" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).toEqual({
      text: "Prefiero ASCEND",
      offer: {
        source_id: "src-1",
        external_id: "PRE-001",
        name: "Predual 30 mg comprimidos",
        supplier_id: "sup-1",
        laboratory: "Laboratorio Ficticio",
        brand: null,
        presentation: "Caja 30 comprimidos",
        price: { amount: "12990", currency: "CLP" },
        price_basis: "per_commercial_unit",
        sale_unit: "box",
        stock_status: "in_stock",
        stock_quantity: "12",
        stock_unit: "box",
        ean: null,
        product_url: null,
        image_url: null,
      },
      supplier_id: "sup-1",
    });
    // Nunca se abre un buscador de artículos ni se crea un vínculo desde la enseñanza.
    expect(rutasLlamadas()).not.toContain("/api/v1/searches");
    expect(rutasLlamadas()).not.toContain("/api/v1/supplier-product-mappings");
  });

  it("conserva el identificador ya resuelto y añade el contexto de la oferta", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/commercial-observations")
        return observacionGuardada(ARTICULO_VINCULADO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada(ARTICULO_VINCULADO);
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([
      estado("Farmaloop", {}, { offers: [oferta({ trade_item_id: ARTICULO_VINCULADO })] }),
    ]);

    const tarjeta = tarjetaDe("Farmaloop", "Predual 30 mg comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));
    const campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    fireEvent.change(campo, { target: { value: "Prefiero este producto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).toMatchObject({
      text: "Prefiero este producto",
      trade_item_id: ARTICULO_VINCULADO,
      supplier_id: "sup-1",
      offer: {
        source_id: "src-1",
        external_id: "PRE-001",
        laboratory: "Laboratorio Ficticio",
        price: { amount: "12990", currency: "CLP" },
      },
    });
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).not.toHaveProperty(
      "offer_snapshot_id",
    );
  });

  it("también enseña desde una publicación sin precio, sin inventar un precio de venta", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/commercial-observations")
        return observacionGuardada(ARTICULO_VINCULADO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada(ARTICULO_VINCULADO);
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("Otro Proveedor Ficticio", {}, { offers: [], published: [publicado()] })]);

    const tarjeta = tarjetaDe("Otro Proveedor Ficticio", "Predual Pamabron 25 mg 12 Comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));
    const campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    fireEvent.change(campo, { target: { value: "Prefiero este producto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).toMatchObject({
      offer: {
        source_id: "src-1",
        external_id: "140640",
        name: "Predual Pamabron 25 mg 12 Comprimidos",
        laboratory: "Laboratorio Maver",
        // El precio de lista es referencial: nunca viaja como precio comercial.
        price: null,
      },
    });
    expect(screen.queryByText("Vincular con el catálogo interno")).not.toBeInTheDocument();
  });
});
