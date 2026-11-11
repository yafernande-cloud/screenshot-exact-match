/**
 * Cliente de proveedores, fuentes, listas de precios y portal (backend FastAPI existente).
 *
 * Consume E6 (`/api/v1/suppliers`), E7 (`/api/v1/sources`), E8 (`/api/v1/imports`) y las piezas de
 * A3 (`import-profile`, `import-preview`, `offers`). La identidad, la organización y los permisos los
 * resuelve el backend con el JWT de Supabase; aquí no se decide nada de negocio. Las mutaciones de
 * actualización viajan con `If-Match` para no pisar cambios de otra sesión.
 *
 * Las credenciales del portal nunca se leen desde la API: solo se envían al guardarlas y la
 * contraseña no vuelve nunca. Guardar credenciales no significa que el portal esté conectado.
 */

import { apiRequest, ApiError } from "@/lib/api";

export type EstadoProveedor = "active" | "inactive";
export type ModoFuente = "api" | "manual_import" | "fixture" | "none";
export type CapacidadFuente = "search" | "product_detail" | "price" | "stock" | "terms";
export type EstadoFuente = "not_configured" | "ok" | "stale" | "failed";
export type EstadoPortal = "not_configured" | "incomplete" | "credentials_saved";
export type FormatoArchivo = "xlsx" | "xls" | "csv";

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
  /** Portal web de compras; guardarlo no prueba que funcione. */
  portal_url: string | null;
  /** Hay usuario y contraseña guardados. La API nunca los devuelve. */
  has_portal_credentials: boolean;
  /** `credentials_saved` no significa conectado: todavía no existe un conector de portal. */
  portal_status: EstadoPortal;
  /** El proveedor tiene al menos una fuente de lista de precios. */
  has_price_list: boolean;
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

/**
 * Estado derivado del conector de una fuente API (E4).
 *
 * Es de solo lectura: leerlo no prueba la conexión ni guarda nada. Una fuente sin perfil
 * responde `configured: false`, y el estado nunca se completa en el frontend.
 */
export interface EstadoConexionFuente {
  source_id: string;
  configured: boolean;
  state: "not_configured" | "connected" | "error" | "requires_intervention";
  reason: string | null;
  enabled: boolean;
  mechanism: string | null;
  last_success_at: string | null;
}

export interface NuevoProveedor {
  name: string;
  supplier_code?: string | null;
  notes?: string | null;
  portal_url?: string | null | undefined;
  /** Usuario y contraseña se envían juntos al crear; quedan cifrados en el backend. */
  portal_username?: string | null | undefined;
  portal_password?: string | null | undefined;
}

