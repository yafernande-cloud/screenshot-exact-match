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
  laboratory_as_published: string | null;
  presentation_as_published: string | null;
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

export type EstadoFuenteAhumada =
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

const AHUMADA = "ahumada" as const;
const POLL_MS = 400;
const MAX_POLLS = 25;

const MENSAJES: Record<string, string> = {
  access_not_authorized:
    "La conexión con Farmacias Ahumada aún no tiene autorización de uso. No se muestran precios.",
  live_source_not_configured:
    "La fuente autorizada de Farmacias Ahumada no está configurada. No se muestran precios.",
};

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Inicia E15 para Ahumada y sondea hasta obtener su fuente. No consulta otras cadenas. */
export async function buscarCadenasAhumada(query: string): Promise<ChainSource> {
  const started = await apiRequest<ChainSearchAccepted>(
    "/api/v1/chain-searches",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, chains: [AHUMADA], purpose: "search" }),
    },
    "No pudimos buscar en Farmacias Ahumada. Inténtalo otra vez.",
  );

  for (let intento = 0; intento < MAX_POLLS; intento += 1) {
    const data = await apiRequest<ChainSearchResponse>(
      `/api/v1/chain-searches/${encodeURIComponent(started.search_id)}`,
      {},
      "No pudimos leer el resultado de Farmacias Ahumada.",
    );
    const source = data.sources.find((item) => item.chain === AHUMADA);
    if (source) return source;
    if (intento < MAX_POLLS - 1) await esperar(POLL_MS);
  }

  throw new Error("La búsqueda en Farmacias Ahumada no respondió a tiempo.");
}

/**
 * Traduce el estado de la fuente a lo que la tarjeta puede mostrar. Un fallo nunca se convierte
 * en «sin resultados» y una cadena sin conexión nunca se presenta como conectada.
 */
export function estadoFuenteAhumada(
  estado: "inicial" | "cargando" | "listo" | "error",
  fuente: ChainSource | null,
  error: string | null,
): EstadoFuenteAhumada {
  if (estado === "inicial") return { tipo: "inicial" };
  if (estado === "cargando") return { tipo: "cargando" };
  if (estado === "error" || !fuente) {
    return {
      tipo: "error",
      mensaje: error ?? "No pudimos consultar Farmacias Ahumada. Inténtalo otra vez.",
    };
  }
  if (fuente.state === "not_configured") {
    return {
      tipo: "no_configurada",
      mensaje: MENSAJES[fuente.reason ?? ""] ?? "Farmacias Ahumada no tiene conexión disponible.",
    };
  }
  if (fuente.state === "failed") {
    return {
      tipo: "error",
      mensaje:
        "Farmacias Ahumada no respondió. No se muestran precios para no usar datos incompletos.",
    };
  }
  if (fuente.results.length === 0) {
    return {
      tipo: "vacia",
      mensaje: "No encontramos publicaciones de Farmacias Ahumada para esta búsqueda.",
    };
  }
  return {
    tipo: "resultados",
    resultados: fuente.results,
    observadoEn: fuente.observed_at,
    desactualizado: fuente.state === "stale",
  };
}
