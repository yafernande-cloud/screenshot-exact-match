import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TarjetaCruzVerde } from "@/components/TarjetaCruzVerde";
import type { ChainResult } from "@/lib/cadenas";

const base: ChainResult = {
  chain_item_id: "263909",
  published_name: "Pyriped Ibuprofeno 400 mg 20 Cápsulas Blandas",
  brand_as_published: "MILAB",
  laboratory_as_published: "MINTLAB",
  presentation_as_published: "20 Cápsulas Blandas",
  description: null,
  image_url: "https://beta.cruzverde.cl/imagen/263909.jpg",
  price: {
    normal: { amount: "6340", currency: "CLP" },
    promotional: { amount: "4890", currency: "CLP" },
    fractional: { amount: "245", currency: "CLP", per_unit: "Capsula" },
  },
  conditions: "20% Descuento",
  has_stock: null,
  source_url: "https://www.cruzverde.cl/pyriped-ibuprofeno-400-mg/263909.html",
  observed_at: "2026-11-05T03:30:00+00:00",
  provenance: { source: "cruz_verde", data_origin: "published" },
  match: { level: "not_evaluated" },
};

function producto(overrides: Partial<ChainResult> = {}): ChainResult {
  return { ...base, ...overrides };
}

function renderResultados(resultados: ChainResult[]) {
  render(
    <TarjetaCruzVerde
      estado={{ tipo: "resultados", resultados, observadoEn: null, desactualizado: false }}
    />,
  );
}

describe("presentación de la tarjeta de Cruz Verde", () => {
  it("muestra nombre, marca, laboratorio, presentación, precios y condición publicados", () => {
    renderResultados([producto()]);

    expect(screen.getByAltText("Pyriped Ibuprofeno 400 mg 20 Cápsulas Blandas")).toHaveAttribute(
      "src",
      "https://beta.cruzverde.cl/imagen/263909.jpg",
    );
    expect(screen.getByText("Marca: MILAB")).toBeInTheDocument();
    expect(screen.getByText("MINTLAB")).toBeInTheDocument();
    expect(screen.getByText("20 Cápsulas Blandas")).toBeInTheDocument();
    expect(screen.getByText("$4.890")).toBeInTheDocument();
    expect(screen.getByText("$6.340")).toBeInTheDocument();
    expect(screen.getByText("$245 por Capsula")).toBeInTheDocument();
    expect(screen.getByText("20% Descuento")).toBeInTheDocument();

    const enlace = screen.getByRole("link", {
      name: "Ver publicación de Pyriped Ibuprofeno 400 mg 20 Cápsulas Blandas",
    });
    expect(enlace).toHaveAttribute("href", base.source_url);
    expect(enlace).toHaveAttribute("target", "_blank");
  });

  it("no informa disponibilidad: el stock está fuera del alcance del conector", () => {
    renderResultados([producto({ has_stock: true })]);

    expect(screen.queryByText(/Disponibilidad/)).not.toBeInTheDocument();
  });

  it("informa «Enlace no disponible» y conserva el producto cuando falta la URL", () => {
    renderResultados([
      producto({
        source_url: null,
        published_name: "Producto sin enlace público",
      }),
    ]);

    expect(screen.getByText("Producto sin enlace público")).toBeInTheDocument();
    expect(screen.getByText("Enlace no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("no usa la marca como laboratorio cuando el laboratorio no está informado", () => {
    renderResultados([producto({ laboratory_as_published: null })]);

    expect(screen.getByText("Laboratorio no informado")).toBeInTheDocument();
    expect(screen.queryByText("MINTLAB")).not.toBeInTheDocument();
  });

  it("mantiene las publicaciones dentro de una región desplazable", () => {
    renderResultados([
      producto(),
      producto({
        chain_item_id: "580696",
        published_name: "Shampoo Ceramide 400 mL",
        source_url: "https://www.cruzverde.cl/product/580696.html",
        image_url: null,
      }),
    ]);

    expect(
      screen.getByRole("region", { name: "Publicaciones de Cruz Verde (2)" }),
    ).toBeInTheDocument();
  });

  it("muestra la falta de conexión sin precios ni productos inventados", () => {
    render(
      <TarjetaCruzVerde
        estado={{
          tipo: "no_configurada",
          mensaje: "La conexión con Cruz Verde aún no tiene autorización de uso.",
        }}
      />,
    );

    expect(screen.getByText(/aún no tiene autorización/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
