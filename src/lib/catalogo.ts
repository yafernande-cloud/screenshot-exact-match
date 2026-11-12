/**
 * Búsqueda y ofertas del catálogo del backend (E1–E3).
 *
 * Los tipos reflejan el contrato real de FastAPI (`backend/app/api/v1/search.py`). Aquí solo se
 * presentan los datos: no se calculan precios, descuentos ni evaluaciones comerciales, y un campo
 * ausente se muestra como «No informado», nunca se rellena con un valor inventado.
 */

import { apiRequest } from "@/lib/api";

export interface Money {
  amount: string;
  currency: string;
}

export interface CommercialUnit {
  code?: string | null;
  original_text?: string | null;
}

export interface Measure {
  value?: string | null;
  unit?: string | null;
  original_text?: string | null;
}

export interface ContentAttribute {
  measure?: Measure | null;
}

export interface Presentation {
  commercial_unit?: CommercialUnit | null;
  content?: Measure | ContentAttribute | null;
  units_per_commercial_unit?: string | null;
}

export interface Match {
  level: "exact" | "needs_review";
  causes: string[];
}

export interface SearchResult {
  article_id: string;
  display_name: string;
  identity_summary: string;
  presentation: Presentation;
  match: Match;
  relation: "exact" | "other_presentation" | "combined" | "related" | "needs_review";
  offer_count: number;
  supplier_count: number;
  lowest_verified_price: Money | null;
  sources: string[];
}

export type SearchStatus = "completed" | "partial" | "failed";

export interface SearchResponse {
  search_id: string;
  status: SearchStatus;
  query: {
    original_text: string;
    filters: Record<string, unknown>;
    interpretation: Record<string, unknown>;
  };
  generated_at: string;
  results: SearchResult[];
  sources: Array<Record<string, unknown>>;
  errors: Array<{
    source_id: string;
    code: string | null;
    message: string | null;
    retryable: boolean;
  }>;
  next_cursor: string | null;
}

export interface SupplierRef {
  supplier_id: string;
  name: string;
  status: string;
}

export interface Price {
  money: Money;
  basis: "per_commercial_unit" | "per_base_unit";
  tax_included: boolean | null;
  discount_included: boolean | null;
}

export interface Threshold {
  known: boolean;
  quantity: string | null;
  unit: string | null;
}

export interface Offer {
  offer_id: string;
  article_id: string;
  supplier: SupplierRef;
  external_id: string;
  external_id_kind: string;
  price: Price;
  price_per_base_unit: (Money & { base_unit: string | null }) | null;
  // `code` nulo = la fuente no declaró unidad de venta (FarmaLoop); nunca se supone.
  sale_unit: { code: string | null; original_text: string | null };
  pack: {
    units_per_commercial_unit: string;
    base_unit: string | null;
    original_text: string | null;
  } | null;
  minimum: Threshold;
  multiple: Threshold;
  stock: { status: "known" | "unknown"; quantity: string | null; unit: string | null };
  taxes: Array<Record<string, unknown>>;
  discounts: Array<Record<string, unknown>>;
  shipping_terms_id: string | null;
  validity: {
    valid_from: string | null;
    valid_to: string | null;
    is_current: boolean;
  };
  notes: string | null;
  provenance: {
    source: { source_id: string; name: string; mode: string };
    data_origin: string;
    observed_at: string;
    evidence: Record<string, unknown> | null;
  };
  freshness: {
    observed_at: string;
    fresh_until: string;
    is_stale: boolean;
    stale_fields: string[];
  };
}

export interface Article {
  article_id: string;
  display_name: string;
  identity: {
    ingredient: string | null;
    strengths: Array<Record<string, unknown>>;
    form: Record<string, unknown> | null;
    route: string | null;
    release: Record<string, unknown> | null;
    brand: string | null;
    laboratory: string | null;
    gtin: string | null;
    sanitary_registration: string | null;
  };
  presentation: Presentation & {
    packaging?: Record<string, unknown> | null;
  };
  match: Match;
  status: string;
  data_origin: string;
}

