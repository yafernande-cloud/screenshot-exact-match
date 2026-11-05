import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api";
import {
  MENSAJE_BUSQUEDA_INTERRUMPIDA,
  buscarCadenasAhumada,
  buscarCadenasCruzVerde,
  buscarCadenasSalcobrand,
  mensajeDeErrorCadena,
  type ChainResult,
  type ChainSource,
} from "@/lib/cadenas";
import { mensajeDeError } from "@/lib/catalogo";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

type Cadena = "ahumada" | "salcobrand" | "cruz_verde";
type Buscar = (query: string) => Promise<ChainSource>;

const CADENAS: Array<{ nombre: string; cadena: Cadena; buscar: Buscar }> = [
  { nombre: "Farmacias Ahumada", cadena: "ahumada", buscar: buscarCadenasAhumada },
  { nombre: "Farmacias Salcobrand", cadena: "salcobrand", buscar: buscarCadenasSalcobrand },
  { nombre: "Cruz Verde", cadena: "cruz_verde", buscar: buscarCadenasCruzVerde },
];

function aceptada(searchId: string) {
  return { search_id: searchId, status: "pending", expires_at: "2026-11-05T16:00:00+00:00" };
}

function producto(cadena: Cadena): ChainResult {
  return {
    chain_item_id: `${cadena}-1`,
    published_name: "Ibuprofeno 400 mg 20 comprimidos",
    brand_as_published: "Marca publicada",
    laboratory_as_published: null,
    presentation_as_published: "20 comprimidos",
    description: null,
    image_url: null,
    price: {
      normal: { amount: "4990", currency: "CLP" },
      promotional: null,
      fractional: null,
    },
    conditions: null,
    has_stock: null,
    source_url: null,
    observed_at: "2026-11-05T15:00:00+00:00",
    provenance: { data_origin: "published" },
    match: { level: "not_evaluated" },
  };
}

function fuente(cadena: Cadena, overrides: Partial<ChainSource> = {}): ChainSource {
  return {
    chain: cadena,
    state: "ok",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-05T15:00:00+00:00",
    results: [producto(cadena)],
    ...overrides,
  };
}

function respuesta(searchId: string, cadena: Cadena, overrides: Partial<ChainSource> = {}) {
  return {
    search_id: searchId,
    status: "completed",
    query: "ibuprofeno",
    purpose: "search",
    created_at: "2026-11-05T15:00:00+00:00",
    expires_at: "2026-11-05T16:00:00+00:00",
    sources: [fuente(cadena, overrides)],
  };
}

/** Error con la forma real de `ApiError` para un almacén en memoria que perdió el identificador. */
function busquedaPerdida() {
  return Object.assign(new Error("La búsqueda no existe, expiró o se perdió."), {
    status: 404,
    code: "SEARCH_NOT_FOUND",
  });
}

function posts() {
  return apiRequestMock.mock.calls.filter(([path]) => path === "/api/v1/chain-searches");
}

