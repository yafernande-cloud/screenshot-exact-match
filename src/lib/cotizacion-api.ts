/**
 * Cliente de la cotización persistente (backend FastAPI, E10).
 *
 * El carrito activo vive en el servidor: esta pantalla nunca guarda líneas en el navegador. Aquí
 * solo se arman las solicitudes al contrato existente (`/api/v1/quotes`) y se presentan sus
 * respuestas; las reglas de negocio (precio congelado, asignaciones a faltantes, liberación) las
 * decide el backend.
 *
 * Dos garantías que el cliente respeta:
 * - agregar la misma oferta no suma: se envía `Idempotency-Key` y el backend deduplica por oferta;
 * - finalizar no se duplica: la clave se conserva mientras el resultado es desconocido y solo se
 *   descarta cuando el informe llegó, de modo que un reintento devuelve el mismo informe.
 */

import { apiRequest, ApiError } from "@/lib/api";

export interface Dinero {
  amount: string;
  currency: string;
}

export interface ProductoDeLinea {
  name: string | null;
  laboratory: string | null;
  brand: string | null;
  presentation: string | null;
  code: string;
}

export interface LineaCotizacion {
  line_id: string;
  quote_id: string;
  quote_cart_id: string;
  supplier_id: string;
  offer_snapshot_id: string;
  trade_item_id: string;
  product: ProductoDeLinea;
  unit_price: (Dinero & { basis: string | null; sale_unit: string | null }) | null;
  subtotal: Dinero | null;
  quantity: { value: string; unit: string | null };
  status: "active" | "removed";
  removed_at: string | null;
  removed_by: string | null;
  demand_item_id: string | null;
  coverage_relation: string | null;
  demand_allocations: Array<{ demand_item_id: string; quantity: string }>;
  price_state: string;
  causes: string[];
  warnings: string[];
  version: number;
  added_at: string;
  updated_at: string;
}

export interface CarritoCotizacion {
  cart_id: string;
  supplier_id: string;
  supplier_name: string | null;
  status: "active" | "dismissed";
  line_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  derived_state: string;
  lines: LineaCotizacion[];
  evaluation?: Record<string, unknown> | null;
}

export interface DetalleCotizacion {
  quote_id: string;
  title: string | null;
  status: "draft" | "closed";
  version: number;
  created_at: string;
  updated_at: string;
  report_number: number | null;
  report_label: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  data_origin: string;
  derived_state: string;
  carts: CarritoCotizacion[];
  coverage: Array<Record<string, unknown>>;
  estimated_total: Record<string, unknown>;
}

export interface ResumenCotizacion {
  quote_id: string;
  title: string | null;
  status: "draft" | "closed";
  version: number;
  created_at: string;
  updated_at: string;
  report_number: number | null;
  report_label: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  supplier_count: number;
  line_count: number;
}

/** Oferta viva tal como la publicó el conector. Sin precio no se puede cotizar. */
export interface OfertaParaCotizar {
  source_id: string;
  external_id: string;
  name: string;
  supplier_id: string | null;
  laboratory: string | null;
  presentation: string | null;
  price: { amount: string; currency: string } | null;
  price_basis: string | null;
  sale_unit: string | null;
  stock_status: string | null;
  stock_quantity: string | null;
  stock_unit: string | null;
  ean: string | null;
  product_url: string | null;
  image_url: string | null;
}

/** Respuesta de alta/cambio de línea: incluye el carrito afectado, sin su detalle de líneas. */
export interface CarritoResumen {
  cart_id: string;
  supplier_id: string;
  supplier_name: string | null;
  status: "active" | "dismissed";
  line_count: number;
  version: number;
}

export interface LineaAgregada {
  line: LineaCotizacion;
  cart: CarritoResumen;
  deduplicated: boolean;
  warnings: string[];
}

export interface ItemInforme {
  line_id: string;
  supplier_id: string;
  supplier_name: string | null;
  product: ProductoDeLinea;
  trade_item_id: string;
  quantity: { value: string; unit: string | null };
  unit_price: Dinero | null;
  subtotal: Dinero | null;
  price_state: string;
  causes: string[];
  demand_allocations: Array<{ demand_item_id: string; quantity: string }>;
}

export interface ProveedorInforme {
  supplier_id: string;
  supplier_name: string | null;
  line_count: number;
  subtotal: Dinero | null;
}

/** Informe congelado: lo que se generó al finalizar nunca se recalcula. */
export interface InformeCotizacion {
  schema_version: number;
  quote_id: string;
  title: string | null;
  number: number;
  label: string;
  finalized_at: string;
  finalized_by: string;
  currency: string;
  suppliers: ProveedorInforme[];
  items: ItemInforme[];
  total: Dinero | null;
  warnings: string[];
  release: {
    released: Array<{
      demand_item_id: string;
      quantity: string;
      quantity_unit: string | null;
    }>;
    pending: Array<{
      demand_item_id: string;
      reason: string;
      allocated_quantity?: string;
      target_quantity?: string;
    }>;
  };
  note: string | null;
}

