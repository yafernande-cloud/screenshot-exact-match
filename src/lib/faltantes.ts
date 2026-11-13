import type { SolicitudAcceso } from "@/data/demo";
import type { Faltante } from "@/lib/faltantes-api";

export const pendientes = (s: SolicitudAcceso[]) => s.filter((x) => x.estado === "pendiente");

/** Cualquier administrador autorizado puede aprobar o rechazar; solo se resuelven solicitudes pendientes. */
export function resolverSolicitud(
  solicitudes: SolicitudAcceso[],
  solicitudId: string,
  estado: "aprobada" | "rechazada",
  adminId: string,
): SolicitudAcceso[] {
  return solicitudes.map((s) =>
    s.solicitudId === solicitudId && s.estado === "pendiente"
      ? { ...s, estado, revisadaPor: adminId }
      : s,
  );
}

// ---------------------------------------------------------------------------------------------
// Bandeja real (backend). Solo funciones puras: la red vive en `faltantes-api.ts`.
// ---------------------------------------------------------------------------------------------

const ETIQUETAS_ESTADO: Record<string, string> = {
  active: "Pendiente",
  cancelled: "Cancelado",
  fulfilled: "Cumplido",
};

/**
 * Estado real que entrega el backend, presentado en español.
 */
export function etiquetaEstadoFaltante(status: string): string {
  return ETIQUETAS_ESTADO[status] ?? status;
}

export interface PartesFaltante {
  titulo: string;
  detalles: string[];
}

/**
 * Título y detalles para presentar nombres largos en dos niveles.
 *
 * Cuando el backend entrega `display_parts` se usa tal cual (limpio de vacíos); si falta —backend
 * anterior— o viene sin encabezado, se muestra `display_name` completo para no perder información.
 */
export function partesDelFaltante(
  faltante: Pick<Faltante, "display_name" | "display_parts">,
): PartesFaltante {
  const titulo = faltante.display_parts?.name?.trim();
  if (!titulo) return { titulo: faltante.display_name, detalles: [] };
  const detalles = (faltante.display_parts?.details ?? [])
    .map((detalle) => detalle.trim())
    .filter(Boolean);
  return { titulo, detalles };
}

/**
 * Consulta que se envía a las cadenas al pulsar «Buscar».
 *
 * Prioriza `search_query` del backend (nombre comercial corto, p. ej. «Predual»). Si el backend
 * es anterior y no lo entrega, usa el encabezado del nombre y, como último recurso, el nombre
 * completo. Nunca construye una descripción distinta a la que el backend ya calculó.
 */
export function consultaDeBusqueda(
  faltante: Pick<Faltante, "display_name" | "display_parts" | "search_query">,
): string {
  const consulta = faltante.search_query?.trim();
  if (consulta) return consulta;
  const encabezado = faltante.display_parts?.name?.trim();
  return encabezado || faltante.display_name.trim();
}

/** Tope del backend para la consulta de búsqueda (`SearchRequest.query`). */
export const MAX_CONSULTA_BUSQUEDA = 200;

/**
 * Consulta ampliada que se escribe en el buscador al partir desde un faltante.
 *
 * Usa `search_query_full` (nombre más concentración, forma y presentación registrados). Si el
 * backend es anterior y no lo entrega, cae a la consulta corta; nunca arma atributos por su
 * cuenta. Se respeta el tope de 200 caracteres cortando por palabra.
 */
export function consultaCompletaDeBusqueda(
  faltante: Pick<Faltante, "display_name" | "display_parts" | "search_query" | "search_query_full">,
): string {
  const completa = faltante.search_query_full?.trim();
  if (!completa) return consultaDeBusqueda(faltante);
  if (completa.length <= MAX_CONSULTA_BUSQUEDA) return completa;
  const recortada = completa.slice(0, MAX_CONSULTA_BUSQUEDA);
  const corte = recortada.lastIndexOf(" ");
  return (corte > 0 ? recortada.slice(0, corte) : recortada).trim();
}

/** Unidades que acepta el comando de cantidad del backend (`QuantityUnit`). */
export const UNIDADES_CANTIDAD = ["box", "package", "unit", "bottle"] as const;
export type UnidadCantidad = (typeof UNIDADES_CANTIDAD)[number];

export function esUnidadCantidad(valor: string | null | undefined): valor is UnidadCantidad {
  return Boolean(valor) && (UNIDADES_CANTIDAD as readonly string[]).includes(valor as string);
}

/**
 * Unidad con la que se puede fijar la cantidad objetivo: la actual, o la solicitada si aún no
 * hay cantidad objetivo. Nunca se inventa una unidad comercial.
 *
 * Cuando nadie declaró ninguna unidad («10 acidos mefenamicos») y el reporte sí tiene una
 * cantidad, se usa la unidad genérica `unit`, la misma de D-147: cuenta piezas y no supone cajas
 * ni comprimidos. Una unidad presente pero desconocida sigue dando `null`: no se adivina.
 */
export function unidadDeAjuste(
  faltante: Pick<
    Faltante,
    | "quantity_unit"
    | "requested_unit"
    | "declared_unit"
    | "target_quantity"
    | "requested_quantity"
    | "declared_quantity"
  >,
): UnidadCantidad | null {
  const unidades = [faltante.quantity_unit, faltante.requested_unit, faltante.declared_unit];
  for (const unidad of unidades) {
    if (esUnidadCantidad(unidad)) return unidad;
  }
  const sinUnidad = unidades.every((unidad) => !unidad?.trim());
  const cantidad =
    numero(faltante.target_quantity) ??
    numero(faltante.requested_quantity) ??
    numero(faltante.declared_quantity);
  return sinUnidad && cantidad !== null ? "unit" : null;
}

