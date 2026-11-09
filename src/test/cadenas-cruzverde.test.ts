import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api";
import {
  buscarCadenasCruzVerde,
  estadoFuenteCruzVerde,
  type ChainResult,
  type ChainSource,
} from "@/lib/cadenas";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

function producto(overrides: Partial<ChainResult> = {}): ChainResult {
  return {
    chain_item_id: "263909",
    published_name: "Pyriped Ibuprofeno 400 mg 20 Cápsulas Blandas",
    brand_as_published: "MILAB",
    laboratory_as_published: null,
    presentation_as_published: "20 Cápsulas Blandas",
    description: null,
    image_url: "https://beta.cruzverde.cl/imagen/263909.jpg",
    price: {
      normal: { amount: "6340", currency: "CLP" },
      promotional: { amount: "4890", currency: "CLP" },
      fractional: { amount: "245", currency: "CLP", per_unit: "Capsula" },
    },
    conditions: null,
    has_stock: null,
    source_url: "https://www.cruzverde.cl/product/263909.html",
    observed_at: "2026-11-05T03:30:00+00:00",
    provenance: { source: "cruz_verde", data_origin: "published" },
    match: { level: "not_evaluated" },
    ...overrides,
  };
}

function fuente(overrides: Partial<ChainSource> = {}): ChainSource {
  return {
    chain: "cruz_verde",
    state: "ok",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-05T03:30:00+00:00",
    results: [producto()],
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("solicitud E15 de Cruz Verde", () => {
  it("pide solo cruz_verde y devuelve su propia fuente", async () => {
    apiRequestMock
      .mockResolvedValueOnce({ search_id: "cv1", status: "pending", expires_at: "x" })
      .mockResolvedValueOnce({
        search_id: "cv1",
        status: "completed",
        query: "ibuprofeno",
        purpose: "search",
        created_at: "x",
        expires_at: "x",
        sources: [fuente()],
      });

    const source = await buscarCadenasCruzVerde("ibuprofeno");

    expect(source.chain).toBe("cruz_verde");
    const [path, init] = apiRequestMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/chain-searches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "ibuprofeno",
      chains: ["cruz_verde"],
      purpose: "search",
    });
  });
});

describe("estado de la tarjeta de Cruz Verde", () => {
  it("una cadena apagada se informa como no configurada, nunca como vacía", () => {
    const estado = estadoFuenteCruzVerde(
      "listo",
      fuente({ state: "not_configured", reason: "access_not_authorized", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("no_configurada");
    if (estado.tipo === "no_configurada") {
      expect(estado.mensaje).toMatch(/Cruz Verde/);
      expect(estado.mensaje).toMatch(/autorización/);
    }
  });

  it("una fuente caída es error y no se convierte en «sin resultados»", () => {
    const estado = estadoFuenteCruzVerde(
      "listo",
      fuente({ state: "failed", reason: "fetch_failed", outcome: null, results: [] }),
      null,
    );
    expect(estado.tipo).toBe("error");
  });

  it("un rechazo de consulta se informa distinto de una caída de conexión", () => {
    const estado = estadoFuenteCruzVerde(
      "listo",
      fuente({ state: "failed", reason: "query_rejected", outcome: null, results: [] }),
      null,
    );
    expect(estado.tipo).toBe("error");
    if (estado.tipo === "error") {
      expect(estado.mensaje).toMatch(/no aceptó esta búsqueda/i);
      expect(estado.mensaje).not.toMatch(/no respondió/i);
    }
  });

  it("ordena por relación con la consulta antes de recortar a 24", () => {
    const resultados = Array.from({ length: 30 }, (_, i) =>
      producto({
        chain_item_id: String(i),
        match: {
          level: "not_evaluated",
          query_relation: i === 29 ? "exact" : i === 0 ? "partial" : "alternative",
        },
      }),
    );

    const estado = estadoFuenteCruzVerde("listo", fuente({ results: resultados }), null);

    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") {
      expect(estado.resultados).toHaveLength(24);
      expect(estado.resultados[0]?.chain_item_id).toBe("29");
      expect(estado.resultados[1]?.chain_item_id).toBe("0");
      expect(estado.resultados[23]?.match["query_relation"]).toBe("alternative");
    }
  });

  it("conserva el orden publicado cuando no hay relación informada", () => {
    const resultados = ["a", "b", "c"].map((id) =>
      producto({ chain_item_id: id, match: { level: "not_evaluated" } }),
    );

    const estado = estadoFuenteCruzVerde("listo", fuente({ results: resultados }), null);

    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") {
      expect(estado.resultados.map((r) => r.chain_item_id)).toEqual(["a", "b", "c"]);
    }
  });

  it("sin coincidencias reales se informa vacío", () => {
    const estado = estadoFuenteCruzVerde(
      "listo",
      fuente({ outcome: "no_matches", results: [] }),
      null,
    );
    expect(estado.tipo).toBe("vacia");
  });

  it("entrega como máximo 24 publicaciones orgánicas", () => {
    const resultados = Array.from({ length: 30 }, (_, i) =>
      producto({
        chain_item_id: String(i),
        source_url: `https://www.cruzverde.cl/product/${i}.html`,
      }),
    );
    const estado = estadoFuenteCruzVerde("listo", fuente({ results: resultados }), null);

    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") expect(estado.resultados).toHaveLength(24);
  });

  it("conserva el enlace ausente como nulo, sin fabricar una URL", () => {
    const estado = estadoFuenteCruzVerde(
      "listo",
      fuente({ results: [producto({ source_url: null })] }),
      null,
    );
    expect(estado.tipo).toBe("resultados");
    if (estado.tipo === "resultados") expect(estado.resultados[0]?.source_url).toBeNull();
  });
});
