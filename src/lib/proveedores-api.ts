/**
 * Cliente de proveedores y fuentes (backend FastAPI existente).
 *
 * Solo consume el contrato actual: E6 (`/api/v1/suppliers`) y E7 (`/api/v1/sources`). La identidad,
 * la organización y los permisos los resuelve el backend con el JWT de Supabase; aquí no se decide
 * nada de negocio. Las mutaciones de actualización viajan con `If-Match` para no pisar cambios de
 * otra sesión.
 */

import { apiRequest, ApiError } from "@/lib/api";

export type EstadoProveedor = "active" | "inactive";
export type ModoFuente = "api" | "manual_import" | "fixture" | "none";
export type CapacidadFuente = "search" | "product_detail" | "price" | "stock" | "terms";
export type EstadoFuente = "not_configured" | "ok" | "stale" | "failed";

/** Fila de `SupplierOut` (E6) tal como la entrega el backend. */
export interface Proveedor {
  supplier_id: string;
  name: string;
  supplier_code: string | null;
  status: EstadoProveedor;
  version: number;
  /** Ids de las fuentes asociadas; el detalle se lee con `listarFuentes`. */
  sources: string[];
  /** Notas internas del proveedor (`notes` al escribir). */
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de `SourceOut` (E7). Solo se administran las de tipo `supplier`. */
export interface Fuente {
  source_id: string;
  name: string;
  kind: "supplier" | "chain_reference";
  supplier_id: string | null;
  mode: ModoFuente;
  capabilities: CapacidadFuente[];
  enabled: boolean;
  /** Estado derivado por el backend (E4); nunca se guarda. */
  status: EstadoFuente;
  has_secret: boolean;
  last_success_at: string | null;
  last_error: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface NuevoProveedor {
  name: string;
  supplier_code?: string | null;
  notes?: string | null;
}

export interface CambiosProveedor {
  name?: string;
  supplier_code?: string | null;
  notes?: string | null;
  status?: EstadoProveedor;
}

export interface NuevaFuente {
  name: string;
  supplier_id: string;
  capabilities: CapacidadFuente[];
  enabled?: boolean;
}

export interface CambiosFuente {
  name?: string;
  capabilities?: CapacidadFuente[];
  enabled?: boolean;
}

const LISTA_FALLBACK = "No pudimos cargar los proveedores. Inténtalo otra vez.";
const CREAR_FALLBACK = "No pudimos registrar el proveedor. Inténtalo otra vez.";
const GUARDAR_FALLBACK = "No pudimos guardar los cambios. Inténtalo otra vez.";
const FUENTES_FALLBACK = "No pudimos cargar las fuentes de datos. Inténtalo otra vez.";
const CREAR_FUENTE_FALLBACK = "No pudimos crear la fuente de datos. Inténtalo otra vez.";

function textoLimpio(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim();
  return limpio === "" ? null : limpio;
}

/** Cabeceras de una mutación con control de versión optimista. */
function cabecerasConVersion(version: number): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // El backend acepta la versión entre comillas, igual que un ETag.
    "If-Match": `"${version}"`,
  };
}

/** Proveedores de la organización, ordenados por nombre por el backend. */
export async function listarProveedores(): Promise<Proveedor[]> {
  const data = await apiRequest<{ suppliers: Proveedor[] }>(
    "/api/v1/suppliers",
    {},
    LISTA_FALLBACK,
  );
  return data.suppliers;
}

export function crearProveedor(datos: NuevoProveedor): Promise<Proveedor> {
  return apiRequest<Proveedor>(
    "/api/v1/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: datos.name.trim(),
        supplier_code: textoLimpio(datos.supplier_code),
        notes: textoLimpio(datos.notes),
      }),
    },
    CREAR_FALLBACK,
  );
}

/** Aplica solo los campos presentes; `status` activa o desactiva sin borrar historial. */
export function actualizarProveedor(
  proveedor: Proveedor,
  cambios: CambiosProveedor,
): Promise<Proveedor> {
  const cuerpo: Record<string, unknown> = {};
  if ("name" in cambios) cuerpo["name"] = cambios.name?.trim();
  if ("supplier_code" in cambios) cuerpo["supplier_code"] = textoLimpio(cambios.supplier_code);
  if ("notes" in cambios) cuerpo["notes"] = textoLimpio(cambios.notes);
  if ("status" in cambios) cuerpo["status"] = cambios.status;

  return apiRequest<Proveedor>(
    `/api/v1/suppliers/${encodeURIComponent(proveedor.supplier_id)}`,
    {
      method: "PATCH",
      headers: cabecerasConVersion(proveedor.version),
      body: JSON.stringify(cuerpo),
    },
    GUARDAR_FALLBACK,
  );
}

