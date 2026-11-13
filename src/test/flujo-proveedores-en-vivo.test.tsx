import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { ChainSource } from "@/lib/cadenas";
import type { Article, ArticleDetail, Offer, SearchResponse, SearchResult } from "@/lib/catalogo";
import type { Faltante } from "@/lib/faltantes-api";
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
const fijarCantidadMock = vi.hoisted(() => vi.fn());
const limpiarCantidadMock = vi.hoisted(() => vi.fn());
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
  fijarCantidad: fijarCantidadMock,
  limpiarCantidad: limpiarCantidadMock,
  cancelarFaltante: vi.fn(),
  esConflictoDeVersion: () => false,
  mensajeDeErrorFaltantes: () => "No pudimos cargar los faltantes.",
}));

// El carrito es del backend: aquí solo se comprueba qué se le envía al agregar una oferta viva.
const ultimaCotizacionMock = vi.hoisted(() => vi.fn());
const crearCotizacionActivaMock = vi.hoisted(() => vi.fn());
const agregarLineaMock = vi.hoisted(() => vi.fn());
const obtenerCotizacionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cotizacion-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cotizacion-api")>()),
  ultimaCotizacionEnPreparacion: ultimaCotizacionMock,
  crearCotizacionActiva: crearCotizacionActivaMock,
  agregarLinea: agregarLineaMock,
  obtenerCotizacion: obtenerCotizacionMock,
}));

// Este archivo monta la pantalla completa del Cotizador varias veces seguidas. El diálogo modal de
// Radix viaja por un portal y, bajo jsdom con React 19, deja el sistema de eventos recorriendo el
// DOM hasta colgar la suite. Aquí se reemplaza solo el envoltorio visual por un diálogo plano que
// respeta `open`; el diálogo real sigue cubierto en `confirmar-unidad-comercial.test.tsx`.
vi.mock("@/components/ui/dialog", async () => {
  const { createContext, useContext } = await import("react");
  const Estado = createContext<{
    abierto: boolean;
    cambiar: ((abierto: boolean) => void) | undefined;
  }>({ abierto: false, cambiar: undefined });

  const Contenedor = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );

  return {
    // El disparador se muestra siempre, como en Radix, y abre el diálogo al recibir el clic;
    // solo el contenido depende de `open`.
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (abierto: boolean) => void;
      children?: ReactNode;
    }) => (
      <Estado.Provider value={{ abierto: Boolean(open), cambiar: onOpenChange }}>
        {children}
      </Estado.Provider>
    ),
    DialogContent: ({ children, className }: { children?: ReactNode; className?: string }) =>
      useContext(Estado).abierto ? (
        <div role="dialog" className={className}>
          {children}
        </div>
      ) : null,
    DialogHeader: Contenedor,
    DialogFooter: Contenedor,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <p className={className}>{children}</p>
    ),
    DialogPortal: Contenedor,
    DialogOverlay: () => null,
    DialogTrigger: ({ children }: { children?: ReactNode }) => {
      const { cambiar } = useContext(Estado);
      return (
        <div onClick={() => cambiar?.(true)} role="presentation">
          {children}
        </div>
      );
    },
    DialogClose: Contenedor,
  };
});

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

const FALTANTE: Faltante = {
  id: "f-omeprazol",
  display_name: "Omeprazol 20 mg",
  ingredient: "omeprazol",
  status: "active",
  version: 1,
  observation_count: 1,
  reporters: ["Pato"],
  data_origin: "captured",
  created_at: "2026-11-12T09:00:00Z",
  reported_by: "u-1",
  reported_by_name: "Pato",
  branch_label: "Parque Lantaño",
  declared_quantity: "2",
  declared_unit: "box",
  requested_quantity: "2",
  requested_unit: "box",
  requested_quantity_origin: "explicit",
  target_quantity: "2",
  quantity_unit: "box",
  quantity_status: "defined",
  needs_quantity: false,
  reported_at: "2026-11-12T09:00:00Z",
  cancelled_at: null,
  last_raw_text: null,
};

