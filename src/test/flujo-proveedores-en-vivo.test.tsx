import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { ChainSource } from "@/lib/cadenas";
import type { Article, ArticleDetail, Offer, SearchResponse, SearchResult } from "@/lib/catalogo";
import type { Fuente, OfertaImportada } from "@/lib/proveedores-api";
import type { FuenteEnVivo, ResultadoEnVivo } from "@/lib/proveedores-en-vivo";

/**
 * Flujo completo de la pantalla principal: una búsqueda dispara catálogo, las tres cadenas y los
 * proveedores en vivo, y cada resultado conserva su estado. Los módulos de red se doblan; las
 * funciones puras (`agruparOfertas`, `estadoFuenteCadena`, formateo) son las reales.
 */
const buscarCatalogoMock = vi.hoisted(() => vi.fn());
const obtenerArticuloMock = vi.hoisted(() => vi.fn());
const obtenerBusquedaMock = vi.hoisted(() => vi.fn());
const buscarAhumadaMock = vi.hoisted(() => vi.fn());
const buscarSalcobrandMock = vi.hoisted(() => vi.fn());
const buscarCruzVerdeMock = vi.hoisted(() => vi.fn());
const descubrirMock = vi.hoisted(() => vi.fn());
const buscarEnVivoMock = vi.hoisted(() => vi.fn());
const listarFaltantesMock = vi.hoisted(() => vi.fn());
const listarFuentesMock = vi.hoisted(() => vi.fn());
const listarOfertasMock = vi.hoisted(() => vi.fn());
const guardarObservacionMock = vi.hoisted(() => vi.fn());
const interpretarObservacionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogo")>()),
  buscarCatalogo: buscarCatalogoMock,
  obtenerArticulo: obtenerArticuloMock,
  obtenerBusqueda: obtenerBusquedaMock,
}));

vi.mock("@/lib/proveedores-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/proveedores-api")>()),
  listarFuentes: listarFuentesMock,
  listarOfertasProveedor: listarOfertasMock,
}));

vi.mock("@/lib/cadenas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cadenas")>()),
  buscarCadenasAhumada: buscarAhumadaMock,
  buscarCadenasSalcobrand: buscarSalcobrandMock,
  buscarCadenasCruzVerde: buscarCruzVerdeMock,
}));

vi.mock("@/lib/proveedores-en-vivo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/proveedores-en-vivo")>()),
  descubrirProveedoresEnVivo: descubrirMock,
  buscarProveedorEnVivo: buscarEnVivoMock,
}));

vi.mock("@/lib/observaciones-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/observaciones-api")>()),
  guardarObservacion: guardarObservacionMock,
  interpretarObservacion: interpretarObservacionMock,
}));

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

const CATALOGO: SearchResponse = {
  search_id: "busq-catalogo",
  status: "completed",
  query: { original_text: "Predual", filters: {}, interpretation: {} },
  generated_at: "2026-11-10T01:20:00Z",
  results: [
    {
      article_id: "art-1",
      display_name: "Predual 30 mg",
      identity_summary: "Predual 30 mg comprimidos",
      presentation: {},
      match: { level: "exact", causes: ["name"] },
      relation: "exact",
      offer_count: 1,
      supplier_count: 1,
      lowest_verified_price: null,
      sources: [],
    } satisfies SearchResult,
  ],
  sources: [],
  errors: [],
  next_cursor: null,
};

const ARTICULO: Article = {
  article_id: "art-1",
  display_name: "Predual 30 mg",
  identity: {
    ingredient: "predual",
    strengths: [],
    form: null,
    route: null,
    release: null,
    brand: null,
    laboratory: "Laboratorio Catálogo",
    gtin: null,
    sanitary_registration: null,
  },
  presentation: {},
  match: { level: "exact", causes: ["name"] },
  status: "active",
  data_origin: "provider",
};

