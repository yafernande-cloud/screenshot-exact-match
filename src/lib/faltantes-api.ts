/**
 * Cliente de la bandeja real de faltantes (backend FastAPI).
 *
 * Solo consume el contrato existente: `GET /api/v1/demand-items`, `POST
 * /api/v1/demand-items/{id}/quantity-commands` y `POST /api/v1/demand-items/{id}/cancel`.
 * La identidad y los permisos los resuelve el backend; aquí no se decide nada de negocio.
 */

import { apiRequest, apiRequestBlob, ApiError } from "@/lib/api";

/** Nombre del producto separado para presentarlo en dos niveles (título y detalles). */
export interface PartesNombre {
  name: string;
  details: string[];
}

/** Fila de `DemandItemOut` tal como la entrega el backend. */
export interface Faltante {
  id: string;
  display_name: string;
  /**
   * Encabezado y detalles del nombre (`" ".join([name, ...details])` es `display_name`).
   * Puede faltar en un backend anterior: entonces se usa `display_name` completo.
   */
  display_parts?: PartesNombre | null;
  /** Ruta relativa de la fotografía original (privada); `null` si el aviso no tuvo foto. */
  photo_url?: string | null;
  /**
   * Consulta corta que propone el backend para las cadenas (nombre comercial si existe).
   * Puede faltar en un backend anterior: el frontend cae a `display_parts.name` o `display_name`.
   */
  search_query?: string | null;
  ingredient: string | null;
  status: string;
  version: number;
  observation_count: number;
  reporters: string[];
  data_origin: string;
  created_at: string;
  /** Autor del reporte; cada persona tiene su propio reporte (D-135). */
  reported_by: string | null;
  reported_by_name: string | null;
  branch_label: string | null;
  /** Cantidad que declaró el auxiliar. No es la cantidad objetivo de compra. */
  declared_quantity: string | null;
  declared_unit: string | null;
  /** Campos de D-147: pueden faltar en un backend anterior. */
  requested_quantity?: string | null;
  requested_unit?: string | null;
  requested_quantity_origin?: "explicit" | "default" | null;
  /** Cantidad objetivo decidida por compras. `null` = todavía sin definir. */
  target_quantity: string | null;
  quantity_unit: string | null;
  quantity_status: "unknown" | "defined";
  needs_quantity: boolean;
  reported_at: string | null;
  cancelled_at: string | null;
  last_raw_text: string | null;
}

export interface PaginaFaltantes {
  items: Faltante[];
  next_cursor: string | null;
  pending_review_count: number;
}

export interface EventoCantidad {
  id: string;
  operation: string;
  value: string | null;
  unit: string | null;
  before_value: string | null;
  before_unit: string | null;
  after_value: string | null;
  after_unit: string | null;
  version_after: number;
  actor: string;
  reason: string | null;
  created_at: string;
}

export interface ResultadoCantidad {
  replayed: boolean;
  previous_quantity: string | null;
  previous_unit: string | null;
  item: Faltante;
  event: EventoCantidad;
}

export interface ResultadoCancelacion {
  item: Faltante;
  affected_quote_lines: Array<Record<string, unknown>>;
  message: string;
}

const LISTA_FALLBACK = "No pudimos cargar los faltantes. Inténtalo otra vez.";
const CANTIDAD_FALLBACK = "No pudimos guardar la cantidad. Inténtalo otra vez.";
const CANCELAR_FALLBACK = "No pudimos retirar el reporte. Inténtalo otra vez.";
const FOTO_FALLBACK = "No pudimos cargar la fotografía. Inténtalo otra vez.";

/** Tope de seguridad: la bandeja activa es pequeña; nunca se deja una página sin leer. */
const MAX_PAGINAS = 40;

/**
 * Lista completa de faltantes activos, siguiendo `next_cursor` hasta el final.
 *
 * El backend pagina por cursor; se deduplica por id por si una página se repite durante una
 * actualización concurrente.
 */
export async function listarFaltantes(limit = 50): Promise<Faltante[]> {
  const items: Faltante[] = [];
  const vistos = new Set<string>();
  let cursor: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const params = new URLSearchParams({ status: "active", limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    const data = await apiRequest<PaginaFaltantes>(
      `/api/v1/demand-items?${params.toString()}`,
      {},
      LISTA_FALLBACK,
    );
    for (const item of data.items) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      items.push(item);
    }
    cursor = data.next_cursor;
    if (!cursor) break;
  }

  return items;
}

/** Clave de idempotencia por operación: repetir un reintento no duplica el cambio. */
export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `faltante-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cabecerasMutacion(version: number, clave: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // El backend acepta la versión entre comillas, igual que un ETag.
    "If-Match": `"${version}"`,
    "Idempotency-Key": clave,
  };
}

/** Fija la cantidad objetivo con SET explícito (nunca ADD sobre una cantidad desconocida). */
export function fijarCantidad(
  faltante: Faltante,
  cantidad: number,
  unidad: string,
  motivo?: string,
): Promise<ResultadoCantidad> {
  return apiRequest<ResultadoCantidad>(
    `/api/v1/demand-items/${encodeURIComponent(faltante.id)}/quantity-commands`,
    {
      method: "POST",
      headers: cabecerasMutacion(faltante.version, nuevaClaveIdempotencia()),
      body: JSON.stringify({
        operation: "SET",
        value: String(cantidad),
        unit: unidad,
        ...(motivo ? { reason: motivo } : {}),
      }),
    },
    CANTIDAD_FALLBACK,
  );
}

/** Cancelación lógica: el reporte sale de la bandeja activa y conserva observaciones e historial. */
export function cancelarFaltante(
  faltante: Faltante,
  motivo = "Retirado desde la bandeja de faltantes",
): Promise<ResultadoCancelacion> {
  return apiRequest<ResultadoCancelacion>(
    `/api/v1/demand-items/${encodeURIComponent(faltante.id)}/cancel`,
    {
      method: "POST",
      headers: cabecerasMutacion(faltante.version, nuevaClaveIdempotencia()),
      body: JSON.stringify({ reason: motivo }),
    },
    CANCELAR_FALLBACK,
  );
}

/** La versión cambió entre la lectura y el guardado: hay que refrescar, no reintentar a ciegas. */
export function esConflictoDeVersion(error: unknown): boolean {
  return error instanceof ApiError && error.code === "VERSION_CONFLICT";
}

/**
 * Descarga la fotografía original del reporte con la misma identidad que el resto de la API.
 *
 * Devuelve un `Blob` para mostrarlo con una URL de objeto temporal: la ruta privada no sirve como
 * `<img src>` porque el navegador no enviaría el encabezado de autenticación.
 */
export function cargarFotografia(photoUrl: string): Promise<Blob> {
  if (!photoUrl) {
    return Promise.reject(
      new ApiError(404, "PHOTO_NOT_AVAILABLE", "La fotografía no está disponible."),
    );
  }
  return apiRequestBlob(photoUrl, FOTO_FALLBACK);
}

export function esErrorDePermiso(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** Mensaje para la persona; nunca expone detalles internos. */
export function mensajeDeErrorFaltantes(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (error.status === 403) return "Tu cuenta no tiene permiso para esta acción.";
    if (error.status === 0 || error.code === "NETWORK") {
      return "No pudimos contactar el servidor. Revisa tu conexión e inténtalo otra vez.";
    }
    return error.message;
  }
  return "Ocurrió un error inesperado. Inténtalo otra vez.";
}
