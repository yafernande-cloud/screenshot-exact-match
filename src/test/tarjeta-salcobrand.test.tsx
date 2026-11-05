import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TarjetaSalcobrand } from "@/components/TarjetaSalcobrand";
import type { ChainResult } from "@/lib/cadenas";

const base: ChainResult = {
  chain_item_id: "123456",
  published_name: "Paracetamol 500 mg x 16 comprimidos",
  brand_as_published: "Genérico",
  laboratory_as_published: null,
  presentation_as_published: "16 comprimidos",
  description: null,
  image_url: "https://salcobrand.cl/medias/paracetamol.jpg",
  price: {
    normal: { amount: "1990", currency: "CLP" },
    promotional: { amount: "1490", currency: "CLP" },
    fractional: null,
  },
  conditions: "Con tarjeta",
  has_stock: true,
  source_url: "https://salcobrand.cl/products/paracetamol?default_sku=123456",
  observed_at: "2026-11-04T15:30:00+00:00",
  provenance: { source: "salcobrand", data_origin: "published" },
  match: { level: "not_evaluated" },
};

function producto(overrides: Partial<ChainResult> = {}): ChainResult {
  return { ...base, ...overrides };
}

function renderResultados(resultados: ChainResult[], desactualizado = false) {
  render(
    <TarjetaSalcobrand
      estado={{ tipo: "resultados", resultados, observadoEn: null, desactualizado }}
    />,
  );
}

describe("presentación de la tarjeta de Salcobrand", () => {
  it("muestra imagen, nombre, marca, presentación, precios, condición y enlace", () => {
    renderResultados([producto()]);

    expect(screen.getByAltText("Paracetamol 500 mg x 16 comprimidos")).toHaveAttribute(
      "src",
      "https://salcobrand.cl/medias/paracetamol.jpg",
    );
    expect(screen.getByText("Paracetamol 500 mg x 16 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("Marca: Genérico")).toBeInTheDocument();
    expect(screen.queryByText("Presentación no informada")).not.toBeInTheDocument();
    expect(screen.getByText("16 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("$1.490")).toBeInTheDocument();
    expect(screen.getByText("$1.990")).toBeInTheDocument();
    expect(screen.getByText("Con tarjeta")).toBeInTheDocument();
    expect(screen.getByText("Disponibilidad: disponible")).toBeInTheDocument();

    const enlace = screen.getByRole("link", {
      name: "Ver publicación de Paracetamol 500 mg x 16 comprimidos",
    });
    expect(enlace).toHaveAttribute("href", base.source_url);
    expect(enlace).toHaveAttribute("target", "_blank");
  });

  it("no confunde la marca con el laboratorio ni inventa el laboratorio ausente", () => {
    renderResultados([producto()]);

    expect(screen.getByText("Laboratorio no informado")).toBeInTheDocument();
    expect(screen.queryByText("Laboratorio Genérico")).not.toBeInTheDocument();
    expect(screen.queryByText("Genérico")).not.toBeInTheDocument();
  });

  it("solo informa disponibilidad cuando el backend la publica", () => {
    renderResultados([
      producto({ chain_item_id: "1", has_stock: false, source_url: "https://salcobrand.cl/1" }),
      producto({
        chain_item_id: "2",
        has_stock: null,
        source_url: "https://salcobrand.cl/2",
        published_name: "Ibuprofeno 400 mg",
      }),
    ]);

    expect(screen.getByText("Disponibilidad: sin stock")).toBeInTheDocument();
    expect(screen.getByText("Disponibilidad: no informada")).toBeInTheDocument();
  });

  it("mantiene todas las publicaciones dentro de una región desplazable", () => {
    renderResultados([
      producto(),
      producto({
        chain_item_id: "654321",
        published_name: "Losartán 50 mg x 30 comprimidos",
        source_url: "https://salcobrand.cl/products/losartan?default_sku=654321",
        image_url: null,
      }),
    ]);

    expect(
      screen.getByRole("region", { name: "Publicaciones de Farmacias Salcobrand (2)" }),
    ).toBeInTheDocument();
  });

  it("muestra la falta de conexión sin precios ni productos inventados", () => {
    render(
      <TarjetaSalcobrand
        estado={{
          tipo: "no_configurada",
          mensaje: "La conexión con Farmacias Salcobrand aún no tiene autorización de uso.",
        }}
      />,
    );

    expect(screen.getByText(/aún no tiene autorización/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("informa un error de fuente sin convertirlo en «sin resultados»", () => {
    render(
      <TarjetaSalcobrand
        estado={{ tipo: "error", mensaje: "Farmacias Salcobrand no respondió." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Farmacias Salcobrand no respondió.");
    expect(screen.queryByText("Sin resultados")).not.toBeInTheDocument();
  });
});
