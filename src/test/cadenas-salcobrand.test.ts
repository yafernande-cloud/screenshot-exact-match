import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api";
import {
  buscarCadenasSalcobrand,
  estadoFuenteSalcobrand,
  type ChainResult,
  type ChainSource,
} from "@/lib/cadenas";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

function producto(overrides: Partial<ChainResult> = {}): ChainResult {
  return {
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
    ...overrides,
  };
}

function fuente(overrides: Partial<ChainSource> = {}): ChainSource {
  return {
    chain: "salcobrand",
    state: "ok",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-04T15:30:00+00:00",
    results: [producto()],
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("solicitud E15 de Salcobrand", () => {
  it("incluye salcobrand en las cadenas solicitadas y devuelve solo su fuente", async () => {
    apiRequestMock
      .mockResolvedValueOnce({ search_id: "s1", status: "pending", expires_at: "x" })
      .mockResolvedValueOnce({
        search_id: "s1",
        status: "completed",
        query: "paracetamol",
        purpose: "search",
        created_at: "x",
        expires_at: "x",
        sources: [fuente()],
      });

    const source = await buscarCadenasSalcobrand("paracetamol");

    expect(source.chain).toBe("salcobrand");
    const [path, init] = apiRequestMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/chain-searches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "paracetamol",
      chains: ["salcobrand"],
      purpose: "search",
    });
  });
});

describe("estado de la tarjeta de Salcobrand", () => {
  it("parte sin conexión y no inventa resultados", () => {
    expect(estadoFuenteSalcobrand("inicial", null, null)).toEqual({ tipo: "inicial" });
  });

  it("una cadena sin autorización se informa como no configurada, no como vacía", () => {
    const estado = estadoFuenteSalcobrand(
      "listo",
      fuente({ state: "not_configured", reason: "access_not_authorized", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("no_configurada");
    if (estado.tipo === "no_configurada") {
      expect(estado.mensaje).toMatch(/Salcobrand/);
      expect(estado.mensaje).toMatch(/autorización/);
    }
  });

  it("una fuente caída es error, nunca «sin resultados»", () => {
    const estado = estadoFuenteSalcobrand(
      "listo",
      fuente({ state: "failed", reason: "fetch_failed", outcome: null, results: [] }),
      null,
    );
    expect(estado.tipo).toBe("error");
  });

  it("sin coincidencias reales se informa vacío", () => {
    const estado = estadoFuenteSalcobrand(
      "listo",
      fuente({ outcome: "no_matches", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("vacia");
  });

  it("entrega como máximo 24 publicaciones aunque el backend devuelva más", () => {
    const resultados = Array.from({ length: 30 }, (_, i) =>
      producto({ chain_item_id: String(i), source_url: `https://salcobrand.cl/products/${i}` }),
    );
    const estado = estadoFuenteSalcobrand("listo", fuente({ results: resultados }), null);

    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") expect(estado.resultados).toHaveLength(24);
  });

  it("conserva marca y disponibilidad publicadas sin convertirlas en laboratorio", () => {
    const estado = estadoFuenteSalcobrand("listo", fuente(), null);
    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") {
      expect(estado.resultados[0]?.brand_as_published).toBe("Genérico");
      expect(estado.resultados[0]?.laboratory_as_published).toBeNull();
      expect(estado.resultados[0]?.has_stock).toBe(true);
    }
  });
});