/** Cotización finalizada (resumen): su informe ya no cambia. */
export interface CotizacionFinalizada {
  quote_id: string;
  title: string | null;
  status: "closed";
  version: number;
  created_at: string;
  updated_at: string;
  report_number: number;
  report_label: string;
  finalized_at: string;
  finalized_by: string;
}

export interface ResultadoFinalizacion {
  quote: CotizacionFinalizada;
  report: InformeCotizacion;
  released: InformeCotizacion["release"]["released"];
  pending: InformeCotizacion["release"]["pending"];
  deduplicated: boolean;
}

export interface InformeRecuperado {
  quote_id: string;
  report_number: number | null;
  report_label: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  report: InformeCotizacion;
}

const MENSAJE_GENERICO = "No pudimos completar la operación con la cotización. Inténtalo otra vez.";

/** Identificador de reintento. No decide nada: solo permite que el backend reconozca una repetición. */
export function nuevaClaveIdempotencia(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `cot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Mensaje para la persona; nunca inventa el motivo cuando el backend no lo entrega. */
export function mensajeDeErrorCotizacion(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") {
      return "No pudimos contactar el servidor. Revisa tu conexión e inténtalo otra vez.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return MENSAJE_GENERICO;
}

/** La cotización ya está finalizada: otro intento no la reabre. */
export function yaFinalizada(error: unknown): boolean {
  return error instanceof ApiError && error.code === "QUOTE_ALREADY_FINALIZED";
}

/**
 * El resultado del cierre no llegó a conocerse (sin conexión o error del servidor): el reintento
 * debe enviar la misma clave para recibir el informe original en vez de generar otro.
 */
export function resultadoDesconocido(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "NETWORK" || error.status >= 500);
}

interface ListaCotizaciones {
  quotes: ResumenCotizacion[];
  next_cursor: string | null;
}

/** Cotizaciones finalizadas (historial) o en preparación, nunca ambas a la vez. */
export async function listarCotizaciones(
  opciones: { finalized?: boolean; status?: "draft" | "closed"; limit?: number; q?: string } = {},
): Promise<ResumenCotizacion[]> {
  const params = new URLSearchParams();
  if (opciones.finalized !== undefined) params.set("finalized", String(opciones.finalized));
  if (opciones.status) params.set("status", opciones.status);
  params.set("limit", String(opciones.limit ?? 20));
  if (opciones.q) params.set("q", opciones.q);
  const data = await apiRequest<ListaCotizaciones>(
    `/api/v1/quotes?${params.toString()}`,
    {},
    MENSAJE_GENERICO,
  );
  return data.quotes;
}

/** La cotización en borrador más reciente: es el carrito activo que se recupera al recargar. */
export async function ultimaCotizacionEnPreparacion(): Promise<ResumenCotizacion | null> {
  const [primera] = await listarCotizaciones({ finalized: false, status: "draft", limit: 1 });
  return primera ?? null;
}

export async function crearCotizacion(title?: string): Promise<DetalleCotizacion> {
  return apiRequest<DetalleCotizacion>(
    "/api/v1/quotes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    },
    MENSAJE_GENERICO,
  );
}

export async function obtenerCotizacion(quoteId: string): Promise<DetalleCotizacion> {
  return apiRequest<DetalleCotizacion>(
    `/api/v1/quotes/${quoteId}`,
    {},
    "No pudimos cargar la cotización.",
  );
}

export interface AltaDeLinea {
  supplierId: string;
  /** Oferta ya publicada (lista cargada o catálogo): su observación inmutable. */
  offerSnapshotId?: string;
  /** Oferta viva del conector: se registra al agregarla y el precio queda anclado. */
  offer?: OfertaParaCotizar;
  quantity: string;
  /** `null` cuando la oferta no informa su unidad: la cantidad se cuenta en ofertas. */
  unit: string | null;
  /** Faltante al que se asocia la selección, cuando la unidad coincide. */
  demandItemId?: string;
}

/** Agrega una oferta al carrito. Repetir la misma selección devuelve la línea existente. */
export async function agregarLinea(quoteId: string, alta: AltaDeLinea): Promise<LineaAgregada> {
  const body: {
    supplier_id: string;
    quantity: { value: string; unit: string | null };
    offer_snapshot_id?: string;
    offer?: OfertaParaCotizar;
    demand_item_id?: string;
  } = {
    supplier_id: alta.supplierId,
    quantity: { value: alta.quantity, unit: alta.unit },
  };
  if (alta.offerSnapshotId) body.offer_snapshot_id = alta.offerSnapshotId;
  if (alta.offer) body.offer = alta.offer;
  if (alta.demandItemId) body.demand_item_id = alta.demandItemId;
  return apiRequest<LineaAgregada>(
    `/api/v1/quotes/${quoteId}/lines`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": nuevaClaveIdempotencia(),
      },
      body: JSON.stringify(body),
    },
    "No pudimos agregar la oferta a la cotización.",
  );
}

/** Cambia la cantidad de una línea: es un valor nuevo, nunca una suma. */
export async function cambiarCantidadLinea(
  quoteId: string,
  lineId: string,
  cambio: { quantity: string; unit?: string | null; version: number },
): Promise<LineaAgregada> {
  return apiRequest<LineaAgregada>(
    `/api/v1/quotes/${quoteId}/lines/${lineId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: cambio.version,
        quantity: { value: cambio.quantity, unit: cambio.unit ?? undefined },
        ...(cambio.unit ? { quantity_unit: cambio.unit } : {}),
      }),
    },
    "No pudimos cambiar la cantidad.",
  );
}