const DETALLE_VACIO = {
  quote_id: "q-viva",
  title: null,
  status: "draft",
  version: 1,
  created_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  report_number: null,
  report_label: null,
  finalized_at: null,
  finalized_by: null,
  data_origin: "captured",
  derived_state: "draft",
  carts: [],
  coverage: [],
  estimated_total: {},
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
  // jsdom no implementa el desplazamiento suave que usa «Buscar» en un faltante.
  Element.prototype.scrollIntoView = vi.fn();
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
  ultimaCotizacionMock.mockResolvedValue(null);
  crearCotizacionActivaMock.mockResolvedValue(DETALLE_VACIO);
  obtenerCotizacionMock.mockResolvedValue(DETALLE_VACIO);
  agregarLineaMock.mockResolvedValue({ deduplicated: false, warnings: [] });
  fijarCantidadMock.mockReset();
  fijarCantidadMock.mockImplementation(async (f: Faltante, cantidad: number) => ({
    replayed: false,
    previous_quantity: null,
    previous_unit: null,
    item: {
      ...f,
      target_quantity: String(cantidad),
      quantity_unit: "unit",
      quantity_status: "defined",
      needs_quantity: false,
      version: f.version + 1,
    },
    event: {},
  }));
  limpiarCantidadMock.mockReset();
  limpiarCantidadMock.mockImplementation(async (f: Faltante) => ({
    replayed: false,
    previous_quantity: "10",
    previous_unit: "unit",
    item: { ...f, target_quantity: null, quantity_unit: null, needs_quantity: true },
    event: {},
  }));
});

describe("búsqueda de Predual con proveedores en vivo", () => {
  it("consulta catálogo, las tres cadenas y la fuente en vivo en la misma búsqueda", async () => {
    await renderizarPantalla();
    await buscar("Predual");

    // La sección se organiza por proveedor: Farmaloop aparece una sola vez con sus ofertas.
    expect(await screen.findByRole("region", { name: "Ofertas de Farmaloop" })).toBeInTheDocument();

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

    // Proveedores: las dos coincidencias directas y el resultado relacionado, este último aparte.
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg x 30" }),
    ).toBeInTheDocument();
    const tarjetasProveedor = screen
      .getAllByRole("article")
      .filter((tarjeta) => (tarjeta.getAttribute("aria-label") ?? "").startsWith("Oferta de "));
    expect(tarjetasProveedor).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Resultados relacionados" })).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Pregalex 75 mg" }),
    ).toBeInTheDocument();
    // La conexión ya está hecha, pero solo se agrega lo que el backend declara elegible: estas
    // ofertas no tienen unidad de venta ni base de precio confirmadas.
    for (const tarjeta of tarjetasProveedor) {
      expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    }
    expect(screen.getAllByText("No disponible para agregar a la cotización.")).toHaveLength(3);
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

const CATALOGO_VACIO: SearchResponse = {
  ...CATALOGO,
  search_id: "busq-vacio",
  results: [],
};

const CONSULTA_LARGA = "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido 30";

/** Faltante con el nombre registrado completo y la consulta corta que el backend ya conocía. */
const FALTANTE_TRAMADOL: Faltante = {
  ...FALTANTE,
  id: "f-tramadol",
  display_name: CONSULTA_LARGA,
  display_parts: {
    name: "Tramadol clorhidrato paracetamol",
    details: ["37.5 mg", "325 mg", "comprimido", "x 30"],
  },
  search_query: "Tramadol",
  search_query_full: CONSULTA_LARGA,
};