export interface CambiosProveedor {
  name?: string;
  supplier_code?: string | null;
  notes?: string | null;
  status?: EstadoProveedor;
  portal_url?: string | null;
  /** `null` en cualquiera de los dos borra la credencial completa. */
  portal_username?: string | null;
  portal_password?: string | null;
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

/** Especificación de una columna dentro del perfil de importación. */
export interface EspecificacionColumna {
  header?: string;
  aliases?: string[];
  position?: number;
}

export interface PerfilImportacion {
  source_id: string;
  file_format: FormatoArchivo;
  sheet: string | null;
  header_row: number;
  columns: Record<string, EspecificacionColumna>;
  units: Record<string, string>;
  options: Record<string, unknown>;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RespuestaPerfil {
  profile: PerfilImportacion | null;
  /** 0 cuando la fuente todavía no tiene perfil; es el `If-Match` del primer guardado. */
  version: number;
}

export interface FilaVistaPrevia {
  row: number;
  values: unknown[];
}

export interface VistaPreviaImportacion {
  file_format: FormatoArchivo;
  sheets: string[];
  sheet: string | null;
  /** Hoja que el backend propone porque parece la lista de productos. */
  suggested_sheet: string | null;
  header_row: number;
  headers: (string | null)[];
  sample_rows: FilaVistaPrevia[];
  row_count: number;
  suggested_columns: Record<string, EspecificacionColumna>;
  suggested_options: {
    decimal_separator: string | null;
    currency: string | null;
    price_basis: string | null;
    default_sale_unit: string | null;
  };
}

export interface DatosPerfil {
  file_format: FormatoArchivo;
  sheet: string | null;
  header_row: number;
  columns: Record<string, EspecificacionColumna>;
  units: Record<string, string>;
  options: Record<string, unknown>;
}

export interface ErrorDeFila {
  row: number;
  code: string;
  message: string;
}

export interface ResultadoImportacion {
  import_id: string | null;
  status: "completed" | "completed_with_errors" | "failed";
  rows_total: number;
  rows_accepted: number;
  rows_rejected: number;
  errors: ErrorDeFila[];
  observed_at: string | null;
}

/** Problema de una fila según el motor de importación (D-110). */
export interface ProblemaDeFila {
  code: string;
  message: string;
  fields: string[];
  /** Solo las celdas culpables, nunca la fila completa (D-104). */
  values: Record<string, unknown>;
}

/** Fila ya interpretada: lo que se importaría, sin importarla todavía. */
export interface FilaRevisada {
  row: number;
  status: "ready" | "review" | "rejected";
  sku: string | null;
  name: string | null;
  price: string | null;
  currency: string | null;
  price_basis: string | null;
  sale_unit: string | null;
  sale_unit_text: string | null;
  pack_units: string | null;
  stock: string | null;
  observed_at: string | null;
  warnings: string[];
  problem: ProblemaDeFila | null;
}

/** Rechazos agrupados por causa, contando todas las filas del archivo. */
export interface ProblemaAgrupado {
  code: string;
  message: string;
  fields: string[];
  count: number;
  sample_rows: number[];
}

/** Texto de unidad que el mapeo todavía no traduce (D-102). */
export interface UnidadNoReconocida {
  text: string;
  count: number;
  sample_rows: number[];
}

/** Base de precio que la lista usa pero que el mapeo todavía no confirma para este proveedor. */
export interface BaseNoReconocida {
  text: string;
  count: number;
  sample_rows: number[];
}

/** Columna reconocida que se omitió a propósito, con su motivo en lenguaje claro. */
export interface ColumnaIgnorada {
  header: string | null;
  role: string;
  reason: string;
}

/**
 * Revisión previa de una planilla: lo que la importación haría, sin escribir nada.
 * No es el sobre E8; el endpoint es independiente y reutiliza la clasificación en seco.
 */
export interface RevisionImportacion {
  file_format: FormatoArchivo;
  sheets: string[];
  sheet: string | null;
  header_row: number;
  headers: (string | null)[];
  rows_total: number;
  rows_accepted: number;
  rows_rejected: number;
  /** Aceptadas que además necesitan revisión (condiciones comerciales en texto, D-110). */
  rows_needs_review: number;
  rows: FilaRevisada[];
  rows_truncated: boolean;
  problems: ProblemaAgrupado[];
  unrecognised_units: UnidadNoReconocida[];
  /** Bases de precio ambiguas («unit»): se confirman por proveedor, nunca en general. */
  unrecognised_bases: BaseNoReconocida[];
  profile_source: "saved" | "request" | "detected";
  profile_version: number;
  /**
   * Mapeo efectivo que produjo esta revisión. Guardarlo antes de importar garantiza que E8 lea la
   * misma hoja, la misma cabecera y las mismas columnas que se acaban de revisar.
   */
  profile: DatosPerfil | null;
  /** Roles obligatorios que el archivo no permite resolver (solo en el flujo automático). */
  missing_columns: string[];
  /** Columnas opcionales omitidas a propósito (por ejemplo «pack» sin unidad base). */
  ignored_columns: ColumnaIgnorada[];
  file_hash: string;
}

/** Última observación de un SKU de una fuente del proveedor. */
export interface OfertaImportada {
  offer_id: string;
  source_id: string;
  source_name: string;
  /** `manual_import` para listas cargadas; la búsqueda no mezcla otros modos. */
  source_mode: string;
  external_id: string;
  external_name: string | null;
  trade_item_id: string;
  trade_item_name: string;
  price_amount: string;
  currency: string;
  price_basis: string;
  sale_unit: string;
  sale_unit_text: string | null;
  pack_units_per_commercial_unit: string | null;
  pack_base_unit: string | null;
  stock_status: string;
  stock_quantity: string | null;
  stock_unit: string | null;
  review_status: string;
  /** Condiciones comerciales tal como las publicó el proveedor. */
  notes: string | null;
  valid_from: string | null;
  valid_to: string | null;
  /** Vigencia declarada por el proveedor, evaluada por el backend al responder. */
  is_current: boolean;
  /** Hasta cuándo el backend considera fresca la observación. */
  fresh_until: string;
  is_stale: boolean;
  observed_at: string;
  imported_at: string;
}

const LISTA_FALLBACK = "No pudimos cargar los proveedores. Inténtalo otra vez.";
const CREAR_FALLBACK = "No pudimos registrar el proveedor. Inténtalo otra vez.";
const GUARDAR_FALLBACK = "No pudimos guardar los cambios. Inténtalo otra vez.";
const FUENTES_FALLBACK = "No pudimos cargar las fuentes de datos. Inténtalo otra vez.";
const CREAR_FUENTE_FALLBACK = "No pudimos crear la fuente de datos. Inténtalo otra vez.";
const PERFIL_FALLBACK = "No pudimos cargar la configuración de la lista. Inténtalo otra vez.";
const GUARDAR_PERFIL_FALLBACK = "No pudimos guardar el mapeo de columnas. Inténtalo otra vez.";
const VISTA_PREVIA_FALLBACK = "No pudimos leer el archivo. Revisa que sea .xlsx, .xls o .csv.";
const REVISAR_FALLBACK = "No pudimos revisar la planilla. Inténtalo otra vez.";
const IMPORTAR_FALLBACK = "No pudimos importar la lista de precios. Inténtalo otra vez.";
const OFERTAS_FALLBACK = "No pudimos cargar los precios importados. Inténtalo otra vez.";

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
  const cuerpo: Record<string, unknown> = {
    name: datos.name.trim(),
    supplier_code: textoLimpio(datos.supplier_code),
    notes: textoLimpio(datos.notes),
  };
  if (datos.portal_url !== undefined) cuerpo["portal_url"] = textoLimpio(datos.portal_url);
  if (datos.portal_username) cuerpo["portal_username"] = datos.portal_username;
  if (datos.portal_password) cuerpo["portal_password"] = datos.portal_password;

