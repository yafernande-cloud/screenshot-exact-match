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

export interface Interpretacion {
  interpretation_id: string;
  status: Exclude<EstadoInterpretacion, "sin_interpretacion">;
  error_code: string | null;
  retired_subject_kinds: string[];
  created_at: string;
  preferences: PreferenciaComercial[];
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

export interface DatosObservacion {
  texto: string;
  articuloId: string;
  proveedorId?: string | null | undefined;
  ofertaId?: string | null | undefined;
}

interface CuerpoObservacion {
  text: string;
  trade_item_id: string;
  supplier_id?: string;
  offer_snapshot_id?: string;
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
    trade_item_id: datos.articuloId,
  };
  // Solo se envía lo que la tarjeta realmente conoce; nunca se completa a mano.
  if (datos.proveedorId) cuerpo.supplier_id = datos.proveedorId;
  if (datos.ofertaId) cuerpo.offer_snapshot_id = datos.ofertaId;
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
  const tolerancia = preferencia.tolerance
    ? preferencia.tolerance.kind === "relative_percent" && preferencia.tolerance.percent
      ? `, con hasta ${preferencia.tolerance.percent} % más de precio`
      : preferencia.tolerance.kind === "absolute_amount" && preferencia.tolerance.amount
        ? `, con hasta ${preferencia.tolerance.amount} ${preferencia.tolerance.currency ?? ""} de diferencia`.trimEnd()
        : ""
    : "";
  return `${base} ${efecto}${tolerancia}.`;
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