/** Fuentes de proveedor de la organización. Las de cadena no se administran en esta pantalla. */
export async function listarFuentes(): Promise<Fuente[]> {
  const data = await apiRequest<{ sources: Fuente[] }>(
    "/api/v1/sources?kind=supplier",
    {},
    FUENTES_FALLBACK,
  );
  return data.sources;
}

/**
 * Crea una fuente de archivo para un proveedor (`manual_import`).
 *
 * El modo queda fijo: esta pantalla administra listas de precios recibidas como archivo, no
 * conexiones directas ni datos de simulación.
 */
export function crearFuente(datos: NuevaFuente): Promise<Fuente> {
  return apiRequest<Fuente>(
    "/api/v1/sources",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: datos.name.trim(),
        kind: "supplier",
        supplier_id: datos.supplier_id,
        mode: "manual_import",
        capabilities: datos.capabilities,
        enabled: datos.enabled ?? true,
      }),
    },
    CREAR_FUENTE_FALLBACK,
  );
}

export function actualizarFuente(fuente: Fuente, cambios: CambiosFuente): Promise<Fuente> {
  const cuerpo: Record<string, unknown> = {};
  if ("name" in cambios) cuerpo["name"] = cambios.name?.trim();
  if ("capabilities" in cambios) cuerpo["capabilities"] = cambios.capabilities;
  if ("enabled" in cambios) cuerpo["enabled"] = cambios.enabled;

  return apiRequest<Fuente>(
    `/api/v1/sources/${encodeURIComponent(fuente.source_id)}`,
    {
      method: "PATCH",
      headers: cabecerasConVersion(fuente.version),
      body: JSON.stringify(cuerpo),
    },
    GUARDAR_FALLBACK,
  );
}

/** La versión cambió entre la lectura y el guardado: hay que refrescar, no reintentar a ciegas. */
export function esConflictoDeVersion(error: unknown): boolean {
  return error instanceof ApiError && error.code === "VERSION_CONFLICT";
}

/** Capacidades que admite el backend para una fuente, con su nombre para la persona. */
export const CAPACIDADES_FUENTE: ReadonlyArray<{
  value: CapacidadFuente;
  label: string;
}> = [
  { value: "product_detail", label: "Productos y presentaciones" },
  { value: "price", label: "Precios" },
  { value: "stock", label: "Stock disponible" },
  { value: "terms", label: "Condiciones de compra" },
  { value: "search", label: "Consulta en línea" },
];

export function etiquetaCapacidad(capacidad: string): string {
  return CAPACIDADES_FUENTE.find((c) => c.value === capacidad)?.label ?? capacidad;
}

/** Nombres comprensibles: la persona administra fuentes, no `source.mode`. */
export function etiquetaModo(modo: string): string {
  switch (modo) {
    case "manual_import":
      return "Archivo de precios (Excel o CSV)";
    case "api":
      return "Conexión directa";
    case "fixture":
      return "Datos de prueba";
    default:
      return "Sin origen definido";
  }
}

export function etiquetaEstadoFuente(estado: string): string {
  switch (estado) {
    case "ok":
      return "Al día";
    case "stale":
      return "Desactualizada";
    case "failed":
      return "Con error";
    default:
      return "Sin cargas todavía";
  }
}

/** Mensaje para la persona; nunca expone detalles internos. */
export function mensajeDeErrorProveedores(
  error: unknown,
  fallback = "No pudimos completar la operación. Inténtalo otra vez.",
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (error.status === 403) {
      return "Tu cuenta no tiene permiso para administrar proveedores. Pídeselo a una administradora.";
    }
    if (error.status === 0 || error.code === "NETWORK") {
      return "No pudimos contactar el servidor. Revisa tu conexión e inténtalo otra vez.";
    }
    if (error.code === "VERSION_CONFLICT") {
      return "Otro cambio se guardó primero. Actualizamos la lista; revisa los datos antes de volver a guardar.";
    }
    return error.message || fallback;
  }
  return fallback;
}
