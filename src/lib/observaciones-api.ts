/**
 * Observaciones comerciales e interpretación («Enseñar a la IA», O1–O4).
 *
 * Solo consume los endpoints existentes: guardar la observación, pedir su interpretación y leer
 * la preferencia vigente del artículo. El frontend **no** interpreta, no ordena ofertas y no
 * inventa identificadores: el artículo, el proveedor y la oferta salen de los datos ya persistidos
 * que muestra la tarjeta (E3 o el precio importado de la lista).
 *
 * La salida de la IA nunca se muestra cruda: ni JSON, ni puntuaciones, ni tokens. Los estados se
 * traducen a frases para la persona administradora.
 */

import { apiRequest } from "@/lib/api";

/** Mismo límite que el backend: 1–2000 caracteres, sin normalizar. */
export const TEXTO_MAXIMO = 2000;

export type EstadoInterpretacion =
  | "sin_interpretacion"
  | "suggested"
  | "confirmed"
  | "rejected"
  | "failed"
  | "needs_review"
  | "no_preference";

export type TipoSujeto = "laboratory" | "brand" | "supplier" | "availability" | "price";

export interface Tolerancia {
  kind: "relative_percent" | "absolute_amount";
  percent: string | null;
  amount: string | null;
  currency: string | null;
}

export interface ReferenciaPrecio {
  kind: "acceptable" | "maximum";
  amount: string;
  currency: string;
  basis: string;
  quantity: string | null;
  quantity_unit: string | null;
}

export interface PreferenciaComercial {
  preference_id: string;
  subject_kind: TipoSujeto;
  subject_label: string;
  effect: "prefer" | "deprioritize";
  tolerance: Tolerancia | null;
  price_reference: ReferenciaPrecio | null;
}

/**
 * Preferencia entre dos artículos del catálogo (A6, capa transversal).
 *
 * `prefer` gana frente al artículo alternativo; `deprioritize` baja la prioridad del artículo;
 * `retire` deja sin efecto una baja anterior. Nunca expresa una equivalencia farmacológica.
 */
export interface PreferenciaArticulo {
  article_preference_id: string;
  article_id: string;
  article_label: string;
  relative_to_article_id: string | null;
  relative_to_article_label: string | null;
  effect: "prefer" | "deprioritize" | "retire";
}

export interface CandidatoAclaracion {
  article_id: string;
  display_name: string;
}

/**
 * Pregunta de aclaración cuando el comentario menciona un producto que no se puede identificar de
 * forma inequívoca. Mientras exista, la preferencia **no** está aplicada.
 */
export interface Aclaracion {
  kind: string;
  question: string;
  reference: string | null;
  candidates: CandidatoAclaracion[];
}

export interface Interpretacion {
  interpretation_id: string;
  status: Exclude<EstadoInterpretacion, "sin_interpretacion">;
  error_code: string | null;
  retired_subject_kinds: string[];
  created_at: string;
  preferences: PreferenciaComercial[];
  /** Preferencias entre artículos; opcional para respuestas anteriores a esta capa. */
  article_preferences?: PreferenciaArticulo[];
  clarification?: Aclaracion | null;
}

export interface ObservacionComercial {
  observation_id: string;
  text: string;
  trade_item_id: string;
  supplier_id: string | null;
  offer_snapshot_id: string | null;
  interpretation_status: EstadoInterpretacion;
  interpretation: Interpretacion | null;
  retired_subject_kinds: string[];
}

export interface ResultadoInterpretacion {
  replayed: boolean;
  observation: ObservacionComercial;
}

/**
 * Oferta en vivo que la persona está viendo, con sus datos comerciales públicos.
 *
 * Permite enseñar sin volver a elegir un artículo: el backend resuelve la identidad con el
 * vínculo, el EAN o una identidad técnica propia del SKU, y usa estos datos como contexto real
 * de la interpretación. No declara ninguna equivalencia con otro producto.
 */