/**
 * Cantidad que la auxiliar escribió explícitamente y que todavía no es objetivo de compra.
 *
 * Es el valor inicial visible de «A cotizar» (p. ej. «10 (inicial)»). La unidad predeterminada
 * de D-147 no cuenta: esa ya se distingue con «1 por defecto». `null` cuando no hay una cantidad
 * entera positiva informada por una persona.
 */
export function cantidadReportadaExplicita(
  faltante: Pick<
    Faltante,
    "requested_quantity_origin" | "requested_quantity" | "declared_quantity"
  >,
): number | null {
  if (faltante.requested_quantity_origin !== "explicit") return null;
  const valor = numero(faltante.requested_quantity) ?? numero(faltante.declared_quantity);
  if (valor === null || valor <= 0 || !Number.isInteger(valor)) return null;
  return valor;
}

/**
 * Unidad con la que se fija 1 al asociar una oferta a un reporte sin cantidad objetivo.
 *
 * Respeta la unidad que el reporte ya declara. Si no declara ninguna y la oferta tampoco, usa la
 * unidad genérica `unit` (D-147): cuenta piezas y no inventa caja ni botella. Devuelve `null`
 * cuando el reporte y la oferta no comparten unidad, porque asociarlos exigiría suponer una
 * equivalencia comercial que nadie declaró.
 */
export function unidadParaAsociar(
  faltante: Pick<
    Faltante,
    | "quantity_unit"
    | "requested_unit"
    | "declared_unit"
    | "target_quantity"
    | "requested_quantity"
    | "declared_quantity"
  >,
  unidadOferta: string | null,
): UnidadCantidad | null {
  const declarada = unidadDeAjuste(faltante);
  if (unidadOferta === null) {
    return declarada === null || declarada === "unit" ? "unit" : null;
  }
  return declarada === unidadOferta ? declarada : null;
}

/**
 * ¿El faltante ya está cubierto por una línea activa de un carrito en preparación?
 *
 * La cobertura la calcula el backend (`replenishment_state = in_quote`, §12); la bandeja solo la
 * presenta. Un backend anterior sin esos campos no oculta nada: nunca se supone una cobertura.
 */
export function estaEnCarrito(
  faltante: Pick<Faltante, "replenishment_state" | "quoted_quantity">,
): boolean {
  if (faltante.replenishment_state) return faltante.replenishment_state === "in_quote";
  const cotizado = Number(faltante.quoted_quantity ?? "0");
  return Number.isFinite(cotizado) && cotizado > 0;
}

/** Filas de «Faltantes por cotizar»: las que todavía no están en el carrito. */
export function visiblesEnBandeja(faltantes: readonly Faltante[]): Faltante[] {
  return faltantes.filter((f) => !estaEnCarrito(f));
}

function numero(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Punto de partida visible para ajustar: la cantidad objetivo si existe; si no, la solicitada.
 * `null` significa que todavía no hay ninguna cantidad conocida.
 */
export function cantidadDeReferencia(
  faltante: Pick<Faltante, "target_quantity" | "requested_quantity" | "declared_quantity">,
): number | null {
  return (
    numero(faltante.target_quantity) ??
    numero(faltante.requested_quantity) ??
    numero(faltante.declared_quantity)
  );
}

/** Siguiente cantidad objetivo al pulsar +/−. Nunca baja de 1 ni inventa una cantidad. */
export function siguienteCantidad(
  faltante: Pick<Faltante, "target_quantity" | "requested_quantity" | "declared_quantity">,
  delta: number,
): number | null {
  const base = cantidadDeReferencia(faltante);
  if (base === null) return delta > 0 ? 1 : null;
  const siguiente = base + delta;
  return siguiente < 1 ? 1 : siguiente;
}

/**
 * Fusiona la lista del servidor con la que ya se muestra.
 *
 * - Nunca pisa una fila con una versión más nueva en pantalla.
 * - Conserva las filas con una mutación en curso para que el sondeo de 10 s no interrumpa al
 *   usuario justo cuando acaba de pulsar +/− o Retirar.
 */
export function fusionarFaltantes(
  previos: Faltante[],
  recibidos: Faltante[],
  bloqueados: ReadonlySet<string> = new Set(),
): Faltante[] {
  const antes = new Map(previos.map((f) => [f.id, f]));
  const fusion = recibidos.map((recibido) => {
    const previo = antes.get(recibido.id);
    if (!previo) return recibido;
    if (bloqueados.has(recibido.id)) return previo;
    return (previo.version ?? 0) > (recibido.version ?? 0) ? previo : recibido;
  });
  const ids = new Set(fusion.map((f) => f.id));
  for (const previo of previos) {
    if (!ids.has(previo.id) && bloqueados.has(previo.id)) fusion.push(previo);
  }
  return fusion;
}

/**
 * Aplica la respuesta de `quantity-commands` sin perder los datos de autor y sucursal.
 *
 * El backend responde el ítem sin `meta` en este endpoint; reemplazar la fila entera borraría el
 * nombre de quien reportó y la fecha. Solo se actualiza lo que el comando cambió.
 */
export function aplicarCambioCantidad(previo: Faltante, actualizado: Partial<Faltante>): Faltante {
  const objetivo = actualizado.target_quantity ?? null;
  return {
    ...previo,
    target_quantity: objetivo,
    quantity_unit: actualizado.quantity_unit ?? null,
    version: actualizado.version ?? previo.version,
    needs_quantity: actualizado.needs_quantity ?? objetivo === null,
    quantity_status: actualizado.quantity_status ?? (objetivo === null ? "unknown" : "defined"),
  };
}
