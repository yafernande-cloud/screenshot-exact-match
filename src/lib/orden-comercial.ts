/**
 * Orden comercial entre ofertas de un mismo proveedor.
 *
 * El backend entrega `order_key` ya resuelta (preferencias del artículo y efectos entre artículos).
 * El frontend solo compara de forma estable por esa clave: no reordena por nombre, fuente, precio
 * ni proveedor, y no conoce puntuaciones ni explicaciones de IA. Una oferta sin clave (respuesta
 * antigua o sin identidad) conserva la posición que le dio el backend.
 */

export type ClaveOrden = readonly number[] | null | undefined;

/** Comparación lexicográfica; los ceros faltantes son neutros. Empate = conservar el orden. */
export function compararClaveOrden(a: ClaveOrden, b: ClaveOrden): number {
  const izquierda = a ?? [];
  const derecha = b ?? [];
  const largo = Math.max(izquierda.length, derecha.length);
  for (let i = 0; i < largo; i += 1) {
    const va = izquierda[i] ?? 0;
    const vb = derecha[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