export interface ContextoOferta {
  source_id: string;
  external_id: string;
  name: string;
  supplier_id?: string | null | undefined;
  laboratory?: string | null | undefined;
  brand?: string | null | undefined;
  presentation?: string | null | undefined;
  price?: { amount: string; currency: string } | null | undefined;
  price_basis?: string | null | undefined;
  sale_unit?: string | null | undefined;
  stock_status?: string | null | undefined;
  stock_quantity?: string | null | undefined;
  stock_unit?: string | null | undefined;
  ean?: string | null | undefined;
  product_url?: string | null | undefined;
  image_url?: string | null | undefined;
}

export interface DatosObservacion {
  texto: string;
  /** Artículo ya vinculado; puede faltar si se enseña desde una oferta en vivo. */
  articuloId?: string | null | undefined;
  proveedorId?: string | null | undefined;
  ofertaId?: string | null | undefined;
  /** Oferta en vivo que originó el comentario; el backend resuelve su identidad interna. */
  oferta?: ContextoOferta | null | undefined;
  /** Observación que se está aclarando; queda enlazada en el contexto de la nueva. */
  observacionAnteriorId?: string | null | undefined;
}

interface CuerpoObservacion {
  text: string;
  trade_item_id?: string;
  offer?: ContextoOferta;
  supplier_id?: string;
  offer_snapshot_id?: string;
  previous_observation_id?: string;
}

/**
 * Clave de idempotencia del guardado: repetir el envío con la misma clave y el mismo contenido
 * devuelve la observación original en vez de crear otra.
 */
export function nuevaClaveDeIdempotencia(): string {
  const azar = globalThis.crypto;
  if (azar && typeof azar.randomUUID === "function") return azar.randomUUID();
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Guarda la observación tal como la escribió la persona y devuelve su identificador. */
export async function guardarObservacion(
  datos: DatosObservacion,
  claveIdempotencia: string,
): Promise<ObservacionComercial> {
  const cuerpo: CuerpoObservacion = {
    text: datos.texto.trim(),
  };
  // Solo se envía lo que la tarjeta realmente conoce; nunca se completa a mano.
  if (datos.articuloId) cuerpo.trade_item_id = datos.articuloId;
  if (datos.oferta) cuerpo.offer = datos.oferta;
  if (datos.proveedorId) cuerpo.supplier_id = datos.proveedorId;
  if (datos.ofertaId) cuerpo.offer_snapshot_id = datos.ofertaId;
  if (datos.observacionAnteriorId) {
    cuerpo.previous_observation_id = datos.observacionAnteriorId;
  }
  return apiRequest<ObservacionComercial>(
    "/api/v1/commercial-observations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": claveIdempotencia,
      },
      body: JSON.stringify(cuerpo),
    },
    "No pudimos guardar el comentario. Inténtalo otra vez.",
  );
}

/**
 * Pide la interpretación de una observación ya guardada. Repetirla es seguro: el backend devuelve
 * el intento procesado (`replayed`) o solo reintenta un fallo, sin duplicar la observación.
 */
export async function interpretarObservacion(
  observacionId: string,
): Promise<ResultadoInterpretacion> {
  return apiRequest<ResultadoInterpretacion>(
    `/api/v1/commercial-observations/${observacionId}/interpretations`,
    { method: "POST" },
    "No pudimos interpretar el comentario. Inténtalo otra vez.",
  );
}

