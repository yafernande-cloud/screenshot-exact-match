import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TarjetaAhumada } from "@/components/TarjetaAhumada";
import type { ChainResult } from "@/lib/cadenas";

const base: ChainResult = {
  chain_item_id: "84574",
  published_name: "Paracetamol 500 mg x 16 comprimidos",
  laboratory_as_published: "Laboratorio Chile",
  presentation_as_published: "16 comprimidos",
  description: null,
  image_url: "https://www.farmaciasahumada.cl/medias/paracetamol-84574.jpg",
  price: {
    normal: { amount: "1309", currency: "CLP" },
    promotional: { amount: "618", currency: "CLP" },
    fractional: { amount: "82", currency: "CLP", per_unit: "comprimido" },
  },
  conditions: "Ahumada Contigo",
  source_url: "https://www.farmaciasahumada.cl/paracetamol-500-mg-x-16-comprimidos-84574.html",
  observed_at: "2026-11-04T15:30:00+00:00",
  provenance: { data_origin: "published" },
  match: { level: "not_evaluated" },
};

function producto(overrides: Partial<ChainResult> = {}): ChainResult {
  return { ...base, ...overrides };
}

function renderResultados(resultados: ChainResult[], desactualizado = false) {
  render(
    <TarjetaAhumada
      estado={{ tipo: "resultados", resultados, observadoEn: null, desactualizado }}
    />,
  );
}

describe("presentación de la tarjeta de Farmacias Ahumada", () => {
  it("muestra imagen, nombre, laboratorio, presentación, precios y enlace oficial", () => {
    renderResultados([producto()]);

    expect(screen.getByAltText("Paracetamol 500 mg x 16 comprimidos")).toHaveAttribute(
      "src",
      "https://www.farmaciasahumada.cl/medias/paracetamol-84574.jpg",
    );
    expect(screen.getByText("Paracetamol 500 mg x 16 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("Laboratorio Chile")).toBeInTheDocument();
    expect(screen.getByText("16 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("$618")).toBeInTheDocument();
    expect(screen.getByText("$1.309")).toBeInTheDocument();
    expect(screen.getByText("$82 por comprimido")).toBeInTheDocument();
    expect(screen.getByText("Ahumada Contigo")).toBeInTheDocument();

    const enlace = screen.getByRole("link", {
      name: "Ver publicación de Paracetamol 500 mg x 16 comprimidos",
    });
    expect(enlace).toHaveAttribute("href", base.source_url);
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("no inventa imagen, laboratorio, presentación, oferta ni condición ausentes", () => {
    renderResultados([
      producto({
        image_url: null,
        laboratory_as_published: null,
        presentation_as_published: null,
        conditions: null,
        price: {
          normal: { amount: "1309", currency: "CLP" },
          promotional: null,
          fractional: null,
        },
      }),
    ]);

    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
    expect(screen.getByText("Laboratorio no informado")).toBeInTheDocument();
    expect(screen.getByText("Presentación no informada")).toBeInTheDocument();
    expect(screen.getByText("$1.309")).toBeInTheDocument();
    expect(screen.queryByText("Oferta")).not.toBeInTheDocument();
    expect(screen.queryByText("Ahumada Contigo")).not.toBeInTheDocument();
    expect(screen.queryByText(/por comprimido/)).not.toBeInTheDocument();
  });

  it("mantiene todas las publicaciones dentro de una región desplazable", () => {
    renderResultados([
      producto(),
      producto({
        chain_item_id: "84575",
        published_name: "Losartán 50 mg x 30 comprimidos",
        source_url: "https://www.farmaciasahumada.cl/losartan-50-mg-84575.html",
        image_url: null,
      }),
    ]);

    expect(
      screen.getByRole("region", { name: "Publicaciones de Farmacias Ahumada (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Paracetamol 500 mg x 16 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("Losartán 50 mg x 30 comprimidos")).toBeInTheDocument();
  });

  it("muestra la falta de conexión sin precios ni productos inventados", () => {
    render(
      <TarjetaAhumada
        estado={{
          tipo: "no_configurada",
          mensaje: "La conexión con Farmacias Ahumada aún no tiene autorización de uso.",
        }}
      />,
    );

    expect(screen.getByText(/aún no tiene autorización/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("informa un error de fuente sin convertirlo en «sin resultados»", () => {
    render(
      <TarjetaAhumada estado={{ tipo: "error", mensaje: "Farmacias Ahumada no respondió." }} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Farmacias Ahumada no respondió.");
    expect(screen.queryByText("Sin resultados")).not.toBeInTheDocument();
  });
});