export interface ArticleDetail {
  article: Article;
  offers: Offer[];
  offers_total: number;
  next_cursor: string | null;
  reference_prices: Array<Record<string, unknown>>;
  annotations: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  generated_at: string;
}

const BUSQUEDA_FALLBACK = "No pudimos completar la búsqueda. Inténtalo otra vez.";
const ARTICULO_FALLBACK = "No pudimos cargar las ofertas de este artículo. Inténtalo otra vez.";

/** E1: búsqueda libre por nombre, principio activo o coincidencia parcial. */
export function buscarCatalogo(query: string): Promise<SearchResponse> {
  return apiRequest<SearchResponse>(
    "/api/v1/searches",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 20 }),
    },
    BUSQUEDA_FALLBACK,
  );
}

/** E2: recupera una página de la búsqueda guardada, sin volver a ejecutarla. */
export function obtenerBusqueda(
  searchId: string,
  cursor: string,
  limit = 20,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ cursor, limit: String(limit) });
  return apiRequest<SearchResponse>(
    `/api/v1/searches/${searchId}?${params.toString()}`,
    {},
    BUSQUEDA_FALLBACK,
  );
}

/** E3: artículo y sus últimas ofertas por fuente. */
export function obtenerArticulo(articleId: string): Promise<ArticleDetail> {
  return apiRequest<ArticleDetail>(
    `/api/v1/articles/${encodeURIComponent(articleId)}`,
    {},
    ARTICULO_FALLBACK,
  );
}

const formateadores = new Map<string, Intl.NumberFormat>();

/** Dinero del backend (texto decimal + moneda); no se recalcula, solo se presenta. */
export function formatearDinero(money: Money | null | undefined): string | null {
  if (!money) return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return `${money.amount} ${money.currency}`;
  const currency = money.currency || "CLP";
  let formatter = formateadores.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("es-CL", { style: "currency", currency });
    } catch {
      return `${money.amount} ${currency}`;
    }
    formateadores.set(currency, formatter);
  }
  return formatter.format(amount);
}

const UNIDADES: Record<string, [string, string]> = {
  box: ["caja", "cajas"],
  bottle: ["frasco", "frascos"],
  package: ["envase", "envases"],
  unit: ["unidad", "unidades"],
};

/** Etiqueta de una unidad del backend; si no se conoce, se muestra el código tal cual. */
export function etiquetaUnidad(unit: string | null | undefined, quantity?: string | null): string {
  if (!unit) return "";
  const par = UNIDADES[unit];
  if (!par) return unit;
  const n = Number(quantity ?? "1");
  return n === 1 ? par[0] : par[1];
}

/**
 * Cifra en formato local. El backend guarda cantidades como decimales (`"120.000"`); mostrarlas
 * tal cual haría creer que son 120 mil. No se altera el valor: solo se presenta en es-CL.
 */
export function formatearCantidad(quantity: string | number | null | undefined): string | null {
  if (quantity == null || quantity === "") return null;
  const valor = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(valor)) return String(quantity);
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(valor);
}

/** «6 cajas», «1 caja» o solo la cifra si la unidad no viene informada. */
export function describirCantidad(
  quantity: string | null | undefined,
  unit: string | null | undefined,
): string | null {
  const cifra = formatearCantidad(quantity);
  if (cifra == null) return null;
  const etiqueta = etiquetaUnidad(unit, quantity);
  return etiqueta ? `${cifra} ${etiqueta}` : cifra;
}

/** La medida puede venir directa (E1) o envuelta en `content.measure` (E3). */
function medidaDeContenido(
  contenido: Measure | ContentAttribute | null | undefined,
): Measure | null {
  if (!contenido) return null;
  const envuelta = (contenido as ContentAttribute).measure;
  return envuelta ?? (contenido as Measure);
}

