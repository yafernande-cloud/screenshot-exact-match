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

/** Unidades que acepta el comando de cantidad del backend (`QuantityUnit`). */
export const UNIDADES_CANTIDAD = ["box", "package", "unit", "bottle"] as const;
export type UnidadCantidad = (typeof UNIDADES_CANTIDAD)[number];

export function esUnidadCantidad(valor: string | null | undefined): valor is UnidadCantidad {
  return Boolean(valor) && (UNIDADES_CANTIDAD as readonly string[]).includes(valor as string);
}

/**
 * Unidad con la que se puede fijar la cantidad objetivo: la actual, o la solicitada si aún no
 * hay cantidad objetivo. Nunca se inventa una unidad.
 */
export function unidadDeAjuste(
  faltante: Pick<Faltante, "quantity_unit" | "requested_unit" | "declared_unit">,
): UnidadCantidad | null {
  for (const unidad of [faltante.quantity_unit, faltante.requested_unit, faltante.declared_unit]) {
    if (esUnidadCantidad(unidad)) return unidad;
  }
  return null;
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