/** Quita una línea de forma lógica: el historial y sus asignaciones se conservan. */
export async function quitarLinea(quoteId: string, lineId: string): Promise<LineaCotizacion> {
  return apiRequest<LineaCotizacion>(
    `/api/v1/quotes/${quoteId}/lines/${lineId}`,
    { method: "DELETE" },
    "No pudimos quitar el producto.",
  );
}

/** Finaliza: genera el informe, cierra la cotización y libera los faltantes cubiertos. */
export async function finalizarCotizacion(
  quoteId: string,
  opciones: { version: number; clave: string },
): Promise<ResultadoFinalizacion> {
  return apiRequest<ResultadoFinalizacion>(
    `/api/v1/quotes/${quoteId}/finalize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": opciones.clave,
      },
      body: JSON.stringify({ version: opciones.version }),
    },
    "No pudimos finalizar la cotización.",
  );
}

export async function obtenerInforme(quoteId: string): Promise<InformeRecuperado> {
  return apiRequest<InformeRecuperado>(
    `/api/v1/quotes/${quoteId}/report`,
    {},
    "No pudimos cargar el informe de la cotización.",
  );
}

// --------------------------------------------------------------------------- lectura del detalle

/** Líneas activas de todos los carritos, en el orden en que las entregó el servidor. */
export function lineasActivas(detalle: DetalleCotizacion | null): LineaCotizacion[] {
  if (!detalle) return [];
  return detalle.carts.flatMap((cart) => cart.lines.filter((line) => line.status === "active"));
}

/** Carritos con al menos una línea activa: lo que la persona ve como su cotización. */
export function carritosConLineas(detalle: DetalleCotizacion | null): CarritoCotizacion[] {
  if (!detalle) return [];
  return detalle.carts.filter((cart) => cart.lines.some((line) => line.status === "active"));
}

export interface TotalesCotizacion {
  /** Suma de subtotales conocidos. */
  confirmado: number;
  /** Líneas cuyo subtotal el backend no puede calcular (unidad o precio pendiente). */
  pendientes: number;
  /** Total general: solo existe cuando todas las líneas tienen subtotal. */
  total: number | null;
  lineas: number;
  proveedores: number;
}

const importe = (dinero: Dinero | null): number | null => {
  if (!dinero) return null;
  const valor = Number(dinero.amount);
  return Number.isFinite(valor) ? valor : null;
};

export function totalesDeCotizacion(detalle: DetalleCotizacion | null): TotalesCotizacion {
  const activas = lineasActivas(detalle);
  let confirmado = 0;
  let pendientes = 0;
  for (const linea of activas) {
    const subtotal = importe(linea.subtotal);
    if (subtotal === null) pendientes += 1;
    else confirmado += subtotal;
  }
  return {
    confirmado,
    pendientes,
    total: activas.length > 0 && pendientes === 0 ? confirmado : null,
    lineas: activas.length,
    proveedores: new Set(activas.map((linea) => linea.supplier_id)).size,
  };
}

export function subtotalDeCarrito(carrito: CarritoCotizacion): number | null {
  const activas = carrito.lines.filter((line) => line.status === "active");
  if (activas.length === 0) return null;
  let total = 0;
  for (const linea of activas) {
    const subtotal = importe(linea.subtotal);
    if (subtotal === null) return null;
    total += subtotal;
  }
  return total;
}

/**
 * Cantidad con la que se cotiza el faltante explícitamente seleccionado.
 *
 * Se respeta la cantidad a cotizar ya definida; si todavía no existe, se cotiza 1 por defecto
 * (D-147), que la pantalla fija antes mediante el comando SET auditado. Nunca inventa una unidad
 * ni una cantidad comercial: la interpretación comercial la resuelve el backend.
 */
export function cantidadParaCotizar(faltante: { target_quantity: string | null } | null): string {
  const definida = faltante?.target_quantity?.trim();
  if (!definida) return "1";
  const numero = Number(definida);
  // La cantidad de una línea de cotización es un entero positivo; una cantidad fraccionaria no
  // se redondea ni se inventa: se cotiza 1 y la cobertura queda explícitamente parcial.
  return Number.isInteger(numero) && numero > 0 ? definida : "1";
}