/** Presentación legible a partir de la unidad comercial y el contenido declarado. */
export function resumenPresentacion(presentation: Presentation | null | undefined): string | null {
  if (!presentation) return null;
  const unidad = presentation.commercial_unit?.original_text?.trim();
  const medida = medidaDeContenido(presentation.content);
  const texto =
    medida?.original_text?.trim() ||
    (medida?.value && medida?.unit ? `${medida.value} ${medida.unit}` : null);
  const partes = [unidad, texto].filter((parte): parte is string => Boolean(parte));
  if (partes.length > 0) return partes.join(" · ");
  if (presentation.units_per_commercial_unit) {
    return `${presentation.units_per_commercial_unit} unidades por envase`;
  }
  return null;
}

function ivaEnImpuestos(offer: Offer): boolean | null {
  for (const tax of offer.taxes) {
    if (tax["kind"] === "iva" && typeof tax["included_in_price"] === "boolean") {
      return tax["included_in_price"];
    }
  }
  return null;
}

/** IVA solo cuando el backend lo declara; si no, `null` para mostrar «No informado». */
export function describirIva(offer: Offer): string | null {
  const incluido =
    typeof offer.price.tax_included === "boolean"
      ? offer.price.tax_included
      : ivaEnImpuestos(offer);
  if (incluido === null) return null;
  return incluido ? "Precio con IVA incluido" : "Precio sin IVA";
}

function umbralDeDescuento(rule: Record<string, unknown>): string | null {
  const directo = rule["min_quantity"];
  if (typeof directo === "string" && directo !== "") return directo;
  const threshold = rule["threshold"];
  if (threshold && typeof threshold === "object" && "quantity" in threshold) {
    const cantidad = (threshold as { quantity?: unknown }).quantity;
    if (typeof cantidad === "string" && cantidad !== "") return cantidad;
  }
  return null;
}

/** Descuentos tal como los declara el backend; nunca se aplican ni se suman aquí. */
export function describirDescuentos(offer: Offer): string {
  if (offer.discounts.length === 0) return "Sin descuentos informados";
  const partes = offer.discounts.map((rule) => {
    const kind = rule["kind"];
    const value = rule["value"];
    const desde = umbralDeDescuento(rule);
    const condicion = desde ? ` desde ${desde}` : "";
    if (kind === "percent" && typeof value === "string") return `${value}%${condicion}`;
    if (kind === "amount" && typeof value === "string") {
      const monto = formatearDinero({ amount: value, currency: offer.price.money.currency });
      return `${monto ?? value}${condicion}`;
    }
    return "Condición informada por el proveedor";
  });
  const texto = partes.join(" · ");
  return offer.price.discount_included === true ? `${texto} (ya incluido en el precio)` : texto;
}

/** Campos que el backend no informa para esta oferta y que impiden un costo completo. */
export function faltantesDeOferta(offer: Offer): string[] {
  const faltantes: string[] = [];
  if (!describirIva(offer)) faltantes.push("Si el precio incluye IVA");
  if (offer.stock.status !== "known" || offer.stock.quantity == null) {
    faltantes.push("Disponibilidad (stock)");
  }
  if (offer.discounts.length === 0) faltantes.push("Descuentos y promociones");
  faltantes.push("Costo de despacho");
  if (!offer.minimum.known) faltantes.push("Cantidad mínima de compra");
  faltantes.push("Condiciones de pago");
  return faltantes;
}

/** Mensaje para la persona; los detalles técnicos se quedan en el `ApiError`. */
export function mensajeDeError(error: unknown): string {
  if (error && typeof error === "object" && "status" in error && "message" in error) {
    const status = (error as { status: unknown }).status;
    const message = (error as { message: unknown }).message;
    if (status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (status === 403) return "Tu cuenta no tiene permiso para consultar el catálogo.";
    if (status === 404) return "No encontramos ese artículo en el catálogo.";
    if (status === 429) {
      return "Demasiadas búsquedas seguidas. Espera un momento e inténtalo otra vez.";
    }
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return BUSQUEDA_FALLBACK;
}