const OFERTA_CATALOGO: Offer = {
  offer_id: "of-1",
  article_id: "art-1",
  supplier: { supplier_id: "sup-catalogo", name: "Proveedor Catálogo", status: "active" },
  external_id: "CAT-1",
  external_id_kind: "sku",
  price: {
    money: { amount: "11990", currency: "CLP" },
    basis: "per_commercial_unit",
    tax_included: true,
    discount_included: null,
  },
  price_per_base_unit: null,
  sale_unit: { code: "box", original_text: null },
  pack: null,
  minimum: { known: false, quantity: null, unit: null },
  multiple: { known: false, quantity: null, unit: null },
  stock: { status: "unknown", quantity: null, unit: null },
  taxes: [],
  discounts: [],
  shipping_terms_id: null,
  validity: { valid_from: null, valid_to: null, is_current: true },
  notes: null,
  provenance: {
    source: { source_id: "src-catalogo", name: "Catálogo", mode: "api" },
    data_origin: "provider",
    observed_at: "2026-11-10T01:19:00Z",
    evidence: null,
  },
  freshness: {
    observed_at: "2026-11-10T01:19:00Z",
    fresh_until: "2026-11-11T01:19:00Z",
    is_stale: false,
    stale_fields: [],
  },
};

const DETALLE_CATALOGO: ArticleDetail = {
  article: ARTICULO,
  offers: [OFERTA_CATALOGO],
  offers_total: 1,
  next_cursor: null,
  reference_prices: [],
  annotations: [],
  notes: [],
  sources: [],
  generated_at: "2026-11-10T01:19:00Z",
};

function fuente(over: Partial<FuenteEnVivo> = {}): FuenteEnVivo {
  return {
    sourceId: "src-farmaloop",
    sourceName: "Farmaloop API",
    supplierId: "sup-farmaloop",
    supplierName: "Farmaloop",
    state: "connected",
    reason: null,
    consultable: true,
    lastSuccessAt: null,
    error: null,
    ...over,
  };
}

function resultado(over: Partial<ResultadoEnVivo> = {}): ResultadoEnVivo {
  return {
    search_id: "busq-vivo",
    source_id: "src-farmaloop",
    source_name: "Farmaloop API",
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
    published: [],
    offers: [
      {
        external_id: "PRE-1",
        trade_item_id: null,
        name: "Predual 30 mg comprimidos",
        laboratory: "Laboratorio",
        presentation: "Caja 30",
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
        cart_blockers: ["sale_unit_unconfirmed", "price_basis_unconfirmed"],
      },
      {
        external_id: "PRE-2",
        trade_item_id: null,
        name: "Predual 30 mg x 30",
        laboratory: "Laboratorio",
        presentation: "Caja 30",
        price: { amount: "13500", currency: "CLP" },
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
        cart_blockers: ["sale_unit_unconfirmed", "price_basis_unconfirmed"],
      },
      {
        external_id: "PREG-1",
        trade_item_id: null,
        name: "Pregalex 75 mg",
        laboratory: null,
        presentation: null,
        price: { amount: "8990", currency: "CLP" },
        price_basis: null,
        sale_unit: null,
        stock_status: "unknown",
        stock_quantity: null,
        stock_unit: null,
        image_url: null,
        product_url: null,
        ean: null,
        match_relation: "related",
        match_reasons: [],
        cart_eligible: false,
        cart_blockers: ["match_not_direct", "sale_unit_unconfirmed", "price_basis_unconfirmed"],
      },
    ],
    ...over,
  };
}

function cadena(chain: ChainSource["chain"], nombre: string): ChainSource {
  return {
    chain,
    state: "ok",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-10T01:20:56Z",
    results: [
      {
        chain_item_id: `${chain}-1`,
        published_name: nombre,
        laboratory_as_published: null,
        presentation_as_published: null,
        has_stock: null,
        description: null,
        image_url: null,
        price: {
          normal: { amount: "15990", currency: "CLP" },
          promotional: null,
          fractional: null,
        },
        conditions: null,
        source_url: null,
        observed_at: "2026-11-10T01:20:56Z",
        provenance: {},
        match: {},
      },
    ],
  };
}

function fuenteLista(over: Partial<Fuente> = {}): Fuente {
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

const RESULTADO_PARACETAMOL: SearchResult = {
  article_id: "art-paracetamol",
  display_name: "Paracetamol 500 mg comprimidos",
  identity_summary: "Paracetamol 500 mg · 20 comprimidos",
  presentation: {},
  match: { level: "needs_review", causes: [] },
  relation: "needs_review",
  offer_count: 0,
  supplier_count: 0,
  lowest_verified_price: null,
  sources: [],
};

const CATALOGO_CON_LISTA: SearchResponse = {
  ...CATALOGO,
  search_id: "busq-listas",
  query: { original_text: "Paracetamol", filters: {}, interpretation: {} },
  results: [RESULTADO_PARACETAMOL],
};

function renderizarPantalla() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return router.load().then(() => render(<RouterProvider router={router} />));
}

