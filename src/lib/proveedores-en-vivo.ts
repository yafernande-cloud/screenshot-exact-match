/**
 * Proveedores en vivo (motor declarativo del backend).
 *
 * Descubre las fuentes de proveedor de la organización, lee el estado de su conector y ejecuta la
 * búsqueda en vivo con `POST /api/v1/supplier-searches`. No hay identificadores de proveedor
 * escritos en el frontend: la fuente se reconoce por lo que el backend informa.
 *
 * Reglas que este módulo respeta:
 * - una oferta es solo lo que el proveedor devolvió; un campo ausente queda `null`, nunca en 0/1;
 * - una fuente sin perfil o apagada no se consulta y jamás se presenta como «sin resultados»;
 * - la clasificación textual (`direct`/`related`/`unverified`) se conserva tal cual: no se
 *   convierte en equivalencia ni en recomendación;
 * - `cart_eligible` decide el bloqueo del carrito; los motivos salen de `cart_blockers`.
 *
 * Las búsquedas viven en memoria del backend con TTL corto: no se guardan ofertas ni precios.
 */

import { apiRequest } from "@/lib/api";
import { compararClaveOrden } from "@/lib/orden-comercial";

export type EstadoConector = "not_configured" | "connected" | "error" | "requires_intervention";

export type MecanismoConector =
  | "algolia"
  | "rest_json"
  | "html_form"
  | "html_embedded_json"
  | "manual_capture"
  | "browser_required"
  | "unsupported";

export type RelacionCoincidencia = "direct" | "related" | "unverified";

export type EstadoStock = "unknown" | "in_stock" | "out_of_stock";

/** `SourceOut` (E7), solo los campos que usa esta pantalla. */
export interface FuenteProveedorApi {
  source_id: string;
  name: string;
  kind: string;
  supplier_id: string | null;
  mode: string;
  enabled: boolean;
}

/** `ConnectorProfileOut`, solo los campos que usa esta pantalla. */
export interface PerfilConectorApi {
  source_id: string;
  supplier_id: string;
  source_name: string;
  supplier_name: string;
  configured: boolean;
  state: EstadoConector;
  reason: string | null;
  enabled: boolean;
  mechanism: MecanismoConector | null;
  last_success_at: string | null;
}

export interface OfertaEnVivo {
  external_id: string;
  /**
   * Artículo interno vinculado de forma exacta (vínculo de la fuente o EAN único). `null` cuando
   * todavía no hay vínculo: en ese caso se ofrece vincularlo, nunca se adivina.
   */
  trade_item_id: string | null;
  name: string;
  laboratory: string | null;
  presentation: string | null;
  price: { amount: string; currency: string };
  price_basis: string | null;
  sale_unit: string | null;
  stock_status: EstadoStock;
  stock_quantity: string | null;
  stock_unit: string | null;
  image_url: string | null;
  product_url: string | null;
  ean: string | null;
  match_relation: RelacionCoincidencia;
  match_reasons: string[];
  cart_eligible: boolean;
  cart_blockers: string[];
  /** Clave opaca de orden comercial dentro de la fuente. Opcional para respuestas antiguas. */
  order_key?: number[];
}

/**
 * `PublishedProductOut`: publicación del catálogo sin precio comercial vigente.
 *
 * No es una oferta. `reference_price` es el precio de lista del proveedor y solo se muestra como
 * referencial; nunca se presenta como precio de venta ni habilita el carrito.
 */
export interface ProductoPublicadoEnVivo {
  external_id: string;
  /** Artículo interno vinculado de forma exacta; `null` si aún no hay vínculo. */
  trade_item_id: string | null;
  name: string;
  laboratory: string | null;
  presentation: string | null;
  stock_status: EstadoStock;
  reference_price: { amount: string; currency: string } | null;
  image_url: string | null;
  product_url: string | null;
  ean: string | null;
  match_relation: RelacionCoincidencia;
  match_reasons: string[];
  cart_eligible: boolean;
  cart_blockers: string[];
}

