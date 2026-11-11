import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  advertenciasVisibles,
  agruparOfertas,
  agruparResultados,
  buscarProveedorEnVivo,
  descubrirProveedoresEnVivo,
  etiquetaBloqueador,
  etiquetaRelacion,
  mensajeDeErrorProveedor,
  mensajeMotivo,
  type OfertaEnVivo,
  type ProductoPublicadoEnVivo,
} from "@/lib/proveedores-en-vivo";

/**
 * Cliente de proveedores en vivo con `apiRequest` doblado: ninguna prueba sale a la red ni usa
 * datos de demostración. Los fixtures describen respuestas del contrato del backend.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

function fuenteApi(over: Record<string, unknown> = {}) {
  return {
    source_id: "src-1",
    name: "Farmaloop API",
    kind: "supplier",
    supplier_id: "sup-1",
    mode: "api",
    enabled: true,
    ...over,
  };
}

function perfil(over: Record<string, unknown> = {}) {
  return {
    source_id: "src-1",
    supplier_id: "sup-1",
    source_name: "Farmaloop API",
    supplier_name: "Farmaloop",
    configured: true,
    state: "connected",
    reason: null,
    enabled: true,
    mechanism: "algolia",
    last_success_at: "2026-11-10T01:20:56Z",
    ...over,
  };
}

function oferta(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "PRE-001",
    name: "Predual 30 mg comprimidos",
    laboratory: "Laboratorio Ficticio",
    presentation: "Caja 30 comprimidos",
    price: { amount: "12990", currency: "CLP" },
    price_basis: null,
    sale_unit: null,
    stock_status: "unknown",
    stock_quantity: null,
    stock_unit: null,
    image_url: "https://img.test/predual.jpg",
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: ["sale_unit_unconfirmed", "price_basis_unconfirmed"],
    ...over,
  };
}

function publicado(over: Partial<ProductoPublicadoEnVivo> = {}): ProductoPublicadoEnVivo {
  return {
    external_id: "140640",
    name: "Predual Pamabron 25 mg 12 Comprimidos",
    laboratory: "Laboratorio Maver",
    presentation: "Comprimido",
    stock_status: "out_of_stock",
    reference_price: { amount: "2290", currency: "CLP" },
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: ["not_available_for_sale", "no_current_price"],
    ...over,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("descubrimiento de proveedores en vivo", () => {
  it("lee fuentes y perfiles sin ids de proveedor escritos en el frontend", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/v1/sources?kind=supplier&enabled=true") {
        return Promise.resolve({ sources: [fuenteApi()] });
      }
      if (path === "/api/v1/sources/src-1/connector-profile") {
        return Promise.resolve({ profile: perfil() });
      }
      return Promise.reject(new Error(`ruta inesperada: ${path}`));
    });

    const fuentes = await descubrirProveedoresEnVivo();

    expect(fuentes).toHaveLength(1);
    expect(fuentes[0]).toMatchObject({
      sourceId: "src-1",
      sourceName: "Farmaloop API",
      supplierName: "Farmaloop",
      state: "connected",
      consultable: true,
      lastSuccessAt: "2026-11-10T01:20:56Z",
      error: null,
    });
  });

  it("una fuente sin perfil queda visible, no consultable y con su motivo real", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/sources?")) {
        return Promise.resolve({
          sources: [fuenteApi({ source_id: "src-2", name: "Lista manual" })],
        });
      }
      return Promise.resolve({
        profile: perfil({
          source_id: "src-2",
          source_name: "Lista manual",
          configured: false,
          state: "not_configured",
          reason: "profile_missing",
          mechanism: null,
          last_success_at: null,
          enabled: false,
        }),
      });
    });

    const [fuente] = await descubrirProveedoresEnVivo();
    if (!fuente) throw new Error("se esperaba una fuente");

    expect(fuente.consultable).toBe(false);
    expect(fuente.state).toBe("not_configured");
    expect(fuente.reason).toBe("profile_missing");
    expect(mensajeMotivo(fuente.reason, fuente.state)).toMatch(/Falta configurar/);
  });

  it("no consulta una fuente con mecanismo que no busca en vivo", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/sources?")) return Promise.resolve({ sources: [fuenteApi()] });
      return Promise.resolve({
        profile: perfil({ mechanism: "manual_capture", state: "not_configured" }),
      });
    });

    const [fuente] = await descubrirProveedoresEnVivo();
    if (!fuente) throw new Error("se esperaba una fuente");

    expect(fuente.consultable).toBe(false);
  });

  it("una lista cargada no aparece en proveedores en vivo ni pide un perfil", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/sources?")) {
        return Promise.resolve({
          sources: [
            fuenteApi(),
            fuenteApi({
              source_id: "src-lista",
              name: "Distribuidora Andes",
              supplier_id: "sup-andes",
              mode: "manual_import",
            }),
          ],
        });
      }
      return Promise.resolve({ profile: perfil() });
    });

    const fuentes = await descubrirProveedoresEnVivo();

    expect(fuentes).toHaveLength(1);
    expect(fuentes[0]?.sourceId).toBe("src-1");
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      "/api/v1/sources/src-lista/connector-profile",
      expect.anything(),
      expect.anything(),
    );
  });

  it("un perfil ilegible no oculta las demás fuentes", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/sources?")) {
        return Promise.resolve({
          sources: [
            fuenteApi(),
            fuenteApi({ source_id: "src-2", name: "Otro proveedor", supplier_id: "sup-2" }),
          ],
        });
      }
      if (path === "/api/v1/sources/src-1/connector-profile") {
        return Promise.resolve({ profile: perfil() });
      }
      return Promise.reject({ status: 500, code: "UNEXPECTED", message: "falló el perfil" });
    });

    const fuentes = await descubrirProveedoresEnVivo();

    expect(fuentes).toHaveLength(2);
    expect(fuentes[0]).toMatchObject({ state: "connected" });
    expect(fuentes[1]).toMatchObject({
      sourceId: "src-2",
      state: "error",
      consultable: false,
      error: "falló el perfil",
    });
  });
});

describe("búsqueda en vivo", () => {
  it("envía la fuente y la consulta sin alterar el texto", async () => {
    apiRequestMock.mockResolvedValue({
      search_id: "busq-1",
      source_id: "src-1",
      source_name: "Farmaloop API",
      query: "Predual",
      state: "connected",
      reason: null,
      outcome: "matches",
      observed_at: "2026-11-10T01:20:56Z",
      created_at: "2026-11-10T01:20:56Z",
      expires_at: "2026-11-10T01:30:56Z",
      cached: false,
      profile_version: 1,
      discarded: 5,
      warnings: [],
      published: [],
      offers: [oferta()],
    });

    const resultado = await buscarProveedorEnVivo("src-1", "Predual");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/v1/supplier-searches",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: "src-1", query: "Predual", limit: 20 }),
      }),
      "No pudimos consultar al proveedor.",
    );
    expect(resultado.offers[0]).toMatchObject({ match_relation: "direct" });
  });
});

describe("clasificación y bloqueos", () => {
  it("separa coincidencias directas de resultados que no confirman la consulta", () => {
    const { directas, relacionadas } = agruparOfertas([
      oferta({ external_id: "A", match_relation: "direct" }),
      oferta({ external_id: "B", match_relation: "related" }),
      oferta({ external_id: "C", match_relation: "unverified" }),
    ]);

    expect(directas.map((o) => o.external_id)).toEqual(["A"]);
    expect(relacionadas.map((o) => o.external_id)).toEqual(["B", "C"]);
  });

  it("agrupa ofertas y publicaciones conservando su tipo y su relación", () => {
    const { directas, relacionadas } = agruparResultados({
      offers: [
        oferta({ external_id: "A" }),
        oferta({ external_id: "B", match_relation: "related" }),
      ],
      published: [
        publicado({ external_id: "C" }),
        publicado({ external_id: "D", match_relation: "related" }),
      ],
    });

    expect(directas.map((item) => (item.tipo === "oferta" ? item.oferta : item.producto))).toEqual([
      expect.objectContaining({ external_id: "A" }),
      expect.objectContaining({ external_id: "C" }),
    ]);
    expect(directas.map((item) => item.tipo)).toEqual(["oferta", "publicado"]);
    expect(
      relacionadas.map((item) => (item.tipo === "oferta" ? item.oferta : item.producto)),
    ).toEqual([
      expect.objectContaining({ external_id: "B" }),
      expect.objectContaining({ external_id: "D" }),
    ]);
  });

  it("oculta la advertencia técnica de descartes y conserva las funcionales", () => {
    expect(
      advertenciasVisibles([
        "5 ítem(s) descartados por datos incompletos o inválidos.",
        "El proveedor informó precios sin IVA.",
      ]),
    ).toEqual(["El proveedor informó precios sin IVA."]);
  });

  it("traduce bloqueadores y relaciones sin presentar un resultado como coincidencia", () => {
    expect(etiquetaBloqueador("match_not_direct")).toMatch(/no confirma/);
    expect(etiquetaBloqueador("not_available_for_sale")).toMatch(/no está disponible/);
    expect(etiquetaBloqueador("no_current_price")).toMatch(/precio comercial vigente/);
    expect(etiquetaBloqueador("sale_unit_unconfirmed")).toMatch(/unidad de venta/);
    expect(etiquetaBloqueador("price_basis_unconfirmed")).toMatch(/base del precio/);
    expect(etiquetaBloqueador("otro_motivo")).toBe("otro_motivo");

    expect(etiquetaRelacion("direct")).toBe("Coincidencia directa");
    expect(etiquetaRelacion("related")).toBe("Relacionado");
    expect(etiquetaRelacion("unverified")).toBe("Sin verificar");
  });

  it("traduce los motivos cerrados del conector", () => {
    expect(mensajeMotivo("secret_missing:FARMALOOP_ALGOLIA_API_KEY", "not_configured")).toMatch(
      /secreto/,
    );
    expect(mensajeMotivo("schema_changed", "requires_intervention")).toMatch(/estructura/);
    expect(mensajeMotivo("credentials_rejected", "requires_intervention")).toMatch(/credenciales/);
    expect(mensajeMotivo(null, "not_configured")).toMatch(/no está configurada/);
  });

  it("explica errores de la API sin exponer detalles técnicos", () => {
    expect(mensajeDeErrorProveedor({ status: 429 })).toMatch(/Espera un minuto/);
    expect(mensajeDeErrorProveedor({ status: 503, code: "CONNECTOR_ENGINE_DISABLED" })).toMatch(
      /deshabilitado/,
    );
    expect(mensajeDeErrorProveedor({ status: 403 })).toMatch(/permiso/);
    expect(mensajeDeErrorProveedor(new Error("boom"))).toMatch(/No pudimos consultar/);
  });
});