describe("consulta completa desde un faltante, con respaldo corto", () => {
  it("catálogo y cadenas usan el respaldo corto; el proveedor en vivo lo resuelve en el backend", async () => {
    listarFaltantesMock.mockResolvedValue([FALTANTE_TRAMADOL]);
    buscarCatalogoMock.mockImplementation(async (consulta: string) =>
      consulta === CONSULTA_LARGA ? CATALOGO_VACIO : CATALOGO,
    );
    buscarAhumadaMock.mockImplementation(async (consulta: string) =>
      consulta === CONSULTA_LARGA
        ? { ...cadena("ahumada", "Predual Ahumada"), outcome: "no_matches", results: [] }
        : cadena("ahumada", "Predual Ahumada"),
    );
    buscarSalcobrandMock.mockImplementation(async (consulta: string) =>
      consulta === CONSULTA_LARGA
        ? { ...cadena("salcobrand", "Predual Salcobrand"), outcome: "no_matches", results: [] }
        : cadena("salcobrand", "Predual Salcobrand"),
    );
    buscarCruzVerdeMock.mockImplementation(async (consulta: string) =>
      consulta === CONSULTA_LARGA
        ? { ...cadena("cruz_verde", "Predual Cruz Verde"), outcome: "no_matches", results: [] }
        : cadena("cruz_verde", "Predual Cruz Verde"),
    );
    buscarEnVivoMock.mockImplementation(async (_fuente: string, consulta: string) =>
      consulta === CONSULTA_LARGA
        ? resultado({ query: consulta, outcome: "no_matches", offers: [] })
        : resultado(),
    );

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Buscar ${CONSULTA_LARGA} en proveedores`,
      }),
    );

    // El buscador editable queda con la consulta ampliada, no con la corta.
    const caja = screen.getByRole("textbox", { name: "Buscar producto" });
    await waitFor(() => expect(caja).toHaveValue(CONSULTA_LARGA));

    // Cada cadena se consulta primero completa; solo al no encontrar nada prueba la corta.
    // El proveedor en vivo, en cambio, recibe una sola búsqueda: el respaldo con consulta
    // reducida vive en el backend para que también cubra las búsquedas manuales.
    await waitFor(() => expect(buscarEnVivoMock).toHaveBeenCalledTimes(1));
    expect(buscarCatalogoMock.mock.calls).toEqual([[CONSULTA_LARGA], ["Tramadol"]]);
    expect(buscarAhumadaMock.mock.calls).toEqual([[CONSULTA_LARGA], ["Tramadol"]]);
    expect(buscarSalcobrandMock.mock.calls).toEqual([[CONSULTA_LARGA], ["Tramadol"]]);
    expect(buscarCruzVerdeMock.mock.calls).toEqual([[CONSULTA_LARGA], ["Tramadol"]]);
    expect(buscarEnVivoMock.mock.calls).toEqual([["src-farmaloop", CONSULTA_LARGA]]);
    // Los resultados del respaldo reemplazan a los vacíos: no se mezclan dos búsquedas.
    expect(await screen.findByText("Predual 30 mg")).toBeInTheDocument();
    expect(await screen.findByText("Predual Ahumada")).toBeInTheDocument();
  });

  it("una búsqueda manual no reintenta la consulta corta aunque no encuentre nada", async () => {
    buscarCatalogoMock.mockResolvedValue(CATALOGO_VACIO);
    buscarAhumadaMock.mockResolvedValue({
      ...cadena("ahumada", "Predual Ahumada"),
      outcome: "no_matches",
      results: [],
    });
    buscarEnVivoMock.mockResolvedValue(
      resultado({ query: "Predual", outcome: "no_matches", offers: [] }),
    );

    await renderizarPantalla();
    await buscar("Predual");

    await waitFor(() => expect(buscarEnVivoMock).toHaveBeenCalledTimes(1));
    expect(buscarCatalogoMock.mock.calls).toEqual([["Predual"]]);
    expect(buscarAhumadaMock.mock.calls).toEqual([["Predual"]]);
    expect(buscarSalcobrandMock.mock.calls).toEqual([["Predual"]]);
    expect(buscarCruzVerdeMock.mock.calls).toEqual([["Predual"]]);
    expect(buscarEnVivoMock.mock.calls).toEqual([["src-farmaloop", "Predual"]]);
  });

  it("un fallo del catálogo no dispara el respaldo; el de una cadena tampoco", async () => {
    listarFaltantesMock.mockResolvedValue([FALTANTE_TRAMADOL]);
    buscarCatalogoMock.mockResolvedValue({ ...CATALOGO_VACIO, status: "failed" });
    buscarAhumadaMock.mockRejectedValue({ status: 503 });
    buscarEnVivoMock.mockResolvedValue(resultado());

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Buscar ${CONSULTA_LARGA} en proveedores`,
      }),
    );

    expect(
      await screen.findByText(/No pudimos completar la búsqueda en el catálogo/),
    ).toBeInTheDocument();
    // Un fallo técnico no se reintenta con otro texto ni en catálogo ni en la cadena.
    expect(buscarCatalogoMock.mock.calls).toEqual([[CONSULTA_LARGA]]);
    expect(buscarAhumadaMock.mock.calls).toEqual([[CONSULTA_LARGA]]);
  });
});

