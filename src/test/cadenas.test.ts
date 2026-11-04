import { describe, expect, it } from "vitest";
import { estadoFuenteAhumada, type ChainResult, type ChainSource } from "@/lib/cadenas";

const producto: ChainResult = {
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

function fuente(overrides: Partial<ChainSource> = {}): ChainSource {
  return {
    chain: "ahumada",
    state: "ok",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-04T15:30:00+00:00",
    results: [producto],
    ...overrides,
  };
}

describe("estado de la tarjeta de Farmacias Ahumada", () => {
  it("parte sin conexión y no inventa resultados", () => {
    expect(estadoFuenteAhumada("inicial", null, null)).toEqual({ tipo: "inicial" });
  });

  it("muestra carga mientras se consulta", () => {
    expect(estadoFuenteAhumada("cargando", null, null)).toEqual({ tipo: "cargando" });
  });

  it("una cadena sin autorización se informa como no configurada, no como vacía", () => {
    const estado = estadoFuenteAhumada(
      "listo",
      fuente({ state: "not_configured", reason: "access_not_authorized", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("no_configurada");
    if (estado.tipo === "no_configurada") {
      expect(estado.mensaje).toMatch(/autorización/i);
    }
  });

  it("una fuente caída es error, nunca «sin resultados»", () => {
    const estado = estadoFuenteAhumada(
      "listo",
      fuente({ state: "failed", reason: "fetch_failed", outcome: null, results: [] }),
      null,
    );
    expect(estado.tipo).toBe("error");
  });

  it("sin coincidencias reales se informa vacío", () => {
    const estado = estadoFuenteAhumada(
      "listo",
      fuente({ outcome: "no_matches", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("vacia");
  });

  it("con resultados entrega las fichas y su precio promocional", () => {
    const estado = estadoFuenteAhumada("listo", fuente(), null);
    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") {
      expect(estado.resultados[0]?.price.promotional?.amount).toBe("618");
      expect(estado.resultados[0]?.price.fractional?.per_unit).toBe("comprimido");
      expect(estado.desactualizado).toBe(false);
    }
  });

  it("marca los datos desactualizados sin ocultarlos", () => {
    const estado = estadoFuenteAhumada("listo", fuente({ state: "stale" }), null);
    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") expect(estado.desactualizado).toBe(true);
  });

  it("un fallo de red se muestra como error con su mensaje", () => {
    const estado = estadoFuenteAhumada("error", null, "No pudimos contactar el servidor.");
    expect(estado).toEqual({ tipo: "error", mensaje: "No pudimos contactar el servidor." });
  });
});
