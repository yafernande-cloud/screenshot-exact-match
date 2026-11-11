/**
 * Refresco de las ofertas de un artículo después de enseñar una preferencia.
 *
 * El orden lo decide el backend (motor determinista dentro de E3). Aquí solo se reemplaza el
 * bloque de ofertas de ese artículo por lo que devolvió E3, conservando la posición del bloque en
 * la pantalla. No se ordena, no se puntúa y no se agregan ofertas que el backend no devolvió.
 */

interface OfertaConArticulo {
  oferta: { article_id: string };
}

export function reemplazarOfertasDeArticulo<T extends OfertaConArticulo>(
  previas: readonly T[],
  articuloId: string,
  nuevas: readonly T[],
): T[] {
  const posicion = previas.findIndex((item) => item.oferta.article_id === articuloId);
  const sinArticulo = previas.filter((item) => item.oferta.article_id !== articuloId);
  if (posicion === -1) return [...sinArticulo, ...nuevas];
  // `posicion` es el índice del primer elemento del artículo: todos los anteriores pertenecen a
  // otros artículos y encabezan `sinArticulo`, así que el bloque conserva su lugar.
  return [...sinArticulo.slice(0, posicion), ...nuevas, ...sinArticulo.slice(posicion)];
}
