import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TarjetaCadenaPublicada } from "@/components/TarjetaCadenaPublicada";
import type { ChainResult } from "@/lib/cadenas";

/**
 * Distintivo de relación con la consulta en las tarjetas de Ahumada y Salcobrand. Una publicación
 * que el nombre no confirma se conserva visible, pero se anota como no confirmada.
 */
function resultado(over: Partial<ChainResult> = {}): ChainResult {
  return {
    chain_item_id: "84574",
    published_name: "Tapsin Plus 20 Comprimidos",
    brand_as_published: null,
    laboratory_as_published: "TAPSIN",
    presentation_as_published: "20 Comprimidos",
    has_stock: false,
    description: null,
    image_url: null,
    price: { normal: { amount: "1309", currency: "CLP" }, promotional: null, fractional: null },
    conditions: null,
    source_url: "https://www.farmaciasahumada.cl/tapsin-plus.html",
    observed_at: "2026-11-13T10:00:00+00:00",
    provenance: { source: "ahumada", data_origin: "published" },
    match: { level: "not_evaluated" },
    ...over,
  };
}

function renderResultados(resultados: ChainResult[]) {
  render(
    <TarjetaCadenaPublicada
      nombre="Farmacias Ahumada"
      logo="/ahumada.png"
      logoClassName="h-12"
      estado={{ tipo: "resultados", resultados, observadoEn: null, desactualizado: false }}
      mostrarDisponibilidad
    />,
  );
}

describe("tarjeta de cadena publicada", () => {
  it("señala la publicación que no confirma la consulta sin ocultarla", () => {
    renderResultados([
      resultado({
        match: { level: "related", causes: ["query_not_confirmed_by_name"] },
      }),
    ]);

    expect(screen.getByText("Coincidencia no confirmada")).toHaveAttribute(
      "title",
      "Se publica para esta búsqueda, pero su nombre no confirma la consulta.",
    );
    // El producto y su precio se conservan: solo se etiqueta la relación.
    expect(screen.getByText("Tapsin Plus 20 Comprimidos")).toBeInTheDocument();
    expect(screen.getByText("$1.309")).toBeInTheDocument();
  });

  it("rotula también la coincidencia parcial que no confirma la consulta entera", () => {
    renderResultados([
      resultado({
        chain_item_id: "2",
        published_name: "Ácido Hialurónico Loreal Revitalift 30 ml",
        match: { level: "related", causes: ["partial_query_match"] },
      }),
    ]);

    expect(screen.getByText("Coincidencia no confirmada")).toBeInTheDocument();
    expect(screen.getByText("Ácido Hialurónico Loreal Revitalift 30 ml")).toBeInTheDocument();
  });

  it("no agrega el distintivo a una coincidencia directa ni a una relación sin causa declarada", () => {
    renderResultados([
      resultado({
        chain_item_id: "1",
        match: { level: "direct", causes: ["all_query_terms_in_name"] },
      }),
      resultado({
        chain_item_id: "2",
        published_name: "Otro producto",
        match: { level: "related", causes: ["other_reason"] },
      }),
      // `causes` ausente o de otra forma: se ignora en vez de romper la tarjeta.
      resultado({ chain_item_id: "3", published_name: "Sin causas", match: { level: "related" } }),
    ]);

    expect(screen.queryByText("Coincidencia no confirmada")).toBeNull();
  });
});