/** `SupplierSearchOut`. */
export interface ResultadoEnVivo {
  search_id: string;
  source_id: string;
  source_name: string;
  query: string;
  state: EstadoConector;
  reason: string | null;
  outcome: "matches" | "no_matches" | null;
  observed_at: string | null;
  created_at: string;
  expires_at: string;
  cached: boolean;
  profile_version: number | null;
  discarded: number;
  warnings: string[];
  offers: OfertaEnVivo[];
  // Separadas de `offers`: se muestran, pero no son ofertas comerciales ni se pueden cotizar.
  published: ProductoPublicadoEnVivo[];
}

/** Fuente lista para la pantalla: perfil leído y decisión de si se puede consultar. */
export interface FuenteEnVivo {
  sourceId: string;
  sourceName: string;
  supplierId: string | null;
  supplierName: string;
  state: EstadoConector;
  reason: string | null;
  /** El perfil existe, está habilitado y su mecanismo admite consulta en vivo. */
  consultable: boolean;
  lastSuccessAt: string | null;
  /** Fallo al leer el perfil de esta fuente; las demás fuentes no se ven afectadas. */
  error: string | null;
}

/** Estado independiente de una fuente: cargando, resultado o error propio. */
export interface EstadoFuenteEnVivo {
  fuente: FuenteEnVivo;
  cargando: boolean;
  resultado: ResultadoEnVivo | null;
  error: string | null;
}

/** Mecanismos que no consultan un servicio en vivo; no se llaman aunque tengan perfil. */
const MECANISMOS_SIN_CONSULTA = new Set<MecanismoConector>([
  "manual_capture",
  "browser_required",
  "unsupported",
]);

const MENSAJES_MOTIVO: Record<string, string> = {
  engine_disabled: "El motor de proveedores está deshabilitado en este despliegue.",
  source_disabled: "La fuente del proveedor está desactivada.",
  source_not_supplier: "La fuente no corresponde a un proveedor.",
  source_mode_not_api: "La fuente no está configurada en modo API.",
  supplier_inactive: "El proveedor está inactivo.",
  profile_missing: "Falta configurar la conexión con este proveedor.",
  profile_disabled: "La conexión con este proveedor está desactivada.",
  not_tested: "La conexión todavía no se ha probado.",
  timeout: "El proveedor no respondió a tiempo.",
  network_error: "No pudimos comunicarnos con el proveedor.",
  provider_error: "El proveedor respondió con un error.",
  rate_limited: "El proveedor limitó la cantidad de consultas.",
  credentials_rejected: "El proveedor rechazó las credenciales; requiere revisión.",
  schema_changed: "La estructura de datos del proveedor cambió; requiere revisión.",
};

/** Mensaje para la persona a partir del motivo cerrado del backend. */
export function mensajeMotivo(reason: string | null, state: EstadoConector): string {
  if (reason) {
    if (reason.startsWith("secret_missing:")) {
      return "Falta un secreto de configuración para consultar a este proveedor.";
    }
    const mensaje = MENSAJES_MOTIVO[reason];
    if (mensaje) return mensaje;
  }
  if (state === "connected") return "La conexión está disponible.";
  if (state === "requires_intervention") return "La conexión requiere revisión.";
  if (state === "error") return "No pudimos consultar al proveedor.";
  return "La conexión con el proveedor no está configurada.";
}

const MENSAJES_BLOQUEADOR: Record<string, string> = {
  match_not_direct: "el nombre publicado no confirma la coincidencia",
  not_available_for_sale: "el proveedor informa que no está disponible para la venta",
  no_current_price: "no hay precio comercial vigente",
  sale_unit_unconfirmed: "unidad de venta no informada",
  price_basis_unconfirmed: "base del precio no informada",
};

/** Motivo legible de un bloqueo del carrito; un código desconocido se muestra tal cual. */
export function etiquetaBloqueador(bloqueador: string): string {
  return MENSAJES_BLOQUEADOR[bloqueador] ?? bloqueador;
}