function gets() {
  return apiRequestMock.mock.calls.filter(([path]) => path !== "/api/v1/chain-searches");
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe.each(CADENAS)("recuperación E15 de $nombre", ({ cadena, buscar }) => {
  it("funcionamiento normal: un POST y un GET devuelven la fuente", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockResolvedValueOnce(respuesta("id-1", cadena));

    const source = await buscar("ibuprofeno");

    expect(source.chain).toBe(cadena);
    expect(posts()).toHaveLength(1);
    expect(gets()).toHaveLength(1);
    expect(gets()[0]?.[0]).toBe("/api/v1/chain-searches/id-1");
    expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({
      query: "ibuprofeno",
      chains: [cadena],
      purpose: "search",
    });
  });

  it("tolera un SEARCH_NOT_FOUND transitorio reintentando el mismo GET", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockRejectedValueOnce(busquedaPerdida())
      .mockResolvedValueOnce(respuesta("id-1", cadena));

    const source = await buscar("ibuprofeno");

    expect(source.chain).toBe(cadena);
    expect(posts()).toHaveLength(1);
    expect(gets().map(([path]) => path)).toEqual([
      "/api/v1/chain-searches/id-1",
      "/api/v1/chain-searches/id-1",
    ]);
  });

  it("reinicia una sola vez la búsqueda cuando el identificador sigue ausente", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockRejectedValueOnce(busquedaPerdida())
      .mockRejectedValueOnce(busquedaPerdida())
      .mockResolvedValueOnce(aceptada("id-2"))
      .mockResolvedValueOnce(respuesta("id-2", cadena));

    const source = await buscar("ibuprofeno");

    expect(source.chain).toBe(cadena);
    expect(posts()).toHaveLength(2);
    expect(JSON.parse(String(posts()[1]?.[1]?.body))).toEqual({
      query: "ibuprofeno",
      chains: [cadena],
      purpose: "search",
    });
    expect(gets().map(([path]) => path)).toEqual([
      "/api/v1/chain-searches/id-1",
      "/api/v1/chain-searches/id-1",
      "/api/v1/chain-searches/id-2",
    ]);
  });

  it("un segundo SEARCH_NOT_FOUND termina con el mensaje específico y sin bucles", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockRejectedValueOnce(busquedaPerdida())
      .mockRejectedValueOnce(busquedaPerdida())
      .mockResolvedValueOnce(aceptada("id-2"))
      .mockRejectedValueOnce(busquedaPerdida());

    const error = await buscar("ibuprofeno").catch((fallo: unknown) => fallo);

    expect(error).toMatchObject({ status: 404, code: "SEARCH_NOT_FOUND" });
    expect(mensajeDeErrorCadena(error)).toBe(MENSAJE_BUSQUEDA_INTERRUMPIDA);
    expect(posts()).toHaveLength(2);
    expect(gets().map(([path]) => path)).toEqual([
      "/api/v1/chain-searches/id-1",
      "/api/v1/chain-searches/id-1",
      "/api/v1/chain-searches/id-2",
    ]);
  });

  it("no reintenta errores que no son SEARCH_NOT_FOUND", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockRejectedValueOnce(Object.assign(new Error("Fallo de red"), { status: 503, code: "X" }));

    await expect(buscar("ibuprofeno")).rejects.toThrow("Fallo de red");
    expect(posts()).toHaveLength(1);
    expect(gets()).toHaveLength(1);
  });

  it("conserva no_matches y failed sin convertirlos en errores de recuperación", async () => {
    apiRequestMock
      .mockResolvedValueOnce(aceptada("id-1"))
      .mockResolvedValueOnce(respuesta("id-1", cadena, { outcome: "no_matches", results: [] }));
    const vacia = await buscar("ibuprofeno");
    expect(vacia.outcome).toBe("no_matches");
    expect(vacia.results).toEqual([]);
    expect(posts()).toHaveLength(1);

    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValueOnce(aceptada("id-2")).mockResolvedValueOnce(
      respuesta("id-2", cadena, {
        state: "failed",
        reason: "fetch_failed",
        outcome: null,
        results: [],
      }),
    );
    const fallida = await buscar("ibuprofeno");
    expect(fallida.state).toBe("failed");
    expect(posts()).toHaveLength(1);
  });
});

describe("mensajes de error de cadena", () => {
  it("el 404 general del catálogo conserva su mensaje", () => {
    const error = { status: 404, code: "SEARCH_NOT_FOUND", message: "La búsqueda no existe." };
    expect(mensajeDeError(error)).toBe("No encontramos ese artículo en el catálogo.");
  });

  it("un SEARCH_NOT_FOUND persistente usa el mensaje específico de cadena", () => {
    expect(mensajeDeErrorCadena(busquedaPerdida())).toBe(MENSAJE_BUSQUEDA_INTERRUMPIDA);
  });

  it("los demás errores se delegan al traductor general", () => {
    expect(
      mensajeDeErrorCadena({ status: 500, code: "UNEXPECTED", message: "Fallo temporal" }),
    ).toBe("Fallo temporal");
  });
});