function estadoHttp(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** La instalación no tiene la interpretación con IA habilitada (`503 OBSERVATION_AI_DISABLED`). */
export function esIaDeshabilitada(error: unknown): boolean {
  return estadoHttp(error) === 503;
}

/**
 * ¿Repetir la operación puede funcionar? Solo cuando el fallo es de red, de ritmo o del
 * servicio (5xx). Un 400/409/422 no cambia por repetirlo: hay que corregir el comentario.
 */
export function esErrorTransitorio(error: unknown): boolean {
  const status = estadoHttp(error);
  return status === null || status === 429 || status >= 500;
}

/** El comentario se puede corregir y volver a enviar (error del contenido, no técnico). */
export function esErrorCorregible(error: unknown): boolean {
  const status = estadoHttp(error);
  return status === 400 || status === 409 || status === 422;
}

/** Mensaje para la persona; nunca expone códigos, prompts ni detalles técnicos. */
export function mensajeDeErrorObservacion(error: unknown): string {
  switch (estadoHttp(error)) {
    case 401:
      return "Tu sesión expiró. Inicia sesión otra vez.";
    case 403:
      return "Solo una persona administradora puede enseñar preferencias.";
    case 404:
      return "El producto o el proveedor ya no está disponible en el catálogo.";
    case 400:
    case 422:
      return "Revisa el comentario: no pudimos guardarlo tal como está.";
    case 409:
      return "Ese comentario ya se guardó con otro contenido. Escribe uno nuevo.";
    default:
      return "No pudimos completar la solicitud. Inténtalo otra vez.";
  }
}

const NOMBRES_DE_CLASE: Record<string, string> = {
  laboratory: "laboratorio",
  brand: "marca",
  supplier: "proveedor",
  availability: "disponibilidad",
  price: "precio",
};

/**
 * La base guarda la tolerancia como `NUMERIC(6,3)` y la API la serializa tal cual: «10.000».
 * Ese punto es decimal, no de miles; sin formatear se lee como diez mil. Se presenta en es-CL
 * («10», «12,5») sin tocar el valor guardado ni la regla del motor.
 */
const formateadorPorcentaje = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

export function formatearPorcentaje(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? formateadorPorcentaje.format(numero) : valor;
}

/** Frase breve de una preferencia aplicada, sin explicaciones ni puntuaciones de la IA. */
export function describirPreferencia(preferencia: PreferenciaComercial): string {
  if (preferencia.subject_kind === "availability") {
    return "Se prefieren las ofertas con stock informado.";
  }
  const clase = NOMBRES_DE_CLASE[preferencia.subject_kind] ?? "preferencia";
  const etiqueta = preferencia.subject_label.trim();
  const base = `${clase.charAt(0).toUpperCase()}${clase.slice(1)} «${etiqueta}»`;
  const efecto =
    preferencia.effect === "deprioritize"
      ? "queda después en el orden"
      : preferencia.subject_kind === "price"
        ? "se usa como referencia de precio"
        : "se prefiere";
  const porcentaje = preferencia.tolerance
    ? (formatearPorcentaje(preferencia.tolerance.percent) ?? preferencia.tolerance.percent)
    : null;
  const tolerancia = preferencia.tolerance
    ? preferencia.tolerance.kind === "relative_percent" && porcentaje
      ? `, con hasta ${porcentaje} % más de precio`
      : preferencia.tolerance.kind === "absolute_amount" && preferencia.tolerance.amount
        ? `, con hasta ${preferencia.tolerance.amount} ${preferencia.tolerance.currency ?? ""} de diferencia`.trimEnd()
        : ""
    : "";
  return `${base} ${efecto}${tolerancia}.`;
}

/** Frase breve de una preferencia entre artículos, sin vocabulario de equivalencia. */
export function describirPreferenciaArticulo(preferencia: PreferenciaArticulo): string {
  const articulo = `«${preferencia.article_label.trim()}»`;
  if (preferencia.effect === "retire") {
    return `Se dejó sin efecto la baja de prioridad de ${articulo}.`;
  }
  if (preferencia.effect === "deprioritize") {
    return `Las ofertas de ${articulo} quedan después de las demás comparables.`;
  }
  const alternativa = preferencia.relative_to_article_label?.trim();
  return alternativa
    ? `Se prefiere ${articulo} frente a «${alternativa}» cuando ambos son comparables.`
    : `Se prefiere ${articulo} frente a la alternativa mencionada.`;
}

/** Clases retirables (`price:acceptable`, …) en palabras. */
export function describirRetiro(clase: string): string {
  const [base, detalle] = clase.split(":");
  const nombre =
    base === "price"
      ? detalle === "maximum"
        ? "precio máximo"
        : "precio aceptable"
      : (NOMBRES_DE_CLASE[base ?? ""] ?? base ?? "preferencia");
  return `Se dejó sin efecto la preferencia de ${nombre}.`;
}
