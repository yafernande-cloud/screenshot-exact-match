/**
 * E15 — precios públicos de cadenas. Aquí solo se obtienen y normalizan datos publicados: no se
 * calculan precios, no se comparan cadenas y ningún resultado entra al carrito de proveedores.
 *
 * La fuente en vivo del backend está apagada hasta que exista autorización. Cuando no hay
 * conexión, la API responde `not_configured` y la tarjeta lo muestra sin inventar datos.
 */

import { apiRequest } from "@/lib/api";
import { mensajeDeError, type Money } from "@/lib/catalogo";

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
  /** Enlace público a la publicación; puede faltar y entonces se informa en la tarjeta. */
  source_url: string | null;
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
export type EstadoFuenteCruzVerde = EstadoFuenteCadena;

type Cadena = "ahumada" | "salcobrand" | "cruz_verde";

const POLL_MS = 400;
const MAX_POLLS = 25;
/** Un solo reintento del GET por identificador para tolerar un cambio de proceso transitorio. */
const REINTENTOS_404 = 1;
/** Mensaje final cuando ni siquiera la búsqueda reiniciada conserva su identificador. */
export const MENSAJE_BUSQUEDA_INTERRUMPIDA = "La consulta se interrumpió. Inténtalo nuevamente";
/** Tope de publicaciones que muestra la tarjeta de Salcobrand, aunque el backend entregue más. */
const MAX_SALCOBRAND = 24;
/** Cruz Verde entrega hasta 24 resultados orgánicos; este es el mismo tope de presentación. */
const MAX_CRUZVERDE = 24;

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

const MENSAJES_CRUZVERDE: Record<string, string> = {
  access_not_authorized:
    "La conexión con Cruz Verde aún no tiene autorización de uso. No se muestran precios.",
  live_source_not_configured:
    "La fuente autorizada de Cruz Verde no está configurada. No se muestran precios.",
};

/**
 * Un rechazo de consulta no es una caída de conexión: Cruz Verde respondió y descartó la
 * búsqueda, así que no hay precios publicados que mostrar.
 */
const MENSAJES_FALLO_CRUZVERDE: Record<string, string> = {
  query_rejected:
    "Cruz Verde no aceptó esta búsqueda. No se muestran precios para no usar datos incompletos.",
};

/** Orden de presentación: primero lo que coincide con lo pedido y al final las alternativas. */
const ORDEN_RELACION: Record<string, number> = {
  exact: 0,
  unverified: 1,
  partial: 2,
  alternative: 3,
};

function ordenarPorRelacion(resultados: ChainResult[]): ChainResult[] {
  return [...resultados].sort((a, b) => {
    const aRelation = a.match["query_relation"];
    const bRelation = b.match["query_relation"];
    const aOrden = typeof aRelation === "string" ? (ORDEN_RELACION[aRelation] ?? 4) : 4;
    const bOrden = typeof bRelation === "string" ? (ORDEN_RELACION[bRelation] ?? 4) : 4;
    return aOrden - bOrden;
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Un `SEARCH_NOT_FOUND` de E15 significa que el sondeo llegó a un proceso que no tiene el
 * identificador en memoria. Es distinto de un 404 del catálogo: aquí sí es recuperable.
 */
function esBusquedaNoEncontrada(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const fallo = error as { status?: unknown; code?: unknown };
  return fallo.status === 404 && fallo.code === "SEARCH_NOT_FOUND";
}

/** Inicia E15 para una cadena y devuelve el identificador que hay que sondear. */
async function iniciarBusqueda(query: string, cadena: Cadena, nombre: string): Promise<string> {
  const started = await apiRequest<ChainSearchAccepted>(
    "/api/v1/chain-searches",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, chains: [cadena], purpose: "search" }),
    },
    `No pudimos buscar en ${nombre}. Inténtalo otra vez.`,
  );
  return started.search_id;
}

/**
 * Sondea un identificador. Ante `SEARCH_NOT_FOUND`, `permitirReintento` habilita un único GET
 * adicional con el mismo identificador antes de darlo por perdido. No se reintenta nada más.
 */
