import { describe, expect, it } from "vitest";

import { reemplazarOfertasDeArticulo } from "@/lib/ofertas-preferencias";

/**
 * Refresco del bloque de ofertas de un artículo tras aplicar una preferencia.
 *
 * El orden de las ofertas es el que devolvió E3 (motor determinista del backend); esta función no
 * ordena ni inventa ofertas, solo reemplaza el bloque del artículo en la posición que ya tenía.
 */
interface Item {
  oferta: { article_id: string; offer_id: string };
  articulo: string;
}

function oferta(articuloId: string, ofertaId: string): Item {
  return {
    oferta: { article_id: articuloId, offer_id: ofertaId },
    articulo: articuloId,
  };
}

function ofertas(items: Item[]): string[] {
  return items.map((item) => item.oferta.offer_id);
}

describe("reemplazarOfertasDeArticulo", () => {
  it("adopta el orden nuevo del backend para ese artículo", () => {
    const previas = [oferta("art-1", "of-a"), oferta("art-1", "of-b")];
    const nuevas = [oferta("art-1", "of-b"), oferta("art-1", "of-a")];

    expect(ofertas(reemplazarOfertasDeArticulo(previas, "art-1", nuevas))).toEqual([
      "of-b",
      "of-a",
    ]);
  });

  it("conserva la posición del bloque y el orden de los demás artículos", () => {
    const previas = [
      oferta("art-0", "of-0"),
      oferta("art-1", "of-a"),
      oferta("art-1", "of-b"),
      oferta("art-2", "of-2"),
    ];
    const nuevas = [oferta("art-1", "of-b"), oferta("art-1", "of-a")];

    expect(ofertas(reemplazarOfertasDeArticulo(previas, "art-1", nuevas))).toEqual([
      "of-0",
      "of-b",
      "of-a",
      "of-2",
    ]);
  });

  it("no duplica ofertas retiradas por el backend", () => {
    const previas = [oferta("art-1", "of-a"), oferta("art-1", "of-b")];
    const nuevas = [oferta("art-1", "of-b")];

    expect(ofertas(reemplazarOfertasDeArticulo(previas, "art-1", nuevas))).toEqual(["of-b"]);
  });

  it("si el artículo no estaba en la lista, agrega sus ofertas al final", () => {
    const previas = [oferta("art-2", "of-2")];
    const nuevas = [oferta("art-1", "of-a"), oferta("art-1", "of-b")];

    expect(ofertas(reemplazarOfertasDeArticulo(previas, "art-1", nuevas))).toEqual([
      "of-2",
      "of-a",
      "of-b",
    ]);
  });
});