const OFERTA_SALONPAS = {
  external_id: "FL-2990",
  trade_item_id: null,
  name: "Salónpas 10 parches",
  laboratory: null,
  presentation: null,
  price: { amount: "2990", currency: "CLP" },
  price_basis: null,
  sale_unit: null,
  stock_status: "in_stock" as const,
  stock_quantity: "5",
  stock_unit: null,
  image_url: null,
  product_url: null,
  ean: null,
  match_relation: "direct" as const,
  match_reasons: ["all_query_terms_in_name"],
  cart_eligible: true,
  cart_blockers: [],
};

/** Caso real: «10 acidos mefenamicos» — cantidad escrita, sin unidad comercial. */
const FALTANTE_SIN_UNIDAD: Faltante = {
  ...FALTANTE,
  id: "f-mef",
  display_name: "Acidos mefenamicos",
  ingredient: "acidos mefenamicos",
  search_query: "Acidos mefenamicos",
  search_query_full: "Acidos mefenamicos",
  declared_quantity: "10",
  declared_unit: null,
  requested_quantity: "10",
  requested_unit: null,
  target_quantity: null,
  quantity_unit: null,
  quantity_status: "unknown",
  needs_quantity: true,
};

const OFERTA_MEFENAMICO = {
  ...OFERTA_SALONPAS,
  external_id: "FL-1010",
  name: "Acidos mefenamicos 500 mg",
  price: { amount: "4990", currency: "CLP" },
  sale_unit: null,
  stock_quantity: null,
  ean: null,
};