async function sondearBusqueda(
  searchId: string,
  cadena: Cadena,
  nombre: string,
  permitirReintento: boolean,
): Promise<ChainSource> {
  let reintentos404 = 0;

  for (let intento = 0; intento < MAX_POLLS; intento += 1) {
    try {
      const data = await apiRequest<ChainSearchResponse>(
        `/api/v1/chain-searches/${encodeURIComponent(searchId)}`,
        {},
        `No pudimos leer el resultado de ${nombre}.`,
      );
      const source = data.sources.find((item) => item.chain === cadena);
      if (source) return source;
    } catch (error) {
      if (!esBusquedaNoEncontrada(error)) throw error;
      if (!permitirReintento || reintentos404 >= REINTENTOS_404) throw error;
      reintentos404 += 1;
    }
    if (intento < MAX_POLLS - 1) await esperar(POLL_MS);
  }

  throw new Error(`La búsqueda en ${nombre} no respondió a tiempo.`);
}

/**
 * Inicia E15 para una sola cadena y sondea hasta obtener su fuente. Cada cadena lleva su propia
 * solicitud: si una falla o tarda, la otra conserva su resultado y su estado.
 *
 * Si el identificador desaparece del almacén en memoria (reinicio o cambio de proceso), se
 * reinicia **una sola vez** la búsqueda de esta cadena con un POST nuevo. No hay bucles: un
 * segundo `SEARCH_NOT_FOUND` termina con el mensaje específico de consulta interrumpida.
 */
async function buscarCadena(query: string, cadena: Cadena, nombre: string): Promise<ChainSource> {
  const primerId = await iniciarBusqueda(query, cadena, nombre);
  try {
    return await sondearBusqueda(primerId, cadena, nombre, true);
  } catch (error) {
    if (!esBusquedaNoEncontrada(error)) throw error;
  }

  const segundoId = await iniciarBusqueda(query, cadena, nombre);
  return sondearBusqueda(segundoId, cadena, nombre, false);
}

/**
 * Mensaje de una búsqueda de cadena. Un `SEARCH_NOT_FOUND` persistente no es «artículo no
 * encontrado en el catálogo»: el catálogo conserva su propio mapeo en `mensajeDeError`.
 */
export function mensajeDeErrorCadena(error: unknown): string {
  if (esBusquedaNoEncontrada(error)) return MENSAJE_BUSQUEDA_INTERRUMPIDA;
  return mensajeDeError(error);
}

/** Inicia E15 para Ahumada con la misma solicitud y los mismos mensajes de siempre. */
export async function buscarCadenasAhumada(query: string): Promise<ChainSource> {
  return buscarCadena(query, "ahumada", "Farmacias Ahumada");
}

/** Inicia E15 para Salcobrand; no consulta Ahumada ni ninguna otra cadena. */
export async function buscarCadenasSalcobrand(query: string): Promise<ChainSource> {
  return buscarCadena(query, "salcobrand", "Farmacias Salcobrand");
}

/** Inicia E15 para Cruz Verde con su propio interruptor y su propia solicitud. */
export async function buscarCadenasCruzVerde(query: string): Promise<ChainSource> {
  return buscarCadena(query, "cruz_verde", "Cruz Verde");
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
  mensajesFallo: Record<string, string> = {},
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
      mensaje:
        mensajesFallo[fuente.reason ?? ""] ??
        `${nombre} no respondió. No se muestran precios para no usar datos incompletos.`,
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
    resultados: ordenarPorRelacion(fuente.results).slice(0, limite),
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

export function estadoFuenteCruzVerde(
  estado: "inicial" | "cargando" | "listo" | "error",
  fuente: ChainSource | null,
  error: string | null,
): EstadoFuenteCruzVerde {
  return estadoFuenteCadena(
    estado,
    fuente,
    error,
    "Cruz Verde",
    MENSAJES_CRUZVERDE,
    MAX_CRUZVERDE,
    MENSAJES_FALLO_CRUZVERDE,
  );
}
