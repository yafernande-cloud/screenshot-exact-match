import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
 * `apiRequest` está doblado: no se sale a la red ni se llama a OpenAI. Los fixtures reproducen la
 * forma exacta de `SupplierSearchOut`, `SearchResponse` y de los endpoints de observaciones.
 * Ninguna prueba depende del nombre de un proveedor.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

const ARTICULO_VINCULADO = "art-vinculado-1";
const ARTICULO_CATALOGO = "art-catalogo-9";

function oferta(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "PRE-001",
    trade_item_id: null,
    name: "Predual 30 mg comprimidos",
    laboratory: "Laboratorio Ficticio",
    presentation: "Caja 30 comprimidos",
    price: { amount: "12990", currency: "CLP" },
    price_basis: null,
    sale_unit: null,
    stock_status: "unknown",
    stock_quantity: null,
    stock_unit: null,
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

function articuloCatalogo() {
  return {
    article_id: ARTICULO_CATALOGO,
    display_name: "Predual 30 mg x 30 comprimidos",
    identity_summary: "Predual 30 mg · comprimidos",
    presentation: {},
    match: { level: "exact", causes: [] },
    relation: "exact",
    offer_count: 1,
    supplier_count: 1,
    lowest_verified_price: null,
    sources: [],
  };
}

function buscarRespuesta(resultados = [articuloCatalogo()]) {
  return {
    search_id: "busc-1",
    status: "completed",
    query: { original_text: "Predual", filters: {}, interpretation: {} },
    generated_at: "2026-11-10T01:00:00Z",
    results: resultados,
    sources: [],
    errors: [],
    next_cursor: null,
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

function interpretacionAplicada() {
  return {
    replayed: false,
    observation: {
      ...observacionGuardada(ARTICULO_VINCULADO),
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
            subject_kind: "supplier",
            subject_label: "Farmaloop",
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

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("«Enseñar a la IA» en proveedores en vivo", () => {
  it("muestra el botón en una oferta ya vinculada y guarda con identificadores reales", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/commercial-observations")
        return observacionGuardada(ARTICULO_VINCULADO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada();
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([
      estado("Farmaloop", {}, { offers: [oferta({ trade_item_id: ARTICULO_VINCULADO })] }),
    ]);

    const tarjeta = tarjetaDe("Farmaloop", "Predual 30 mg comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));

    // No hay vínculo que resolver: se abre directo el formulario de siempre.
    const campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    fireEvent.change(campo, { target: { value: "Prefiero este producto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).toEqual({
      text: "Prefiero este producto",
      trade_item_id: ARTICULO_VINCULADO,
      supplier_id: "sup-1",
    });
    // La oferta en vivo no es una oferta persistida: nunca se envía como `offer_snapshot_id`.
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).not.toHaveProperty(
      "offer_snapshot_id",
    );
    expect(
      apiRequestMock.mock.calls.some(([ruta]) => ruta === "/api/v1/supplier-product-mappings"),
    ).toBe(false);
  });

  it("ofrece vincular cuando no hay artículo y, al confirmarlo, abre el formulario", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/searches") return buscarRespuesta();
      if (ruta === "/api/v1/supplier-product-mappings") {
        return {
          mapping_id: "map-1",
          source_id: "src-1",
          supplier_id: "sup-1",
          external_id: "PRE-001",
          external_name: "Predual 30 mg comprimidos",
          trade_item_id: ARTICULO_CATALOGO,
          origin: "explicit",
          created: true,
          created_at: "2026-11-10T01:05:00Z",
        };
      }
      if (ruta === "/api/v1/commercial-observations") return observacionGuardada(ARTICULO_CATALOGO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada();
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("Proveedor Nuevo Ficticio")]);

    const tarjeta = tarjetaDe("Proveedor Nuevo Ficticio", "Predual 30 mg comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));

    expect(await screen.findByText("Vincular con el catálogo interno")).toBeInTheDocument();
    expect(
      screen.getByText(/todavía no está vinculado a un artículo del catálogo/),
    ).toBeInTheDocument();

    // La búsqueda en el catálogo usa la consulta en vivo; la persona elige el artículo.
    await waitFor(() =>
      expect(cuerpoDeLlamada("/api/v1/searches")).toEqual({
        query: "Predual",
        limit: 20,
      }),
    );
    const opcion = await screen.findByRole("radio", {
      name: /Predual 30 mg/,
    });
    fireEvent.click(opcion);

    // Antes de confirmar se ven, por separado, el producto externo y el artículo interno elegido.
    const resumen = screen.getByText("Producto externo").closest("dl");
    expect(resumen).not.toBeNull();
    expect(within(resumen!).getByText("Predual 30 mg comprimidos")).toBeInTheDocument();
    expect(
      within(resumen!).getByText("Proveedor Nuevo Ficticio · código PRE-001"),
    ).toBeInTheDocument();
    expect(within(resumen!).getByText("Predual 30 mg x 30 comprimidos")).toBeInTheDocument();
    expect(within(resumen!).getByText("Predual 30 mg · comprimidos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vincular y enseñar" }));

    await waitFor(() =>
      expect(cuerpoDeLlamada("/api/v1/supplier-product-mappings")).toEqual({
        source_id: "src-1",
        external_id: "PRE-001",
        external_name: "Predual 30 mg comprimidos",
        trade_item_id: ARTICULO_CATALOGO,
      }),
    );

    // Continuar sin repetir el proceso: el formulario de enseñanza se abre solo.
    const campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    fireEvent.change(campo, { target: { value: "Prefiero este producto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(cuerpoDeLlamada("/api/v1/commercial-observations")).toMatchObject({
      trade_item_id: ARTICULO_CATALOGO,
      supplier_id: "sup-1",
    });
  });

  it("permite reintentar la vinculación tras un conflicto y no duplica pasos", async () => {
    let intentos = 0;
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/searches") return buscarRespuesta();
      if (ruta === "/api/v1/supplier-product-mappings") {
        intentos += 1;
        if (intentos === 1) {
          throw {
            status: 409,
            code: "SUPPLIER_MAPPING_CONFLICT",
            message: "Ese producto de la fuente ya está vinculado a otro artículo.",
          };
        }
        return {
          mapping_id: "map-2",
          source_id: "src-1",
          supplier_id: "sup-1",
          external_id: "PRE-001",
          external_name: "Predual 30 mg comprimidos",
          trade_item_id: ARTICULO_CATALOGO,
          origin: "explicit",
          created: true,
          created_at: "2026-11-10T01:05:00Z",
        };
      }
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada();
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("Proveedor Nuevo Ficticio")]);
    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Predual 30 mg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vincular y enseñar" }));

    expect(
      await screen.findByText("Ese producto ya está vinculado a otro artículo del catálogo."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vincular y enseñar" }));

    expect(
      await screen.findByRole("textbox", { name: "Comentario sobre el producto" }),
    ).toBeInTheDocument();
    expect(intentos).toBe(2);
    expect(apiRequestMock.mock.calls.filter(([ruta]) => ruta === "/api/v1/searches")).toHaveLength(
      1,
    );
  });

  it("explica que solo la administración puede vincular", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/searches") return buscarRespuesta();
      if (ruta === "/api/v1/supplier-product-mappings") {
        throw {
          status: 403,
          code: "FORBIDDEN",
          message: "Esta operación es solo para la administración.",
        };
      }
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("Proveedor Nuevo Ficticio")]);
    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Predual 30 mg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vincular y enseñar" }));

    expect(
      await screen.findByText(
        "Solo la administración puede vincular productos con el catálogo interno.",
      ),
    ).toBeInTheDocument();
    // Un fallo no crea ni sugiere artículos: no se abre el formulario de enseñanza.
    expect(
      screen.queryByRole("textbox", { name: "Comentario sobre el producto" }),
    ).not.toBeInTheDocument();
  });

  it("no inventa un artículo cuando la búsqueda del catálogo no encuentra nada", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/searches") return buscarRespuesta([]);
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([estado("Proveedor Nuevo Ficticio")]);
    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));

    expect(
      await screen.findByText(
        "No encontramos artículos con ese texto. Prueba con otro nombre o principio activo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular y enseñar" })).toBeDisabled();
    expect(
      apiRequestMock.mock.calls.some(([ruta]) => ruta === "/api/v1/supplier-product-mappings"),
    ).toBe(false);
  });

  it("también ofrece enseñar en una publicación sin precio, con su fuente real", async () => {
    apiRequestMock.mockImplementation(async (ruta: string) => {
      if (ruta === "/api/v1/commercial-observations")
        return observacionGuardada(ARTICULO_VINCULADO);
      if (ruta.endsWith("/interpretations")) return interpretacionAplicada();
      throw new Error(`Llamada inesperada: ${ruta}`);
    });

    renderizar([
      estado(
        "Otro Proveedor Ficticio",
        {},
        {
          offers: [],
          published: [publicado({ trade_item_id: ARTICULO_VINCULADO })],
        },
      ),
    ]);

    const tarjeta = tarjetaDe("Otro Proveedor Ficticio", "Predual Pamabron 25 mg 12 Comprimidos");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Enseñar a la IA" }));
    await screen.findByRole("textbox", { name: "Comentario sobre el producto" });

    expect(
      apiRequestMock.mock.calls.some(([ruta]) => ruta === "/api/v1/supplier-product-mappings"),
    ).toBe(false);
  });
});