/** Mensaje de una solicitud fallida; el detalle técnico no se muestra. */
export function mensajeDeErrorProveedor(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    const code = (error as { code?: unknown }).code;
    if (status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (status === 403) return "Tu cuenta no tiene permiso para consultar proveedores.";
    if (status === 404) return "La fuente del proveedor ya no está disponible.";
    if (status === 422) return "El proveedor no acepta esta consulta.";
    if (status === 429) {
      return "Demasiadas búsquedas en vivo. Espera un minuto antes de reintentar.";
    }
    if (status === 503) {
      return code === "CONNECTOR_ENGINE_DISABLED"
        ? "El motor de proveedores está deshabilitado en este despliegue."
        : "El proveedor no está disponible en este momento.";
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "No pudimos consultar al proveedor. Inténtalo otra vez.";
}

function nombreVisible(nombre: string | null | undefined): string | null {
  const limpio = nombre?.trim();
  return limpio ? limpio : null;
}

/**
 * Descubre las fuentes de proveedor y su estado de conexión.
 *
 * Una fuente sin perfil, apagada o con un mecanismo que no consulta servicios en vivo queda
 * visible con su estado, pero no se consulta. Un fallo al leer un perfil no oculta las demás
 * fuentes: esa fuente queda como error independiente.
 */
export async function descubrirProveedoresEnVivo(): Promise<FuenteEnVivo[]> {
  const { sources } = await apiRequest<{ sources: FuenteProveedorApi[] }>(
    "/api/v1/sources?kind=supplier&enabled=true",
    {},
    "No pudimos cargar los proveedores.",
  );

  // Una lista cargada (Excel/CSV) no se consulta en vivo: se muestra en su propia sección, con
  // sus precios importados. Consultarle un perfil de conector solo produciría «sin conexión».
  const proveedores = sources.filter((source) => source.mode === "api");

  const perfiles = await Promise.all(
    proveedores.map(async (source) => {
      try {
        const { profile } = await apiRequest<{ profile: PerfilConectorApi }>(
          `/api/v1/sources/${encodeURIComponent(source.source_id)}/connector-profile`,
          {},
          "No pudimos leer el estado de la conexión.",
        );
        return { source, profile, error: null as unknown };
      } catch (error) {
        return { source, profile: null, error };
      }
    }),
  );

  return perfiles.map(({ source, profile, error }) => {
    const nombreFuente = nombreVisible(source.name) ?? "Proveedor sin nombre";
    if (!profile) {
      return {
        sourceId: source.source_id,
        sourceName: nombreFuente,
        supplierId: source.supplier_id,
        supplierName: nombreFuente,
        state: "error" as EstadoConector,
        reason: null,
        consultable: false,
        lastSuccessAt: null,
        error: mensajeDeErrorProveedor(error),
      };
    }
    const mecanismo = profile.mechanism;
    const consultable =
      profile.configured &&
      profile.enabled !== false &&
      mecanismo !== null &&
      !MECANISMOS_SIN_CONSULTA.has(mecanismo);
    return {
      sourceId: source.source_id,
      sourceName: nombreVisible(profile.source_name) ?? nombreFuente,
      supplierId: profile.supplier_id ?? source.supplier_id,
      supplierName:
        nombreVisible(profile.supplier_name) ??
        nombreVisible(source.name) ??
        "Proveedor sin nombre",
      state: profile.state,
      reason: profile.reason,
      consultable,
      lastSuccessAt: profile.last_success_at,
      error: null,
    };
  });
}

/** Ejecuta una búsqueda en vivo en una fuente concreta. */
export function buscarProveedorEnVivo(
  sourceId: string,
  query: string,
  limit = 20,
): Promise<ResultadoEnVivo> {
  return apiRequest<ResultadoEnVivo>(
    "/api/v1/supplier-searches",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: sourceId, query, limit }),
    },
    "No pudimos consultar al proveedor.",
  );
}

/** `SupplierProductMappingOut`: vínculo explícito ya guardado entre la fuente y un artículo. */
export interface VinculoProductoEnVivo {
  mapping_id: string;
  source_id: string;
  supplier_id: string;
  external_id: string;
  external_name: string | null;
  trade_item_id: string;
  origin: "explicit" | "confirmed";
  /** `false` cuando el vínculo ya existía con el mismo artículo (reintento idempotente). */
  created: boolean;
  created_at: string;
}

export interface DatosVinculoEnVivo {
  sourceId: string;
  externalId: string;
  externalName?: string | null;
  tradeItemId: string;
}

/**
 * Guarda el vínculo explícito entre un producto de la fuente y un artículo existente del catálogo.
 *
 * No crea artículos ni infiere equivalencias: `tradeItemId` lo eligió una persona con permiso. El
 * backend valida la organización, exige `admin` y deja auditoría.
 */
