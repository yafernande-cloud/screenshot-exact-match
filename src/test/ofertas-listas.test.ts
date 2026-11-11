import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResponse, SearchResult } from "@/lib/catalogo";
import type { Fuente, OfertaImportada } from "@/lib/proveedores-api";
import {
  LIMITE_OFERTAS_POR_PROVEEDOR,
  buscarPreciosDeListas,
  claveOferta,
  descubrirFuentesDeLista,
  fuentesDeLista,
  precioVigente,
  refrescarPreciosDeListas,
  seleccionarOfertasDeLista,
} from "@/lib/ofertas-listas";

/**
 * Precios de listas cargadas con `apiRequest` doblado: ninguna prueba sale a la red. Los fixtures
 * describen lo que E7 (fuentes), el endpoint de ofertas importadas y E2 (páginas del catálogo)
 * devuelven. Los precios son los del fixture: el módulo nunca los recalcula.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

const AHORA = new Date("2026-11-10T12:00:00Z");

function fuente(over: Partial<Fuente> = {}): Fuente {
  return {
    source_id: "src-andes",
    name: "Distribuidora Andes",
    kind: "supplier",
    supplier_id: "sup-andes",
    mode: "manual_import",
    capabilities: ["price"],
    enabled: true,
    status: "ok",
    has_secret: false,
    last_success_at: "2026-11-10T09:00:00Z",
    last_error: null,
    version: 1,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-10T09:00:00Z",
    ...over,
  };
}

function oferta(over: Partial<OfertaImportada> = {}): OfertaImportada {
  return {
    offer_id: "of-1",
    source_id: "src-andes",
    source_name: "Distribuidora Andes",
    source_mode: "manual_import",
    external_id: "AND-100",
    external_name: "Paracetamol 500 mg",
    trade_item_id: "art-paracetamol",
    trade_item_name: "Paracetamol 500 mg comprimidos",
    price_amount: "12990",
    currency: "CLP",
    price_basis: "per_unit",
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
    fresh_until: "2026-11-11T09:00:00Z",
    is_stale: false,
    observed_at: "2026-11-10T09:00:00Z",
    imported_at: "2026-11-10T09:00:00Z",
    ...over,
  };
}

function resultado(over: Partial<SearchResult> = {}): SearchResult {
  return {
    article_id: "art-paracetamol",
    display_name: "Paracetamol 500 mg comprimidos",
    identity_summary: "Paracetamol 500 mg · 20 comprimidos",
    presentation: { commercial_unit: { code: "box" }, content: { value: "20", unit: "tablet" } },
    match: { level: "needs_review", causes: [] },
    relation: "needs_review",
    offer_count: 0,
    supplier_count: 0,
    lowest_verified_price: null,
    sources: [],
    ...over,
  };
}

function pagina(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    search_id: "busqueda-1",
    status: "completed",
    query: { original_text: "paracetamol", filters: {}, interpretation: {} },
    generated_at: "2026-11-10T11:59:00Z",
    results: [],
    sources: [],
    errors: [],
    next_cursor: null,
    ...over,
  };
}

function listarOfertas(porProveedor: Record<string, OfertaImportada[]>) {
  apiRequestMock.mockImplementation((path: string) => {
    const coincide = /^\/api\/v1\/suppliers\/([^/]+)\/offers\?limit=(\d+)$/.exec(path);
    if (coincide) {
      const supplierId = decodeURIComponent(coincide[1] ?? "");
      const ofertas = porProveedor[supplierId];
      if (!ofertas) return Promise.reject({ status: 500, message: "falló la lista" });
      return Promise.resolve({ offers: ofertas });
    }
    return Promise.reject(new Error(`solicitud inesperada: ${path}`));
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("fuentes de lista cargada", () => {
  it("solo agrupa fuentes manual_import activas, por proveedor", () => {
    const fuentes = fuentesDeLista([
      fuente(),
      fuente({ source_id: "src-andes-2", name: "Distribuidora Andes (CSV)" }),
      fuente({
        source_id: "src-farmaloop",
        name: "Farmaloop API",
        supplier_id: "sup-fl",
        mode: "api",
      }),
      fuente({
        source_id: "src-apagada",
        name: "Lista vieja",
        supplier_id: "sup-otro",
        enabled: false,
      }),
      fuente({ source_id: "src-sin-proveedor", name: "Suelta", supplier_id: null }),
    ]);

    expect(fuentes).toHaveLength(1);
    expect(fuentes[0]).toMatchObject({
      supplierId: "sup-andes",
      supplierName: "Distribuidora Andes",
      sourceIds: ["src-andes", "src-andes-2"],
      sourceNames: ["Distribuidora Andes", "Distribuidora Andes (CSV)"],
    });
  });

  it("descubre las fuentes con la consulta de E7", async () => {
    apiRequestMock.mockResolvedValue({ sources: [fuente()] });

    const fuentes = await descubrirFuentesDeLista();

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/v1/sources?kind=supplier",
      {},
      expect.any(String),
    );
    expect(fuentes.map((f) => f.supplierId)).toEqual(["sup-andes"]);
  });
});

describe("selección de ofertas importadas", () => {
  it("cruza solo por trade_item_id exacto y conserva el precio informado", () => {
    const seleccion = seleccionarOfertasDeLista(
      [
        oferta(),
        // Mismo nombre, otro artículo: no es una coincidencia.
        oferta({ offer_id: "of-otro", trade_item_id: "art-otro" }),
      ],
      new Set(["art-paracetamol"]),
      AHORA,
    );

    expect(seleccion.vigentes).toHaveLength(1);
    expect(seleccion.vigentes[0]?.price_amount).toBe("12990");
    expect(seleccion.vigentes[0]?.trade_item_id).toBe("art-paracetamol");
  });

  it("una fuente aporta una sola oferta por artículo: la observación más reciente", () => {
    const seleccion = seleccionarOfertasDeLista(
      [
        oferta({
          offer_id: "of-vieja",
          price_amount: "11990",
          observed_at: "2026-11-01T09:00:00Z",
        }),
        oferta({
          offer_id: "of-nueva",
          price_amount: "12990",
          observed_at: "2026-11-09T09:00:00Z",
        }),
      ],
      new Set(["art-paracetamol"]),
      AHORA,
    );

    expect(seleccion.vigentes).toHaveLength(1);
    expect(seleccion.vigentes[0]?.offer_id).toBe("of-nueva");
    expect(seleccion.vigentes[0]?.price_amount).toBe("12990");
  });

  it("conserva las condiciones pendientes de revisión sin convertir el precio en verificado", () => {
    const seleccion = seleccionarOfertasDeLista(
      [oferta({ review_status: "needs_review", notes: "Entrega en 48 horas" })],
      new Set(["art-paracetamol"]),
      AHORA,
    );

    expect(seleccion.vigentes[0]).toMatchObject({
      review_status: "needs_review",
      notes: "Entrega en 48 horas",
      price_amount: "12990",
    });
  });

  it("no presenta como vigente una oferta vencida o desactualizada, pero la cuenta", () => {
    const seleccion = seleccionarOfertasDeLista(
      [
        oferta(),
        oferta({
          offer_id: "of-vencida",
          trade_item_id: "art-vencido",
          valid_to: "2026-11-01T00:00:00Z",
        }),
        oferta({
          offer_id: "of-stale",
          source_id: "src-otra",
          is_stale: true,
          fresh_until: "2026-11-01T00:00:00Z",
        }),
      ],
      new Set(["art-paracetamol", "art-vencido"]),
      AHORA,
    );

    expect(seleccion.vigentes.map((o) => o.offer_id)).toEqual(["of-1"]);
    expect(seleccion.desactualizadas).toBe(2);
    expect(seleccion.claves.size).toBe(3);
  });

  it("declara vigente un campo que el backend no marcó como vencido", () => {
    expect(precioVigente(oferta(), AHORA)).toBe(true);
    expect(precioVigente(oferta({ is_current: false }), AHORA)).toBe(false);
  });

  it("las claves usan artículo y fuente para suprimir la tarjeta duplicada de E3", () => {
    expect(claveOferta(oferta())).toBe("art-paracetamol::src-andes");
  });
});

describe("orden comercial de los precios de lista", () => {
  it("respeta la clave del backend y no reordena por nombre ni por fuente", () => {
    const seleccion = seleccionarOfertasDeLista(
      [
        oferta({
          offer_id: "of-z",
          source_id: "src-z",
          source_name: "Zeta",
          trade_item_name: "Paracetamol 500 mg AAA",
          order_key: [0, 0, 1],
        }),
        oferta({ offer_id: "of-a", source_id: "src-a", source_name: "Alfa", order_key: [0, 0, 0] }),
      ],
      new Set(["art-paracetamol"]),
      AHORA,
    );

    // La oferta con menor clave va primero aunque su nombre y su fuente sean posteriores.
    expect(seleccion.vigentes.map((o) => o.offer_id)).toEqual(["of-a", "of-z"]);
  });

  it("un precio con menor prioridad comercial queda después de uno comparable", () => {
    const seleccion = seleccionarOfertasDeLista(
      [
        oferta({ offer_id: "of-baja", order_key: [1, 0, 0] }),
        oferta({ offer_id: "of-alta", source_id: "src-otra", order_key: [0, 0, 0] }),
      ],
      new Set(["art-paracetamol"]),
      AHORA,
    );

    expect(seleccion.vigentes.map((o) => o.offer_id)).toEqual(["of-alta", "of-baja"]);
  });

  it("al refrescar relee los precios y aplica el orden nuevo sin tocar el catálogo", async () => {
    const fuentes = [
      {
        supplierId: "sup-andes",
        supplierName: "Distribuidora Andes",
        sourceIds: ["src-andes", "src-andes-2"],
        sourceNames: ["Distribuidora Andes", "Distribuidora Andes (CSV)"],
      },
    ];
    listarOfertas({
      "sup-andes": [
        oferta({ offer_id: "of-a", order_key: [1, 0, 0] }),
        oferta({ offer_id: "of-b", source_id: "src-andes-2", order_key: [0, 0, 0] }),
      ],
    });

    const resultado = await refrescarPreciosDeListas({
      fuentes,
      articleIds: new Set(["art-paracetamol"]),
      ahora: AHORA,
    });

    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0]?.ofertas.map((o) => o.offer_id)).toEqual(["of-b", "of-a"]);
    expect(resultado.errores).toEqual([]);
    expect(obtenerBusquedaMockCatalogo()).toBeNull();
  });
});

function obtenerBusquedaMockCatalogo() {
  // El refresco nunca vuelve a ejecutar la búsqueda de catálogo (E2).
  return apiRequestMock.mock.calls.find(([ruta]) =>
    String(ruta).startsWith("/api/v1/searches/"),
  )?.[0] ?? null;
}

describe("búsqueda de precios de listas", () => {

  it("encuentra un producto importado que la primera página del catálogo no muestra", async () => {
    listarOfertas({
      "sup-andes": [
        oferta({
          offer_id: "of-exclusivo",
          trade_item_id: "art-exclusivo-andes",
          trade_item_name: "Jarabe exclusivo Andes",
          external_id: "AND-EXC-1",
        }),
      ],
    });

    const cargarPagina = vi.fn(async (cursor: string) =>
      cursor === "pagina-2"
        ? pagina({ results: [resultado({ article_id: "art-exclusivo-andes" })] })
        : pagina(),
    );

    const avances: number[] = [];
    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [resultado({ article_id: "art-otro" })],
      nextCursor: "pagina-2",
      cargarPagina,
      ahora: AHORA,
      alAvanzar: (grupos) => avances.push(grupos.length),
    });

    expect(cargarPagina).toHaveBeenCalledTimes(1);
    expect(cargarPagina).toHaveBeenCalledWith("pagina-2", 50);
    expect(salida.grupos).toHaveLength(1);
    expect(salida.grupos[0]?.ofertas[0]).toMatchObject({
      trade_item_id: "art-exclusivo-andes",
      price_amount: "12990",
    });
    expect(avances[0]).toBe(0);
    expect(avances.at(-1)).toBe(1);
    expect(salida.paginasRestantes).toBe(false);
  });

  it("se detiene en el tope de páginas y avisa que quedan resultados sin revisar", async () => {
    listarOfertas({ "sup-andes": [oferta()] });
    const cargarPagina = vi.fn(async () => pagina({ next_cursor: "siempre-hay-mas" }));

    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [],
      nextCursor: "inicio",
      cargarPagina,
      maxPaginas: 2,
      ahora: AHORA,
    });

    expect(cargarPagina).toHaveBeenCalledTimes(2);
    expect(salida.paginasRestantes).toBe(true);
  });

  it("un proveedor que falla no oculta los precios de los demás", async () => {
    listarOfertas({
      "sup-andes": [oferta()],
      // sup-farmaloop no existe en el mapa: la solicitud se rechaza.
    });

    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([
        fuente(),
        fuente({
          source_id: "src-fl",
          name: "Farmaloop API",
          supplier_id: "sup-farmaloop",
          mode: "manual_import",
        }),
      ]),
      resultadosIniciales: [resultado()],
      nextCursor: null,
      cargarPagina: vi.fn(),
      ahora: AHORA,
    });

    expect(salida.grupos).toHaveLength(1);
    expect(salida.grupos[0]?.supplierName).toBe("Distribuidora Andes");
    expect(salida.errores).toEqual(["No pudimos cargar los precios de la lista de Farmaloop API."]);
  });

  it("no consulta páginas si la búsqueda no tiene más resultados", async () => {
    listarOfertas({ "sup-andes": [oferta()] });
    const cargarPagina = vi.fn();

    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [resultado()],
      nextCursor: null,
      cargarPagina,
      ahora: AHORA,
    });

    expect(cargarPagina).not.toHaveBeenCalled();
    expect(salida.grupos[0]?.ofertas).toHaveLength(1);
    expect(salida.paginasRestantes).toBe(false);
  });

  it("una página que falla conserva lo ya encontrado y lo informa", async () => {
    listarOfertas({ "sup-andes": [oferta()] });

    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [resultado()],
      nextCursor: "pagina-2",
      cargarPagina: vi.fn().mockRejectedValue(new Error("500")),
      ahora: AHORA,
    });

    expect(salida.grupos[0]?.ofertas).toHaveLength(1);
    expect(salida.errores).toEqual([
      "No pudimos revisar todos los resultados del catálogo; pueden faltar precios de listas cargadas.",
    ]);
    expect(salida.paginasRestantes).toBe(false);
  });

  it("pide cada proveedor una vez con el tope del endpoint", async () => {
    listarOfertas({ "sup-andes": [oferta()] });

    await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [resultado()],
      nextCursor: null,
      cargarPagina: vi.fn(),
      ahora: AHORA,
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/api/v1/suppliers/sup-andes/offers?limit=${LIMITE_OFERTAS_POR_PROVEEDOR}`,
      {},
      expect.any(String),
    );
  });

  it("avisa cuando la lista puede tener más precios que el tope leído", async () => {
    const muchas = Array.from({ length: LIMITE_OFERTAS_POR_PROVEEDOR }, (_, indice) =>
      oferta({ offer_id: `of-${indice}`, trade_item_id: `art-${indice}` }),
    );
    listarOfertas({ "sup-andes": muchas });

    const salida = await buscarPreciosDeListas({
      fuentes: fuentesDeLista([fuente()]),
      resultadosIniciales: [],
      nextCursor: null,
      cargarPagina: vi.fn(),
      ahora: AHORA,
    });

    expect(salida.errores).toEqual([
      `La lista de Distribuidora Andes tiene más de ${LIMITE_OFERTAS_POR_PROVEEDOR} precios; puede faltar alguno.`,
    ]);
  });
});
