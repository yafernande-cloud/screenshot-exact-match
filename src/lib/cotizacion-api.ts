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
import { etiquetaUnidad, formatearCantidad } from "@/lib/catalogo";

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
  /** Referencias activas; puede faltar en un backend anterior a esta ampliación. */
  distinct_product_count?: number;
  /** Cantidades solicitadas agrupadas por unidad; unidad `null` = no informada. */
  quantity_totals?: TotalPorUnidad[];
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
 * La cotización dejó de admitir cambios porque se cerró o finalizó —quizá en otra pestaña—.
 * Quien reciba este error debe volver a leer el carrito activo en vez de seguir mostrando uno
 * que ya no es editable.
 */
export function cotizacionCerrada(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "QUOTE_CLOSED" || error.code === "QUOTE_ALREADY_FINALIZED")
  );
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
  opciones: {
    finalized?: boolean;
    status?: "draft" | "closed";
    active?: boolean;
    limit?: number;
    q?: string;
  } = {},
): Promise<ResumenCotizacion[]> {
  const params = new URLSearchParams();
  if (opciones.finalized !== undefined) params.set("finalized", String(opciones.finalized));
  if (opciones.status) params.set("status", opciones.status);
  if (opciones.active) params.set("active", "true");
  params.set("limit", String(opciones.limit ?? 20));
  if (opciones.q) params.set("q", opciones.q);
  const data = await apiRequest<ListaCotizaciones>(
    `/api/v1/quotes?${params.toString()}`,
    {},
    MENSAJE_GENERICO,
  );
  return data.quotes;
}

/**
 * El carrito activo: el único borrador vigente de la organización. El servidor decide cuál es
 * (un borrador anterior al último cierre no se recupera solo), así que la regla no se repite aquí.
 */
export async function ultimaCotizacionEnPreparacion(): Promise<ResumenCotizacion | null> {
  const [primera] = await listarCotizaciones({ active: true, limit: 1 });
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

/**
 * Recupera el carrito activo o crea uno nuevo, sin duplicar borradores: dos pestañas que agregan
 * a la vez reciben el mismo carrito. Es la operación que usa el cotizador al agregar la primera línea.
 */
export async function crearCotizacionActiva(): Promise<DetalleCotizacion> {
  return apiRequest<DetalleCotizacion>(
    "/api/v1/quotes/active",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
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
  /**
   * Unidad comercial que la administradora confirma cuando la oferta no la declara (FarmaLoop).
   * El backend la valida y la audita; nunca reemplaza una unidad publicada por la fuente.
   */
  confirmedSaleUnit?: string;
  /** Nombre visible de la oferta, solo para el diálogo de confirmación. */
  offerName?: string;
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
    confirmed_sale_unit?: string;
    demand_item_id?: string;
  } = {
    supplier_id: alta.supplierId,
    quantity: { value: alta.quantity, unit: alta.unit },
  };
  if (alta.offerSnapshotId) body.offer_snapshot_id = alta.offerSnapshotId;
  if (alta.offer) body.offer = alta.offer;
  if (alta.confirmedSaleUnit) body.confirmed_sale_unit = alta.confirmedSaleUnit;
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
    "No pudimos cargar la orden de compra de la cotización.",
  );
}

// --------------------------------------------------------------------------- lectura del detalle

/**
 * Un detalle solo es un carrito editable mientras la cotización siga en borrador. Una cotización
 * finalizada conserva sus líneas para cobertura e historial, pero no se presenta como carrito: se
 * lee en el informe.
 */
export function carritoEditable(detalle: DetalleCotizacion | null): boolean {
  return !!detalle && detalle.status === "draft" && detalle.finalized_at === null;
}

/** Líneas activas de todos los carritos, en el orden en que las entregó el servidor. */
export function lineasActivas(detalle: DetalleCotizacion | null): LineaCotizacion[] {
  if (!detalle || !carritoEditable(detalle)) return [];
  return detalle.carts.flatMap((cart) => cart.lines.filter((line) => line.status === "active"));
}

/** Carritos con al menos una línea activa: lo que la persona ve como su cotización. */
export function carritosConLineas(detalle: DetalleCotizacion | null): CarritoCotizacion[] {
  if (!detalle || !carritoEditable(detalle)) return [];
  return detalle.carts.filter((cart) => cart.lines.some((line) => line.status === "active"));
}