describe("cantidad reportada sin unidad al asociar una oferta", () => {
  it("fija la cantidad escrita por la auxiliar (10) con la unidad genérica, no 1", async () => {
    listarFaltantesMock.mockResolvedValue([FALTANTE_SIN_UNIDAD]);
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_MEFENAMICO] }));

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Buscar Acidos mefenamicos en proveedores",
      }),
    );
    const tarjeta = await screen.findByRole("article", {
      name: /Acidos mefenamicos 500 mg/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    // El SET auditado lleva la cantidad reportada y la unidad genérica: nada de cajas supuestas.
    await waitFor(() =>
      expect(fijarCantidadMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f-mef" }),
        10,
        "unit",
      ),
    );
    await waitFor(() =>
      expect(agregarLineaMock).toHaveBeenCalledWith("q-viva", {
        supplierId: "sup-farmaloop",
        offer: expect.objectContaining({ external_id: "FL-1010", sale_unit: null }),
        offerName: "Acidos mefenamicos 500 mg",
        quantity: "10",
        unit: null,
        demandItemId: "f-mef",
      }),
    );
    expect(limpiarCantidadMock).not.toHaveBeenCalled();
  });

  it("sin cantidad reportada mantiene el 1 por defecto (D-147)", async () => {
    listarFaltantesMock.mockResolvedValue([
      {
        ...FALTANTE_SIN_UNIDAD,
        declared_quantity: null,
        requested_quantity: null,
        requested_quantity_origin: null,
      },
    ]);
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_MEFENAMICO] }));

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Buscar Acidos mefenamicos en proveedores",
      }),
    );
    const tarjeta = await screen.findByRole("article", {
      name: /Acidos mefenamicos 500 mg/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() =>
      expect(fijarCantidadMock).toHaveBeenCalledWith(expect.anything(), 1, "unit"),
    );
    await waitFor(() =>
      expect(agregarLineaMock).toHaveBeenCalledWith(
        "q-viva",
        expect.objectContaining({ quantity: "1" }),
      ),
    );
  });

  it("si el alta falla, la cantidad fijada se revierte con CLEAR", async () => {
    listarFaltantesMock.mockResolvedValue([FALTANTE_SIN_UNIDAD]);
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_MEFENAMICO] }));
    agregarLineaMock.mockRejectedValueOnce(new Error("sin conexión"));

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Buscar Acidos mefenamicos en proveedores",
      }),
    );
    const tarjeta = await screen.findByRole("article", {
      name: /Acidos mefenamicos 500 mg/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() => expect(fijarCantidadMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(limpiarCantidadMock).toHaveBeenCalledTimes(1));
  });

  it("nunca reescribe una cantidad a cotizar ya definida por la administradora", async () => {
    listarFaltantesMock.mockResolvedValue([
      {
        ...FALTANTE_SIN_UNIDAD,
        target_quantity: "5",
        quantity_unit: "box",
        quantity_status: "defined",
        needs_quantity: false,
      },
    ]);
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_MEFENAMICO] }));

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Buscar Acidos mefenamicos en proveedores",
      }),
    );
    const tarjeta = await screen.findByRole("article", {
      name: /Acidos mefenamicos 500 mg/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    // La oferta no declara unidad y el faltante se mide en cajas: se pide confirmarla antes de
    // asociar. La cantidad definida (5) no se toca.
    fireEvent.click(await screen.findByLabelText("Caja"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar y asociar" }));

    await waitFor(() =>
      expect(agregarLineaMock).toHaveBeenCalledWith(
        "q-viva",
        expect.objectContaining({ quantity: "5", confirmedSaleUnit: "box" }),
      ),
    );
    expect(fijarCantidadMock).not.toHaveBeenCalled();
    expect(limpiarCantidadMock).not.toHaveBeenCalled();
    // El diálogo termina de cerrarse dentro de la prueba: no queda un portal a medio retirar
    // cuando el siguiente caso empieza.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancelar la confirmación no asocia la oferta ni toca la cantidad del faltante", async () => {
    listarFaltantesMock.mockResolvedValue([
      {
        ...FALTANTE_SIN_UNIDAD,
        target_quantity: "5",
        quantity_unit: "box",
        quantity_status: "defined",
        needs_quantity: false,
      },
    ]);
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_MEFENAMICO] }));

    await renderizarPantalla();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Buscar Acidos mefenamicos en proveedores",
      }),
    );
    const tarjeta = await screen.findByRole("article", {
      name: /Acidos mefenamicos 500 mg/,
    });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(agregarLineaMock).not.toHaveBeenCalled();
    expect(fijarCantidadMock).not.toHaveBeenCalled();
    expect(limpiarCantidadMock).not.toHaveBeenCalled();
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled();
  });
});