export function vincularProductoEnVivo(datos: DatosVinculoEnVivo): Promise<VinculoProductoEnVivo> {
  return apiRequest<VinculoProductoEnVivo>(
    "/api/v1/supplier-product-mappings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: datos.sourceId,
        external_id: datos.externalId,
        external_name: datos.externalName ?? null,
        trade_item_id: datos.tradeItemId,
      }),
    },
    "No pudimos guardar el vínculo. Inténtalo otra vez.",
  );
}

/** Mensaje para la persona cuando falla el alta del vínculo. */
export function mensajeDeErrorVinculo(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    const code = (error as { code?: unknown }).code;
    if (status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (status === 403) {
      return "Solo la administración puede vincular productos con el catálogo interno.";
    }
    if (status === 404) return "La fuente o el artículo ya no está disponible.";
    if (status === 409) {
      return code === "TRADE_ITEM_INACTIVE"
        ? "El artículo elegido está inactivo. Elige uno vigente."
        : "Ese producto ya está vinculado a otro artículo del catálogo.";
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "No pudimos guardar el vínculo. Inténtalo otra vez.";
}

/** Un resultado mostrable: oferta comercial o publicación sin precio vigente. */
export type ItemEnVivo =
  | { tipo: "oferta"; oferta: OfertaEnVivo }
  | { tipo: "publicado"; producto: ProductoPublicadoEnVivo };

/**
 * Separa coincidencias directas de resultados relacionados, conservando la distinción entre una
 * oferta comercial y una publicación sin precio. Un publicado nunca se presenta como oferta.
 */
export function agruparResultados(resultado: Pick<ResultadoEnVivo, "offers" | "published">): {
  directas: ItemEnVivo[];
  relacionadas: ItemEnVivo[];
} {
  const directas: ItemEnVivo[] = [];
  const relacionadas: ItemEnVivo[] = [];
  // Solo la clave comercial del backend decide el orden entre ofertas; el orden es estable, así
  // que un empate conserva la posición original. Una publicación sin precio no participa.
  const ofertasOrdenadas = [...resultado.offers].sort((a, b) =>
    compararClaveOrden(a.order_key, b.order_key),
  );
  const items: ItemEnVivo[] = [
    ...ofertasOrdenadas.map((oferta) => ({ tipo: "oferta" as const, oferta })),
    ...resultado.published.map((producto) => ({ tipo: "publicado" as const, producto })),
  ];
  for (const item of items) {
    const relacion =
      item.tipo === "oferta" ? item.oferta.match_relation : item.producto.match_relation;
    if (relacion === "direct") directas.push(item);
    else relacionadas.push(item);
  }
  return { directas, relacionadas };
}

/**
 * Advertencia técnica del conector sobre ítems descartados: se conserva para diagnóstico, pero no
 * forma parte de la experiencia de cotización.
 */
const ADVERTENCIA_DESCARTES =
  /^\d+\s+ítem\(s\)\s+descartados por datos incompletos o inválidos\.$/i;

/** Advertencias que sí corresponden a la persona; los descartes técnicos no se muestran. */
export function advertenciasVisibles(advertencias: string[]): string[] {
  return advertencias.filter((texto) => !ADVERTENCIA_DESCARTES.test(texto.trim()));
}

/** Separa coincidencias directas de resultados que no confirman la consulta. */
export function agruparOfertas(ofertas: OfertaEnVivo[]): {
  directas: OfertaEnVivo[];
  relacionadas: OfertaEnVivo[];
} {
  const directas: OfertaEnVivo[] = [];
  const relacionadas: OfertaEnVivo[] = [];
  for (const oferta of ofertas) {
    if (oferta.match_relation === "direct") directas.push(oferta);
    else relacionadas.push(oferta);
  }
  return { directas, relacionadas };
}

/** Etiqueta breve de una relación; «unverified» nunca se presenta como coincidencia. */
export function etiquetaRelacion(relacion: RelacionCoincidencia): string {
  if (relacion === "direct") return "Coincidencia directa";
  if (relacion === "unverified") return "Sin verificar";
  return "Relacionado";
}