  return apiRequest<Proveedor>(
    "/api/v1/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
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
  if ("portal_url" in cambios) cuerpo["portal_url"] = textoLimpio(cambios.portal_url);
  // La contraseña no se recorta: el backend la guarda tal como se escribió.
  if ("portal_username" in cambios) cuerpo["portal_username"] = cambios.portal_username;
  if ("portal_password" in cambios) cuerpo["portal_password"] = cambios.portal_password;

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
 * Estado real de la conexión de una fuente API, tal como lo deriva el backend.
 *
 * Se consulta solo para fuentes en modo `api`; una fuente de archivo responde
 * `source_mode_not_api` porque no tiene conector que probar. Un fallo de lectura se informa como
 * error: nunca se supone «conectado».
 */
export async function obtenerEstadoConexionFuente(sourceId: string): Promise<EstadoConexionFuente> {
  const data = await apiRequest<{ profile: EstadoConexionFuente }>(
    `/api/v1/sources/${encodeURIComponent(sourceId)}/connector-profile`,
    {},
    "No pudimos leer el estado de la conexión.",
  );
  return data.profile;
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

/** Perfil de importación de la fuente; `profile` es null cuando todavía no existe. */
export function obtenerPerfilImportacion(sourceId: string): Promise<RespuestaPerfil> {
  return apiRequest<RespuestaPerfil>(
    `/api/v1/sources/${encodeURIComponent(sourceId)}/import-profile`,
    {},
    PERFIL_FALLBACK,
  );
}

/** Crea o actualiza el mapeo. `version` es 0 si la fuente aún no tiene perfil. */
export function guardarPerfilImportacion(
  sourceId: string,
  datos: DatosPerfil,
  version: number,
): Promise<PerfilImportacion> {
  return apiRequest<PerfilImportacion>(
    `/api/v1/sources/${encodeURIComponent(sourceId)}/import-profile`,
    {
      method: "PUT",
      headers: cabecerasConVersion(version),
      body: JSON.stringify(datos),
    },
    GUARDAR_PERFIL_FALLBACK,
  );
}

/**
 * Lee un archivo real y propone columnas. No escribe nada: es la vista previa antes de mapear y
 * guardar. `hoja` y `filaEncabezado` solo repiten la lectura con otra hoja o cabecera.
 */
export function previsualizarImportacion(
  sourceId: string,
  archivo: File,
  opciones: { hoja?: string | null; filaEncabezado?: number | undefined } = {},
): Promise<VistaPreviaImportacion> {
  const cuerpo = new FormData();
  cuerpo.append("file", archivo, archivo.name);
  if (opciones.hoja) cuerpo.append("sheet", opciones.hoja);
  if (opciones.filaEncabezado !== undefined) {
    cuerpo.append("header_row", String(opciones.filaEncabezado));
  }
  return apiRequest<VistaPreviaImportacion>(
    `/api/v1/sources/${encodeURIComponent(sourceId)}/import-preview`,
    { method: "POST", body: cuerpo },
    VISTA_PREVIA_FALLBACK,
  );
}

/**
 * Revisa la planilla, **sin guardar ni importar nada**.
 *
 * Sin `datos` y con `auto: true` el backend detecta la hoja, la cabecera y las columnas, y reutiliza
 * el mapeo guardado solo si calza **por nombre**. Devuelve además el `profile` efectivo (para
 * guardarlo antes de importar) y los `missing_columns` que el archivo no trae.
 *
 * Con `datos` se revisa ese mapeo explícito; así la pantalla reintenta con las respuestas que dio
 * la persona (moneda, base, unidad) sin inventar nada.
 */
export function revisarImportacion(
  sourceId: string,
  archivo: File,
  datos?: DatosPerfil | null,
  opciones: {
    auto?: boolean;
    hoja?: string | null;
    filaEncabezado?: number | undefined;
  } = {},
): Promise<RevisionImportacion> {
  const cuerpo = new FormData();
  cuerpo.append("file", archivo, archivo.name);
  if (opciones.hoja) cuerpo.append("sheet", opciones.hoja);
  if (opciones.filaEncabezado !== undefined) {
    cuerpo.append("header_row", String(opciones.filaEncabezado));
  }
  if (opciones.auto) cuerpo.append("auto", "true");
  if (datos) {
    cuerpo.append(
      "profile",
      JSON.stringify({
        file_format: datos.file_format,
        sheet: datos.sheet,
        header_row: datos.header_row,
        columns: datos.columns,
        units: datos.units,
        options: datos.options,
      }),
    );
  }
  return apiRequest<RevisionImportacion>(
    `/api/v1/sources/${encodeURIComponent(sourceId)}/import-check`,
    { method: "POST", body: cuerpo },
    REVISAR_FALLBACK,
  );
}

/** Clave de idempotencia nueva por archivo; E8 exige entre 8 y 128 caracteres. */
export function nuevaClaveIdempotencia(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === "function") return cripto.randomUUID();
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Importa la planilla con el perfil ya guardado.
 *
 * `idempotencyKey` debe conservarse mientras se reintenta el mismo archivo: el backend devuelve el
 * resultado original y nunca duplica ofertas. El mismo archivo (mismo hash) tampoco se reprocesa.
 */
export function importarListaDePrecios(datos: {
  supplierId: string;
  sourceId: string;
  archivo: File;
  idempotencyKey: string;
}): Promise<ResultadoImportacion> {
  const cuerpo = new FormData();
  cuerpo.append("file", datos.archivo, datos.archivo.name);
  cuerpo.append("supplier_id", datos.supplierId);
  cuerpo.append("source_id", datos.sourceId);
  return apiRequest<ResultadoImportacion>(
    "/api/v1/imports",
    {
      method: "POST",
      headers: { "Idempotency-Key": datos.idempotencyKey },
      body: cuerpo,
    },
    IMPORTAR_FALLBACK,
  );
}

/** Últimos precios importados por SKU de todas las fuentes del proveedor. */
export async function listarOfertasProveedor(
  supplierId: string,
  limite = 200,
  tradeItemIds?: string[],
): Promise<OfertaImportada[]> {
  const params = new URLSearchParams({ limit: String(limite) });
  for (const id of tradeItemIds ?? []) params.append("trade_item_ids", id);
  const data = await apiRequest<{ offers: OfertaImportada[] }>(
    `/api/v1/suppliers/${encodeURIComponent(supplierId)}/offers?${params.toString()}`,
    {},
    OFERTAS_FALLBACK,
  );
  return data.offers;
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

/** La fuente se alimenta con archivos Excel/CSV y sí tiene importador. */
export function esFuenteDeArchivo(fuente: Fuente): boolean {
  return fuente.mode === "manual_import";
}

/** La fuente se consulta en vivo contra el proveedor; no recibe archivos. */
export function esFuenteApi(fuente: Fuente): boolean {
  return fuente.mode === "api";
}

/**
 * El proveedor tiene portal de compras configurado.
 *
 * Guardar usuario y contraseña no conecta el portal, pero sí prueba que esa modalidad existe y
 * que su sección corresponde mostrarse. Sin dirección, sin credenciales y con estado
 * `not_configured` el proveedor no usa portal y su sección no aplica.
 */
export function proveedorUsaPortal(proveedor: Proveedor): boolean {
  return (
    Boolean(proveedor.portal_url) ||
    proveedor.has_portal_credentials ||
    proveedor.portal_status !== "not_configured"
  );
}

/** Nombre corto del tipo de fuente para la tarjeta del proveedor. */
export function etiquetaTipoFuente(modo: string): string {
  switch (modo) {
    case "api":
      return "Consulta en vivo";
    case "manual_import":
      return "Lista de precios";
    case "fixture":
      return "Datos de prueba";
    default:
      return "Sin origen definido";
  }
}

/** Nombres comprensibles: la persona administra fuentes, no `source.mode`. */
export function etiquetaModo(modo: string): string {
  switch (modo) {
    case "manual_import":
      return "Lista de precios (Excel o CSV)";
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

/**
 * Estado del portal. Nunca se traduce a «conectado»: guardar usuario y contraseña no abre sesión
 * porque no hay conector de portal todavía.
 */
export function etiquetaEstadoPortal(estado: string): string {
  switch (estado) {
    case "credentials_saved":
      return "Credenciales guardadas · sin conectar";
    case "incomplete":
      return "Datos del portal incompletos";
    default:
      return "Portal sin configurar";
  }
}

export function etiquetaFormato(formato: string): string {
  switch (formato) {
    case "xlsx":
      return "Excel (.xlsx)";
    case "xls":
      return "Excel antiguo (.xls)";
    case "csv":
      return "Texto separado por comas (.csv)";
    default:
      return formato;
  }
}

export function etiquetaEstadoImportacion(estado: string): string {
  switch (estado) {
    case "completed":
      return "Importación completa";
    case "completed_with_errors":
      return "Importación con filas rechazadas";
    default:
      return "No se pudo importar";
  }
}

/** Papeles de columna que admite el perfil, con el nombre que ve la persona. */
export const PAPELES_COLUMNA: ReadonlyArray<{
  value: string;
  label: string;
  obligatorio: boolean;
  ayuda: string;
}> = [
  {
    value: "sku",
    label: "Código del producto",
    obligatorio: true,
    ayuda: "El código del proveedor",
  },
  {
    value: "name",
    label: "Nombre o descripción",
    obligatorio: false,
    ayuda: "Nombre del producto en la lista",
  },
  { value: "price", label: "Precio", obligatorio: true, ayuda: "Precio del proveedor" },
  {
    value: "sale_unit",
    label: "Unidad de venta",
    obligatorio: true,
    ayuda: "Caja, paquete, unidad o botella",
  },
  { value: "currency", label: "Moneda", obligatorio: false, ayuda: "Código de la moneda por fila" },
  {
    value: "basis",
    label: "Base del precio",
    obligatorio: false,
    ayuda: "Por unidad comercial o por unidad base",
  },
  {
    value: "pack",
    label: "Unidades por caja o paquete",
    obligatorio: false,
    ayuda: "Contenido del envase",
  },
  { value: "minimum", label: "Compra mínima", obligatorio: false, ayuda: "Mínimo por pedido" },
  {
    value: "multiple",
    label: "Múltiplo de compra",
    obligatorio: false,
    ayuda: "Múltiplos por pedido",
  },
  { value: "stock", label: "Stock", obligatorio: false, ayuda: "Disponibilidad informada" },
  {
    value: "observed_at",
    label: "Fecha del precio",
    obligatorio: false,
    ayuda: "Fecha en que el proveedor observó el precio",
  },
  {
    value: "conditions",
    label: "Condiciones",
    obligatorio: false,
    ayuda: "Texto de condiciones comerciales",
  },
];

/** Unidades del vocabulario cerrado (D-102), con su nombre para la persona. */
export const UNIDADES_VENTA: ReadonlyArray<{ value: string; label: string }> = [
  { value: "box", label: "Caja" },
  { value: "package", label: "Paquete" },
  { value: "unit", label: "Unidad" },
  { value: "bottle", label: "Botella" },
];

export function etiquetaUnidad(unidad: string | null | undefined): string {
  if (!unidad) return "Sin unidad";
  return UNIDADES_VENTA.find((u) => u.value === unidad)?.label ?? unidad;
}

export function etiquetaBasePrecio(base: string): string {
  switch (base) {
    case "per_commercial_unit":
      return "por unidad de venta";
    case "per_base_unit":
      return "por unidad base";
    default:
      return base;
  }
}

/**
 * Estado de revisión de una oferta importada (D-110): una condición comercial escrita por el
 * proveedor deja el precio guardado pero no verificado. No se presenta como «vigente» ni
 * «verificado» cuando falta esa revisión.
 */
export function etiquetaEstadoRevision(estado: string): string {
  return estado === "needs_review" ? "Pendiente de revisión" : "Sin condiciones pendientes";
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
    if (error.code === "SUPPLIER_CREDENTIALS_KEY_MISSING") {
      return "El servidor no tiene configurada la clave de cifrado, así que no se guardó ninguna contraseña. Avisa a quien administra el sistema.";
    }
    if (error.code === "SUPPLIER_CREDENTIALS_KEY_INVALID") {
      return "La clave de cifrado del servidor no es válida; no se guardó la contraseña. Avisa a quien administra el sistema.";
    }
    return error.message || fallback;
  }
  return fallback;
}
