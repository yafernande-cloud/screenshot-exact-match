import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { ChainSource } from "@/lib/cadenas";
import type { Article, ArticleDetail, Offer, SearchResponse, SearchResult } from "@/lib/catalogo";
import type { FuenteEnVivo, ResultadoEnVivo } from "@/lib/proveedores-en-vivo";

/**
 * Flujo completo de la pantalla principal: una búsqueda dispara catálogo, las tres cadenas y los
 * proveedores en vivo, y cada resultado conserva su estado. Los módulos de red se doblan; las
 * funciones puras (`agruparOfertas`, `estadoFuenteCadena`, formateo) son las reales.
 */
const buscarCatalogoMock = vi.hoisted(() => vi.fn());
const obtenerArticuloMock = vi.hoisted(() => vi.fn());
const buscarAhumadaMock = vi.hoisted(() => vi.fn());
const buscarSalcobrandMock = vi.hoisted(() => vi.fn());
const buscarCruzVerdeMock = vi.hoisted(() => vi.fn());
const descubrirMock = vi.hoisted(() => vi.fn());
const buscarEnVivoMock = vi.hoisted(() => vi.fn());
const listarFaltantesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogo")>()),
  buscarCatalogo: buscarCatalogoMock,
  obtenerArticulo: obtenerArticuloMock,
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

    // Proveedores: dos coincidencias directas y un resultado relacionado.
    expect(screen.getByRole("heading", { name: /Coincidencias directas/ })).toHaveTextContent(
      "(2)",
    );
    expect(screen.getByRole("heading", { name: /Resultados relacionados/ })).toHaveTextContent(
      "(1)",
    );
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
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