export interface FaltantesDelCarrito {
  /** Faltantes de Telegram vinculados a las líneas activas del carrito. */
  asociados: number;
  /** Nombres de los que el servidor ya informa como completamente cubiertos. */
  cubiertos: string[];
}

/**
 * Faltantes de Telegram asociados a este carrito y cuántos quedan completamente cubiertos.
 *
 * Solo se leen las asignaciones de las líneas activas y la cobertura que ya calculó el servidor:
 * el cliente anticipa lo que el backend informará al finalizar, no decide cobertura ni liberación.
 */
export function faltantesDelCarrito(detalle: DetalleCotizacion | null): FaltantesDelCarrito {
  const ids = new Set<string>();
  for (const linea of lineasActivas(detalle)) {
    if (linea.demand_item_id) ids.add(linea.demand_item_id);
    for (const asignacion of linea.demand_allocations ?? []) ids.add(asignacion.demand_item_id);
  }
  const cubiertos: string[] = [];
  for (const fila of detalle?.coverage ?? []) {
    const id = fila["demand_item_id"];
    if (typeof id !== "string" || !ids.has(id)) continue;
    // Solo lo que el backend marca con cantidad pendiente conocida y cero se liberará. Una
    // cantidad pedida desconocida (`null`) no se considera cubierta: el backend no la libera.
    const pendiente = fila["pending_quantity"];
    const sinPendiente =
      (typeof pendiente === "number" || typeof pendiente === "string") && Number(pendiente) === 0;
    if (!sinPendiente) continue;
    const nombre = fila["display_name"];
    cubiertos.push(typeof nombre === "string" && nombre.trim() ? nombre : "Faltante sin nombre");
  }
  return { asociados: ids.size, cubiertos };
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

/** Cantidad solicitada sumada dentro de una sola unidad comercial. */
export interface TotalPorUnidad {
  /** `null` = las líneas no informan unidad; nunca se mezcla con las conocidas. */
  unit: string | null;
  quantity: string;
}

/**
 * Referencias, productos distintos y cantidades de lo que hay en el carrito.
 *
 * `referencias` cuenta líneas activas (no unidades) y `productosDistintos` cuenta artículos:
 * el mismo producto en dos proveedores suma dos referencias y un solo producto. Las cantidades
 * se agrupan por unidad comercial y jamás se suman entre unidades distintas.
 */
export interface ResumenCantidades {
  referencias: number;
  productosDistintos: number;
  proveedores: number;
  porUnidad: TotalPorUnidad[];
  /** Un solo grupo de cantidad: se puede hablar de «total» sin ambigüedad. */
  homogenea: boolean;
}

/**
 * Convierte una cantidad decimal del backend a milésimas enteras.
 *
 * Sumar con `Number` puede arrastrar artefactos binarios (`0.1 + 0.2`); las cantidades viajan
 * con hasta tres decimales, así que se suman como enteros y se vuelven a formatear.
 */
function aMilesimas(valor: string): bigint | null {
  const limpio = valor.trim();
  const partes = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(limpio);
  if (!partes) return null;
  const signo = partes[1] === "-" ? -1n : 1n;
  const entero = BigInt(partes[2] ?? "0");
  const decimal = BigInt((partes[3] ?? "").padEnd(3, "0"));
  return signo * (entero * 1000n + decimal);
}

/** Vuelve a una cantidad decimal sin ceros de relleno: `6000n` → «6», `2500n` → «2.5». */
function deMilesimas(valor: bigint): string {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const entero = absoluto / 1000n;
  const resto = (absoluto % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negativo ? "-" : ""}${entero}${resto ? `.${resto}` : ""}`;
}

function sumarPorUnidad(
  lineas: ReadonlyArray<{ quantity: { value: string; unit: string | null } }>,
  contarSinUnidadComoLineas = false,
): TotalPorUnidad[] {
  const totales = new Map<string | null, bigint>();
  for (const linea of lineas) {
    // Sin unidad informada no hay una magnitud comparable: se cuenta la referencia (la línea),
    // no la cantidad. Una línea con cantidad 2 es **una** referencia sin unidad.
    if (contarSinUnidadComoLineas && linea.quantity.unit === null) {
      totales.set(null, (totales.get(null) ?? 0n) + 1000n);
      continue;
    }
    const milesimas = aMilesimas(linea.quantity.value);
    if (milesimas === null) continue;
    const unidad = linea.quantity.unit;
    totales.set(unidad, (totales.get(unidad) ?? 0n) + milesimas);
  }
  const conocidas = [...totales.keys()]
    .filter((unidad): unidad is string => unidad !== null)
    .sort((a, b) => a.localeCompare(b, "es"));
  const ordenadas: Array<string | null> = totales.has(null) ? [...conocidas, null] : conocidas;
  return ordenadas.map((unidad) => ({
    unit: unidad,
    quantity: deMilesimas(totales.get(unidad) ?? 0n),
  }));
}

function resumenDeLineas(
  lineas: ReadonlyArray<{
    trade_item_id: string;
    supplier_id: string;
    quantity: { value: string; unit: string | null };
  }>,
  contarSinUnidadComoLineas = false,
): ResumenCantidades {
  const porUnidad = sumarPorUnidad(lineas, contarSinUnidadComoLineas);
  return {
    referencias: lineas.length,
    productosDistintos: new Set(lineas.map((linea) => linea.trade_item_id)).size,
    proveedores: new Set(lineas.map((linea) => linea.supplier_id)).size,
    porUnidad,
    homogenea: porUnidad.length <= 1,
  };
}

/** Resumen del carrito entero (todas las líneas activas de una cotización editable). */
export function resumenDeCotizacion(detalle: DetalleCotizacion | null): ResumenCantidades {
  if (!detalle || !carritoEditable(detalle)) return resumenDeLineas([]);
  // Mismo filtro que el resumen del servidor: carritos y líneas activos. Las líneas sin unidad
  // informada se cuentan como referencias, no como cantidades.
  return resumenDeLineas(
    detalle.carts
      .filter((cart) => cart.status === "active")
      .flatMap((cart) => cart.lines.filter((line) => line.status === "active")),
    true,
  );
}

/** Resumen de un carrito de proveedor. */
export function resumenDeCarrito(carrito: CarritoCotizacion): ResumenCantidades {
  return resumenDeLineas(
    carrito.lines.filter((linea) => linea.status === "active"),
    true,
  );
}

/** Resumen de una orden de compra congelada, a partir de sus líneas guardadas. */
export function resumenDeInforme(informe: InformeCotizacion): ResumenCantidades {
  return resumenDeLineas(
    informe.items.map((item) => ({
      trade_item_id: item.trade_item_id,
      supplier_id: item.supplier_id,
      quantity: item.quantity,
    })),
  );
}

/**
 * Un grupo de cantidad con su unidad. La unidad desconocida se declara como tal: no se presenta
 * como «unidades» ni se lleva a cajas.
 */
export function describirTotalUnidad(total: TotalPorUnidad): string {
  const cifra = formatearCantidad(total.quantity) ?? total.quantity;
  if (total.unit) return `${cifra} ${etiquetaUnidad(total.unit, total.quantity)}`;
  return `${cifra} sin unidad informada`;
}

/** «5 cajas + 2 unidades», o `null` cuando ninguna línea tiene cantidad sumable. */
export function describirCantidades(resumen: ResumenCantidades): string | null {
  if (resumen.porUnidad.length === 0) return null;
  return resumen.porUnidad.map(describirTotalUnidad).join(" + ");
}

/**
 * Línea corta de referencias y cantidades: «4 referencias · 5 cajas + 5 unidades».
 *
 * Se usa por proveedor, donde el número de proveedores es siempre uno.
 */
export function describirResumenReferencias(resumen: ResumenCantidades): string | null {
  if (resumen.referencias === 0) return null;
  return [
    `${resumen.referencias} ${resumen.referencias === 1 ? "referencia" : "referencias"}`,
    describirCantidades(resumen),
  ]
    .filter((parte): parte is string => Boolean(parte))
    .join(" · ");
}

/**
 * Línea corta para encabezados: «4 referencias · 5 cajas + 5 unidades · 2 proveedores».
 *
 * Nunca suma unidades distintas ni convierte envases en unidades sueltas: si hay varias, se
 * enumeran. Un carrito vacío no produce texto.
 */
export function describirResumenCantidades(resumen: ResumenCantidades): string | null {
  const base = describirResumenReferencias(resumen);
  if (!base) return null;
  return `${base} · ${resumen.proveedores} ${resumen.proveedores === 1 ? "proveedor" : "proveedores"}`;
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