async function buscar(texto: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar producto" }), {
    target: { value: texto },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listarFaltantesMock.mockResolvedValue([]);
  buscarCatalogoMock.mockResolvedValue(CATALOGO);
  obtenerArticuloMock.mockResolvedValue(DETALLE_CATALOGO);
  buscarAhumadaMock.mockResolvedValue(cadena("ahumada", "Predual Ahumada"));
  buscarSalcobrandMock.mockResolvedValue(cadena("salcobrand", "Predual Salcobrand"));
  buscarCruzVerdeMock.mockResolvedValue(cadena("cruz_verde", "Predual Cruz Verde"));
  descubrirMock.mockResolvedValue([fuente()]);
  buscarEnVivoMock.mockResolvedValue(resultado());
  // Por defecto no hay listas cargadas: la sección nueva no altera los flujos ya probados.
  listarFuentesMock.mockResolvedValue([]);
  listarOfertasMock.mockResolvedValue([]);
  obtenerBusquedaMock.mockRejectedValue(new Error("sin páginas adicionales"));
});

describe("búsqueda de Predual con proveedores en vivo", () => {
  it("consulta catálogo, las tres cadenas y la fuente en vivo en la misma búsqueda", async () => {
    await renderizarPantalla();
    await buscar("Predual");

    expect(await screen.findByText("Proveedores en vivo")).toBeInTheDocument();

    expect(buscarCatalogoMock).toHaveBeenCalledWith("Predual");
    expect(buscarAhumadaMock).toHaveBeenCalledWith("Predual");
    expect(buscarSalcobrandMock).toHaveBeenCalledWith("Predual");
    expect(buscarCruzVerdeMock).toHaveBeenCalledWith("Predual");
    expect(descubrirMock).toHaveBeenCalledTimes(1);
    expect(buscarEnVivoMock).toHaveBeenCalledWith("src-farmaloop", "Predual");

    // Catálogo y cadenas siguen mostrando sus resultados.
    expect(await screen.findByText("Predual 30 mg")).toBeInTheDocument();
    expect(await screen.findByText("Predual Ahumada")).toBeInTheDocument();
    expect(await screen.findByText("Predual Salcobrand")).toBeInTheDocument();
    expect(await screen.findByText("Predual Cruz Verde")).toBeInTheDocument();

    // Proveedores: solo las dos coincidencias directas; el relacionado no se presenta.
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg x 30" }),
    ).toBeInTheDocument();
    const tarjetasProveedor = screen
      .getAllByRole("article")
      .filter((tarjeta) => (tarjeta.getAttribute("aria-label") ?? "").startsWith("Oferta de "));
    expect(tarjetasProveedor).toHaveLength(2);
    expect(screen.queryByText("Pregalex 75 mg")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Resultados relacionados/ })).toBeNull();
    expect(
      screen
        .getAllByRole("button", { name: /Agregar a cotización/ })
        .every((boton) => (boton as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it("el fallo de un proveedor no altera catálogo ni cadenas", async () => {
    buscarEnVivoMock.mockRejectedValue({ status: 429 });

    await renderizarPantalla();
    await buscar("Predual");

    expect(
      await screen.findByText(/Demasiadas búsquedas en vivo. Espera un minuto/),
    ).toBeInTheDocument();
    expect(screen.getByText("Predual Ahumada")).toBeInTheDocument();
    expect(screen.getByText("Predual Salcobrand")).toBeInTheDocument();
    expect(screen.getByText("Predual Cruz Verde")).toBeInTheDocument();
    expect(screen.getByText("Predual 30 mg")).toBeInTheDocument();
    // Una fuente con error no se presenta como «sin resultados».
    expect(screen.queryByText(/no devolvió ofertas/)).toBeNull();
  });

  it("no consulta una fuente sin conexión y lo informa sin ocultar a las demás", async () => {
    descubrirMock.mockResolvedValue([
      fuente(),
      fuente({
        sourceId: "src-manual",
        sourceName: "Lista manual",
        supplierName: "Lista manual",
        state: "not_configured",
        reason: "profile_missing",
        consultable: false,
      }),
    ]);

    await renderizarPantalla();
    await buscar("Predual");

    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.getByText(/Falta configurar la conexión/)).toBeInTheDocument();
    expect(buscarEnVivoMock).toHaveBeenCalledTimes(1);
    expect(buscarEnVivoMock).toHaveBeenCalledWith("src-farmaloop", "Predual");
  });
});

describe("precios de listas cargadas en la búsqueda", () => {
  it("muestra los precios importados con su estado de revisión y sin inventar ofertas", async () => {
    buscarCatalogoMock.mockResolvedValue(CATALOGO_CON_LISTA);
    listarFuentesMock.mockResolvedValue([fuenteLista()]);
    listarOfertasMock.mockResolvedValue([
      ofertaLista({ review_status: "needs_review", notes: "Entrega en 48 horas" }),
    ]);

    await renderizarPantalla();
    await buscar("Paracetamol");

    expect(
      await screen.findByRole("heading", { name: "Precios de listas cargadas" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Pendiente de revisión")).toBeInTheDocument();
    expect(screen.getByText(/Entrega en 48 horas/)).toBeInTheDocument();
    expect(
      await screen.findByRole("article", {
        name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
      }),
    ).toHaveTextContent(/12\.990/);
    // El catálogo no tiene ofertas verificadas para el artículo, pero el precio importado existe:
    // no se informa una búsqueda sin ofertas.
    expect(screen.queryByText(/No encontramos ofertas de proveedores/)).toBeNull();
    // Un precio importado todavía no entra al carrito.
    expect(
      screen
        .getAllByRole("button", { name: /Agregar a cotización/ })
        .every((boton) => (boton as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(obtenerBusquedaMock).not.toHaveBeenCalled();
  });

  it("revisa páginas siguientes del catálogo para encontrar un producto importado", async () => {
    buscarCatalogoMock.mockResolvedValue({ ...CATALOGO_CON_LISTA, next_cursor: "pagina-2" });
    listarFuentesMock.mockResolvedValue([fuenteLista()]);
    listarOfertasMock.mockResolvedValue([
      ofertaLista({
        offer_id: "of-exclusivo",
        external_id: "AND-EXC-1",
        trade_item_id: "art-exclusivo-andes",
        trade_item_name: "Jarabe exclusivo Andes",
        price_amount: "4590",
      }),
    ]);
    obtenerBusquedaMock.mockResolvedValue({
      ...CATALOGO_CON_LISTA,
      results: [
        {
          ...RESULTADO_PARACETAMOL,
          article_id: "art-exclusivo-andes",
          display_name: "Jarabe exclusivo Andes",
        },
      ],
      next_cursor: null,
    });

    await renderizarPantalla();
    await buscar("Paracetamol");

    expect(await screen.findByText(/Jarabe exclusivo Andes/)).toBeInTheDocument();
    expect(screen.getByText(/4\.590/)).toBeInTheDocument();
    expect(obtenerBusquedaMock).toHaveBeenCalledWith("busq-listas", "pagina-2", 50);
  });

  it("un error en la lista no oculta a Farmaloop en vivo", async () => {
    buscarCatalogoMock.mockResolvedValue(CATALOGO_CON_LISTA);
    listarFuentesMock.mockResolvedValue([fuenteLista()]);
    listarOfertasMock.mockRejectedValue({ status: 500 });

    await renderizarPantalla();
    await buscar("Paracetamol");

    expect(
      await screen.findByText("No pudimos cargar los precios de la lista de Distribuidora Andes."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
  });

  it("no repite la oferta de catálogo que ya muestra una lista cargada", async () => {
    buscarCatalogoMock.mockResolvedValue({
      ...CATALOGO,
      search_id: "busq-listas",
      results: [{ ...RESULTADO_PARACETAMOL, offer_count: 1, supplier_count: 1 }],
    });
    obtenerArticuloMock.mockResolvedValue({
      ...DETALLE_CATALOGO,
      article: {
        ...ARTICULO,
        article_id: "art-paracetamol",
        display_name: "Paracetamol 500 mg comprimidos",
      },
      offers: [
        {
          ...OFERTA_CATALOGO,
          offer_id: "of-e3",
          article_id: "art-paracetamol",
          provenance: {
            ...OFERTA_CATALOGO.provenance,
            source: { source_id: "src-andes", name: "Distribuidora Andes", mode: "manual_import" },
          },
        },
      ],
    });
    listarFuentesMock.mockResolvedValue([fuenteLista()]);
    listarOfertasMock.mockResolvedValue([ofertaLista()]);

    await renderizarPantalla();
    await buscar("Paracetamol");

    expect(
      await screen.findByRole("article", {
        name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
      }),
    ).toBeInTheDocument();
    // La misma oferta guardada en E3 no se vuelve a mostrar como tarjeta de catálogo.
    expect(screen.queryByText(/Ofertas guardadas en el catálogo del servidor/)).toBeNull();
  });
});

describe("«Enseñar a la IA» desde una oferta del catálogo", () => {
  const OFERTA_ZETA: Offer = {
    ...OFERTA_CATALOGO,
    offer_id: "of-zeta",
    supplier: { supplier_id: "sup-zeta", name: "Proveedor Zeta", status: "active" },
  };

  function detalle(offers: Offer[]): ArticleDetail {
    return { ...DETALLE_CATALOGO, offers, offers_total: offers.length };
  }

  /**
   * Mientras el diálogo modal está abierto, Radix deja el resto de la página con `aria-hidden`:
   * se consultan también esos nodos, porque interesa el orden que el backend ya devolvió.
   */
  function ordenVisible(): string[] {
    return screen
      .getAllByRole("article", { hidden: true })
      .map((nodo) => nodo.querySelector("h3")?.textContent ?? "")
      .filter((texto) => texto === "Proveedor Catálogo" || texto === "Proveedor Zeta");
  }

  it("vuelve a leer E3 y muestra el orden que decidió el backend", async () => {
    obtenerArticuloMock
      .mockResolvedValueOnce(detalle([OFERTA_CATALOGO, OFERTA_ZETA]))
      .mockResolvedValueOnce(detalle([OFERTA_ZETA, OFERTA_CATALOGO]));
    const guardada = {
      observation_id: "obs-1",
      text: "Prefiero Laboratorio Chile aunque sea un poco más caro",
      trade_item_id: "art-1",
      supplier_id: "sup-catalogo",
      offer_snapshot_id: "of-1",
      interpretation_status: "sin_interpretacion" as const,
      interpretation: null,
      retired_subject_kinds: [],
    };
    guardarObservacionMock.mockResolvedValue(guardada);
    interpretarObservacionMock.mockResolvedValue({
      replayed: false,
      observation: {
        ...guardada,
        interpretation_status: "suggested",
        interpretation: {
          interpretation_id: "int-1",
          status: "suggested",
          error_code: null,
          retired_subject_kinds: [],
          created_at: "2026-11-11T12:00:00Z",
          preferences: [
            {
              preference_id: "pref-1",
              subject_kind: "laboratory",
              subject_label: "Laboratorio Chile",
              effect: "prefer",
              tolerance: null,
              price_reference: null,
            },
          ],
        },
      },
    });

    await renderizarPantalla();
    await buscar("Predual");
    await screen.findByText("Proveedor Zeta");
    expect(ordenVisible()).toEqual(["Proveedor Catálogo", "Proveedor Zeta"]);

    // Las tarjetas en vivo también ofrecen «Enseñar a la IA»; aquí se enseña sobre la oferta E3.
    const tarjetaCatalogo = screen
      .getAllByRole("article", { hidden: true })
      .find((nodo) => nodo.querySelector("h3")?.textContent === "Proveedor Catálogo");
    fireEvent.click(within(tarjetaCatalogo!).getByRole("button", { name: "Enseñar a la IA" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comentario sobre el producto" }), {
      target: { value: "Prefiero Laboratorio Chile aunque sea un poco más caro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(guardarObservacionMock).toHaveBeenCalledWith(
      {
        texto: "Prefiero Laboratorio Chile aunque sea un poco más caro",
        articuloId: "art-1",
        proveedorId: "sup-catalogo",
        ofertaId: "of-1",
      },
      expect.any(String),
    );
    await waitFor(() => expect(ordenVisible()).toEqual(["Proveedor Zeta", "Proveedor Catálogo"]));
    expect(obtenerArticuloMock).toHaveBeenCalledTimes(2);
  });
});