describe("oferta viva sin unidad de venta ni base del precio", () => {
  it("la agrega con unidad nula, sin inventar caja ni base", async () => {
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_SALONPAS] }));

    await renderizarPantalla();
    await buscar("Salónpas");
    const tarjeta = await screen.findByRole("article", { name: /Salónpas 10 parches/ });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() =>
      expect(agregarLineaMock).toHaveBeenCalledWith("q-viva", {
        supplierId: "sup-farmaloop",
        offer: expect.objectContaining({
          source_id: "src-farmaloop",
          external_id: "FL-2990",
          supplier_id: "sup-farmaloop",
          price: { amount: "2990", currency: "CLP" },
          price_basis: null,
          sale_unit: null,
        }),
        quantity: "1",
        unit: null,
        offerName: "Salónpas 10 parches",
      }),
    );
  });
  it("un error de red al crear el carrito no pierde la oferta y el reintento reusa el activo", async () => {
    buscarEnVivoMock.mockResolvedValue(resultado({ offers: [OFERTA_SALONPAS] }));
    crearCotizacionActivaMock.mockRejectedValueOnce(new Error("sin conexión"));

    await renderizarPantalla();
    await buscar("Salónpas");
    const tarjeta = await screen.findByRole("article", { name: /Salónpas 10 parches/ });
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() => expect(crearCotizacionActivaMock).toHaveBeenCalledTimes(1));
    // Sin la cotización no se agregó nada: la oferta sigue disponible en la tarjeta.
    expect(agregarLineaMock).not.toHaveBeenCalled();
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeEnabled();

    fireEvent.click(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ }));

    await waitFor(() => expect(agregarLineaMock).toHaveBeenCalledWith("q-viva", expect.anything()));
    // El reintento vuelve a pedir el carrito activo: si el primero sí llegó al servidor, el
    // backend devuelve ese mismo borrador en vez de crear otro.
    expect(crearCotizacionActivaMock).toHaveBeenCalledTimes(2);
  });

  it("una búsqueda manual independiente deja de asociar el alta al faltante", async () => {
    listarFaltantesMock.mockResolvedValue([FALTANTE]);

    await renderizarPantalla();
    // La búsqueda que parte del faltante conserva la referencia de forma explícita.
    fireEvent.click(
      await screen.findByRole("button", { name: "Buscar Omeprazol 20 mg en proveedores" }),
    );
    expect(await screen.findByText(/Búsqueda iniciada desde el faltante/)).toBeInTheDocument();

    // Una búsqueda nueva desde el buscador principal es independiente: ya no asocia.
    await buscar("Ibuprofeno");
    await waitFor(() =>
      expect(screen.queryByText(/Búsqueda iniciada desde el faltante/)).toBeNull(),
    );
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
      await screen.findByRole("region", { name: "Ofertas de Distribuidora Andes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Precios de listas cargadas")).toBeInTheDocument();
    expect(await screen.findByText("Condiciones del proveedor")).toBeInTheDocument();
    expect(screen.getByText(/Entrega en 48 horas/)).toBeInTheDocument();
    expect(
      await screen.findByRole("article", {
        name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
      }),
    ).toHaveTextContent(/12\.990/);
    // El catálogo no tiene ofertas verificadas para el artículo, pero el precio importado existe:
    // no se informa una búsqueda sin ofertas.
    expect(screen.queryByText(/No encontramos ofertas de proveedores/)).toBeNull();
    // El precio importado se agrega con su observación ya publicada (no se recotiza en vivo).
    const tarjetaLista = screen.getByRole("article", {
      name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
    });
    expect(
      within(tarjetaLista).getByRole("button", { name: /Agregar a cotización/ }),
    ).toBeEnabled();
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
        // Oferta guardada del catálogo: no viaja contexto de oferta en vivo.
        oferta: null,
        proveedorId: "sup-catalogo",
        ofertaId: "of-1",
        observacionAnteriorId: null,
      },
      expect.any(String),
    );
    await waitFor(() => expect(ordenVisible()).toEqual(["Proveedor Zeta", "Proveedor Catálogo"]));
    expect(obtenerArticuloMock).toHaveBeenCalledTimes(2);
  });
});
