import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL, ApiError } from "@/lib/api";

/** Sesión única de Supabase simulada: el cliente real no debe abrirse en las pruebas. */
const supabase = vi.hoisted(() => ({
  token: "token-vigente",
  refreshToken: null as string | null,
  refresh: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: supabase.token } },
        error: null,
      }),
      refreshSession: async () => {
        supabase.refresh();
        return supabase.refreshToken
          ? { data: { session: { access_token: supabase.refreshToken } }, error: null }
          : { data: { session: null }, error: new Error("sin refresco") };
      },
      signOut: async () => {
        supabase.signOut();
        return { error: null };
      },
    },
  }),
}));

import {
  buscarCatalogo,
  describirCantidad,
  describirDescuentos,
  describirIva,
  faltantesDeOferta,
  formatearDinero,
  mensajeDeError,
  obtenerArticulo,
  resumenPresentacion,
  type Offer,
} from "@/lib/catalogo";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const busqueda = {
  search_id: "s-1",
  status: "completed",
  query: { original_text: "losartán 50 mg", filters: {}, interpretation: {} },
  generated_at: "2026-11-03T12:00:00Z",
  results: [],
  sources: [],
  errors: [],
  next_cursor: null,
};

function oferta(overrides: Partial<Offer> = {}): Offer {
  return {
    offer_id: "o-1",
    article_id: "a-1",
    supplier: { supplier_id: "sup-1", name: "Proveedor Ficticio Norte", status: "active" },
    external_id: "FN-010",
    external_id_kind: "supplier_sku",
    price: {
      money: { amount: "3490.00", currency: "CLP" },
      basis: "per_commercial_unit",
      tax_included: null,
      discount_included: null,
    },
    price_per_base_unit: null,
    sale_unit: { code: "box", original_text: "caja" },
    pack: null,
    minimum: { known: true, quantity: "1", unit: "box" },
    multiple: { known: true, quantity: "1", unit: "box" },
    stock: { status: "known", quantity: "100", unit: "box" },
    taxes: [],
    discounts: [],
    shipping_terms_id: null,
    validity: { valid_from: null, valid_to: null, is_current: true },
    notes: null,
    provenance: {
      source: { source_id: "src-1", name: "Norte", mode: "fixture" },
      data_origin: "simulated",
      observed_at: "2026-11-03T12:00:00Z",
      evidence: null,
    },
    freshness: {
      observed_at: "2026-11-03T12:00:00Z",
      fresh_until: "2026-11-04T12:00:00Z",
      is_stale: false,
      stale_fields: [],
    },
    ...overrides,
  };
}

describe("cliente de catálogo", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supabase.token = "token-vigente";
    supabase.refreshToken = null;
    supabase.refresh.mockClear();
    supabase.signOut.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía la búsqueda al endpoint real con el token de Supabase", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(busqueda));

    await buscarCatalogo("losartán 50 mg");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/v1/searches`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer token-vigente",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({ query: "losartán 50 mg", limit: 20 });
  });

  it("pide el detalle del artículo con su UUID", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        article: { article_id: "a-1", display_name: "Losartán 50 mg x 30 comprimidos" },
        offers: [],
        offers_total: 0,
        next_cursor: null,
        reference_prices: [],
        annotations: [],
        notes: [],
        sources: [],
        generated_at: "2026-11-03T12:00:00Z",
      }),
    );

    await obtenerArticulo("a-1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${API_URL}/api/v1/articles/a-1`);
  });

  it("renueva el token una vez y reintenta cuando el backend responde 401", async () => {
    supabase.refreshToken = "token-renovado";
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Token vencido." } }, 401),
      )
      .mockResolvedValueOnce(jsonResponse(busqueda));

    await buscarCatalogo("losartán");

    expect(supabase.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, segunda] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(segunda.headers).toMatchObject({ Authorization: "Bearer token-renovado" });
  });

  it("cierra la sesión si el token renovado tampoco es aceptado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Token vencido." } }, 401),
    );

    await expect(buscarCatalogo("losartán")).rejects.toMatchObject({
      status: 401,
      message: "Tu sesión expiró. Inicia sesión otra vez.",
    });
    expect(supabase.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("presentación de datos del backend", () => {
  it("formatea dinero con la moneda que informa el servidor", () => {
    const texto = formatearDinero({ amount: "3490.00", currency: "CLP" });
    expect(texto).toContain("3.490");
  });

  it("arma la presentación con la medida envuelta del detalle E3", () => {
    expect(
      resumenPresentacion({
        commercial_unit: null,
        content: { measure: { value: "30", unit: "un", original_text: "30 comprimidos" } },
      }),
    ).toBe("30 comprimidos");
  });

  it("arma la presentación con la medida directa de la búsqueda E1", () => {
    expect(
      resumenPresentacion({
        commercial_unit: { code: "box", original_text: "caja" },
        content: { value: "30", unit: "un", original_text: "30 comprimidos" },
      }),
    ).toBe("caja · 30 comprimidos");
  });

  it("describe cantidades con la unidad del backend", () => {
    expect(describirCantidad("1", "box")).toBe("1 caja");
    expect(describirCantidad("6", "box")).toBe("6 cajas");
    expect(describirCantidad(null, "box")).toBeNull();
  });

  it("no inventa IVA cuando el backend no lo declara", () => {
    expect(describirIva(oferta())).toBeNull();
    expect(
      describirIva(
        oferta({
          taxes: [{ kind: "iva", rate_percent: "19", included_in_price: false }],
        }),
      ),
    ).toBe("Precio sin IVA");
    expect(describirIva(oferta({ price: { ...oferta().price, tax_included: true } }))).toBe(
      "Precio con IVA incluido",
    );
  });

  it("presenta descuentos sin aplicarlos", () => {
    expect(describirDescuentos(oferta())).toBe("Sin descuentos informados");
    expect(
      describirDescuentos(
        oferta({
          discounts: [
            { kind: "percent", value: "5", applicability: "min_quantity", min_quantity: "50" },
          ],
        }),
      ),
    ).toBe("5% desde 50");
  });

  it("enumera los campos que faltan para un costo completo", () => {
    const faltantes = faltantesDeOferta(oferta());
    expect(faltantes).toContain("Si el precio incluye IVA");
    expect(faltantes).toContain("Costo de despacho");
    expect(faltantes).toContain("Condiciones de pago");
    expect(faltantes).not.toContain("Disponibilidad (stock)");
  });

  it("traduce los estados de error a mensajes para la persona", () => {
    expect(mensajeDeError(new ApiError(401, "UNAUTHENTICATED", "x"))).toContain("sesión expiró");
    expect(mensajeDeError(new ApiError(403, "FORBIDDEN", "x"))).toContain("no tiene permiso");
    expect(mensajeDeError(new Error("fallo técnico"))).not.toContain("fallo técnico");
  });
});
