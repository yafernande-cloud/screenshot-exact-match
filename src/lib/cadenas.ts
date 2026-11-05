/**
 * E15 — precios públicos de cadenas. Aquí solo se obtienen y normalizan datos publicados: no se
 * calculan precios, no se comparan cadenas y ningún resultado entra al carrito de proveedores.
 *
 * La fuente en vivo del backend está apagada hasta que exista autorización. Cuando no hay
 * conexión, la API responde `not_configured` y la tarjeta lo muestra sin inventar datos.
 */

import { apiRequest } from "@/lib/api";
import type { Money } from "@/lib/catalogo";

export interface ChainPrice extends Money {
  per_unit?: string | null;
}

export interface ChainResult {
  chain_item_id: string;
  published_name: string;
  /** Marca comercial publicada; nunca se usa como laboratorio. */
  brand_as_published?: string | null;
  laboratory_as_published: string | null;
  presentation_as_published: string | null;
  /** Disponibilidad publicada por la cadena; null/ausente se muestra como «no informada». */
  has_stock?: boolean | null;
  description: string | null;
  image_url: string | null;
  price: {
    normal: ChainPrice | null;
    promotional: ChainPrice | null;
    fractional: ChainPrice | null;
  };
  conditions: string | null;
  source_url: string;
  observed_at: string;
  provenance: Record<string, unknown>;
  match: Record<string, unknown>;
}

export interface ChainSource {
  chain: "cruz_verde" | "salcobrand" | "ahumada";
  state: "ok" | "stale" | "failed" | "not_configured";
  reason: string | null;
  outcome: "matches" | "no_matches" | null;
  observed_at: string | null;
  results: ChainResult[];
}

interface ChainSearchAccepted {
  search_id: string;
  status: "pending";
  expires_at: string;
}

interface ChainSearchResponse {
  search_id: string;
  status: "completed" | "failed";
  query: string;
  purpose: string;
  created_at: string;
  expires_at: string;
  sources: ChainSource[];
}

export type EstadoFuenteCadena =
  | { tipo: "inicial" }
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "no_configurada"; mensaje: string }
  | { tipo: "vacia"; mensaje: string }
  | {
      tipo: "resultados";
      resultados: ChainResult[];
      observadoEn: string | null;
      desactualizado: boolean;
    };

/** Nombre histórico del estado de Ahumada; ambas tarjetas comparten la misma forma. */
export type EstadoFuenteAhumada = EstadoFuenteCadena;
export type EstadoFuenteSalcobrand = EstadoFuenteCadena;

type Cadena = "ahumada" | "salcobrand";

const POLL_MS = 400;
const MAX_POLLS = 25;
/** Tope de publicaciones que muestra la tarjeta de Salcobrand, aunque el backend entregue más. */
const MAX_SALCOBRAND = 24;

const MENSAJES_AHUMADA: Record<string, string> = {
  access_not_authorized:
    "La conexión con Farmacias Ahumada aún no tiene autorización de uso. No se muestran precios.",
  live_source_not_configured:
    "La fuente autorizada de Farmacias Ahumada no está configurada. No se muestran precios.",
};

const MENSAJES_SALCOBRAND: Record<string, string> = {
  access_not_authorized:
    "La conexión con Farmacias Salcobrand aún no tiene autorización de uso. No se muestran precios.",
  live_source_not_configured:
    "La fuente autorizada de Farmacias Salcobrand no está configurada. No se muestran precios.",
};

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Inicia E15 para una sola cadena y sondea hasta obtener su fuente. Cada cadena lleva su propia
 * solicitud: si una falla o tarda, la otra conserva su resultado y su estado.
 */
async function buscarCadena(query: string, cadena: Cadena, nombre: string): Promise<ChainSource> {
  const started = await apiRequest<ChainSearchAccepted>(
    "/api/v1/chain-searches",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, chains: [cadena], purpose: "search" }),
    },
    `No pudimos buscar en ${nombre}. Inténtalo otra vez.`,
  );

  for (let intento = 0; intento < MAX_POLLS; intento += 1) {
    const data = await apiRequest<ChainSearchResponse>(
      `/api/v1/chain-searches/${encodeURIComponent(started.search_id)}`,
      {},
      `No pudimos leer el resultado de ${nombre}.`,
    );
    const source = data.sources.find((item) => item.chain === cadena);
    if (source) return source;
    if (intento < MAX_POLLS - 1) await esperar(POLL_MS);
  }

  throw new Error(`La búsqueda en ${nombre} no respondió a tiempo.`);
}

/** Inicia E15 para Ahumada con la misma solicitud y los mismos mensajes de siempre. */
export async function buscarCadenasAhumada(query: string): Promise<ChainSource> {
  return buscarCadena(query, "ahumada", "Farmacias Ahumada");
}

/** Inicia E15 para Salcobrand; no consulta Ahumada ni ninguna otra cadena. */
export async function buscarCadenasSalcobrand(query: string): Promise<ChainSource> {
  return buscarCadena(query, "salcobrand", "Farmacias Salcobrand");
}

/**
 * Traduce el estado de una fuente a lo que su tarjeta puede mostrar. Un fallo nunca se convierte
 * en «sin resultados» y una cadena sin conexión nunca se presenta como conectada.
 */
function estadoFuenteCadena(
  estado: "inicial" | "cargando" | "listo" | "error",
  fuente: ChainSource | null,
  error: string | null,
  nombre: string,
  mensajes: Record<string, string>,
  limite: number = Number.POSITIVE_INFINITY,
): EstadoFuenteCadena {
  if (estado === "inicial") return { tipo: "inicial" };
  if (estado === "cargando") return { tipo: "cargando" };
  if (estado === "error" || !fuente) {
    return {
      tipo: "error",
      mensaje: error ?? `No pudimos consultar ${nombre}. Inténtalo otra vez.`,
    };
  }
  if (fuente.state === "not_configured") {
    return {
      tipo: "no_configurada",
      mensaje: mensajes[fuente.reason ?? ""] ?? `${nombre} no tiene conexión disponible.`,
    };
  }
  if (fuente.state === "failed") {
    return {
      tipo: "error",
      mensaje: `${nombre} no respondió. No se muestran precios para no usar datos incompletos.`,
    };
  }
  if (fuente.results.length === 0) {
    return {
      tipo: "vacia",
      mensaje: `No encontramos publicaciones de ${nombre} para esta búsqueda.`,
    };
  }
  return {
    tipo: "resultados",
    resultados: fuente.results.slice(0, limite),
    observadoEn: fuente.observed_at,
    desactualizado: fuente.state === "stale",
  };
}

export function estadoFuenteAhumada(
  estado: "inicial" | "cargando" | "listo" | "error",
  fuente: ChainSource | null,
  error: string | null,
): EstadoFuenteAhumada {
  return estadoFuenteCadena(estado, fuente, error, "Farmacias Ahumada", MENSAJES_AHUMADA);
}

export function estadoFuenteSalcobrand(
  estado: "inicial" | "cargando" | "listo" | "error",
  fuente: ChainSource | null,
  error: string | null,
): EstadoFuenteSalcobrand {
  return estadoFuenteCadena(
    estado,
    fuente,
    error,
    "Farmacias Salcobrand",
    MENSAJES_SALCOBRAND,
    MAX_SALCOBRAND,
  );
}
