import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Sesión única de Supabase simulada: el cliente real no debe abrirse en las pruebas. */
const supabase = vi.hoisted(() => ({ token: "token-vigente" }));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: supabase.token } },
        error: null,
      }),
      refreshSession: async () => ({ data: { session: null }, error: new Error("sin refresco") }),
      signOut: async () => ({ error: null }),
    },
  }),
}));

import { ApiError } from "@/lib/api";
import {
  agregarLinea,
  carritosConLineas,
  finalizarCotizacion,
  lineasActivas,
  listarCotizaciones,
  mensajeDeErrorCotizacion,
  obtenerCotizacion,
  obtenerInforme,
  quitarLinea,
  resultadoDesconocido,
  subtotalDeCarrito,
  totalesDeCotizacion,
  ultimaCotizacionEnPreparacion,
  cantidadParaCotizar,
  yaFinalizada,
  cotizacionCerrada,
  type CarritoCotizacion,
  type DetalleCotizacion,
  type LineaCotizacion,
} from "@/lib/cotizacion-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function linea(overrides: Partial<LineaCotizacion> = {}): LineaCotizacion {
  return {
    line_id: "l-1",
    quote_id: "q-1",
    quote_cart_id: "c-1",
    supplier_id: "s-1",
    offer_snapshot_id: "o-1",
    trade_item_id: "t-1",
    product: {
      name: "Ibuprofeno 400 mg",
      laboratory: "ASCEND",
      brand: null,
      presentation: "Caja de 20 comprimidos",
      code: "IBU-400",
    },
    unit_price: {
      amount: "1700.00",
      currency: "CLP",
      basis: "per_commercial_unit",
      sale_unit: "box",
    },
    subtotal: { amount: "5100.00", currency: "CLP" },
    quantity: { value: "3", unit: "box" },
    status: "active",
    removed_at: null,
    removed_by: null,
    demand_item_id: null,
    coverage_relation: null,
    demand_allocations: [],
    price_state: "complete",
    causes: [],
    warnings: [],
    version: 1,
    added_at: "2026-11-11T10:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    ...overrides,
  };
}

function carrito(overrides: Partial<CarritoCotizacion> = {}): CarritoCotizacion {
  return {
    cart_id: "c-1",
    supplier_id: "s-1",
    supplier_name: "Proveedor Uno",
    status: "active",
    line_count: 1,
    version: 1,
    created_at: "2026-11-11T10:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    derived_state: "draft",
    lines: [linea()],
    ...overrides,
  };
}

function detalle(
  carts: CarritoCotizacion[],
  overrides: Partial<DetalleCotizacion> = {},
): DetalleCotizacion {
  return {
    quote_id: "q-1",
    title: null,
    status: "draft",
    version: 1,
    created_at: "2026-11-11T10:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    report_number: null,
    report_label: null,
    finalized_at: null,
    finalized_by: null,
    data_origin: "captured",
    derived_state: "draft",
    carts,
    coverage: [],
    estimated_total: {},
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente de la cotización persistente", () => {
  it("pide el carrito activo con la regla del servidor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ quotes: [], next_cursor: null }));

    await expect(ultimaCotizacionEnPreparacion()).resolves.toBeNull();

    const [url] = fetchMock.mock.calls[0] ?? [];
    const params = new URL(String(url)).searchParams;
    expect(String(url)).toContain("/api/v1/quotes?");
    // Un borrador anterior al último cierre no es carrito activo: esa decisión es del backend.
    expect(params.get("active")).toBe("true");
    expect(params.get("limit")).toBe("1");
    expect(params.get("finalized")).toBeNull();
    expect(params.get("status")).toBeNull();
  });

  it("pide el historial solo con cotizaciones finalizadas", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        quotes: [
          {
            quote_id: "q-9",
            title: null,
            status: "closed",
            version: 4,
            created_at: "2026-11-11T10:00:00Z",
            updated_at: "2026-11-11T11:00:00Z",
            report_number: 1,
            report_label: "COT-000001",
            finalized_at: "2026-11-11T11:00:00Z",
            finalized_by: "u-1",
            supplier_count: 2,
            line_count: 5,
          },
        ],
        next_cursor: null,
      }),
    );

    const filas = await listarCotizaciones({ finalized: true });

    expect(filas).toHaveLength(1);
    expect(filas[0]?.report_label).toBe("COT-000001");
    const params = new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams;
    expect(params.get("finalized")).toBe("true");
    expect(params.has("status")).toBe(false);
  });

  it("agrega una oferta con clave de idempotencia y solo los datos elegidos", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ line: linea(), cart: {}, deduplicated: false, warnings: [] }, 201),
    );

    await agregarLinea("q-1", {
      supplierId: "s-1",
      offerSnapshotId: "o-1",
      quantity: "3",
      unit: "box",
      demandItemId: "d-1",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/v1/quotes/q-1/lines");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toEqual({
      supplier_id: "s-1",
      offer_snapshot_id: "o-1",
      demand_item_id: "d-1",
      quantity: { value: "3", unit: "box" },
    });
  });

  it("agrega una oferta viva sin unidad de venta enviando la unidad nula", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ line: linea(), cart: {}, deduplicated: false, warnings: [] }, 201),
    );
    const oferta = {
      source_id: "src-1",
      external_id: "FL-2990",
      name: "Salónpas 10 parches",
      supplier_id: "s-1",
      laboratory: null,
      presentation: null,
      price: { amount: "2990", currency: "CLP" },
      price_basis: null,
      sale_unit: null,
      stock_status: "in_stock" as const,
      stock_quantity: "5",
      stock_unit: null,
      ean: null,
      product_url: null,
      image_url: null,
    };

    await agregarLinea("q-1", { supplierId: "s-1", offer: oferta, quantity: "1", unit: null });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      supplier_id: "s-1",
      quantity: { value: "1", unit: null },
      offer: oferta,
    });
  });

  it("finaliza con la clave recibida y devuelve el informe congelado", async () => {
    const informe = {
      schema_version: 1,
      quote_id: "q-1",
      title: null,
      number: 7,
      label: "COT-000007",
      finalized_at: "2026-11-11T12:00:00Z",
      finalized_by: "u-1",
      currency: "CLP",
      suppliers: [],
      items: [],
      total: { amount: "5100.00", currency: "CLP" },
      warnings: [],
      release: { released: [], pending: [] },
      note: null,
    };
    fetchMock.mockResolvedValue(
      jsonResponse({
        quote: {
          quote_id: "q-1",
          status: "closed",
          version: 2,
          report_number: 7,
          report_label: "COT-000007",
        },
        report: informe,
        released: [],
        pending: [],
        deduplicated: false,
      }),
    );

    const resultado = await finalizarCotizacion("q-1", { version: 1, clave: "clave-fija" });

    expect(resultado.report.label).toBe("COT-000007");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/v1/quotes/q-1/finalize");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("clave-fija");
    expect(JSON.parse(String(init?.body))).toEqual({ version: 1 });
  });

  it("recupera el informe guardado de una cotización finalizada", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        quote_id: "q-1",
        report_number: 7,
        report_label: "COT-000007",
        finalized_at: "2026-11-11T12:00:00Z",
        finalized_by: "u-1",
        report: { label: "COT-000007" },
      }),
    );

    const recuperado = await obtenerInforme("q-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/quotes/q-1/report");
    expect(recuperado.report_label).toBe("COT-000007");
  });

  it("quita una línea con DELETE sin inventar un cuerpo", async () => {
    fetchMock.mockResolvedValue(jsonResponse(linea({ status: "removed" })));

    await quitarLinea("q-1", "l-1");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/v1/quotes/q-1/lines/l-1");
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
  });

  it("obtener el detalle usa la ruta de la cotización", async () => {
    fetchMock.mockResolvedValue(jsonResponse(detalle([])));

    await obtenerCotizacion("q-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/quotes/q-1");
  });
});

describe("reglas de lectura del carrito", () => {
  it("solo presenta líneas y carritos con al menos una línea activa", () => {
    const conLinea = carrito();
    const vacio = carrito({
      cart_id: "c-2",
      supplier_id: "s-2",
      lines: [linea({ line_id: "l-2", status: "removed" })],
    });
    const doc = detalle([conLinea, vacio]);

    expect(lineasActivas(doc)).toHaveLength(1);
    expect(carritosConLineas(doc)).toEqual([conLinea]);
    expect(lineasActivas(null)).toEqual([]);
  });

  it("una cotización finalizada conserva sus líneas pero no se presenta como carrito", () => {
    const finalizada = detalle([carrito()], {
      status: "closed",
      finalized_at: "2026-11-11T14:38:00Z",
      report_number: 1,
      report_label: "COT-000001",
    });

    expect(lineasActivas(finalizada)).toEqual([]);
    expect(carritosConLineas(finalizada)).toEqual([]);
    expect(totalesDeCotizacion(finalizada)).toEqual({
      confirmado: 0,
      pendientes: 0,
      total: null,
      lineas: 0,
      proveedores: 0,
    });
  });

  it("suma subtotales completos y declara pendiente el total si falta uno", () => {
    const completo = detalle([carrito()]);
    expect(totalesDeCotizacion(completo)).toEqual({
      confirmado: 5100,
      pendientes: 0,
      total: 5100,
      lineas: 1,
      proveedores: 1,
    });

    const incompleto = detalle([
      carrito({
        lines: [linea(), linea({ line_id: "l-2", subtotal: null, causes: ["PRICE_PENDING"] })],
      }),
    ]);
    const totales = totalesDeCotizacion(incompleto);
    expect(totales.pendientes).toBe(1);
    expect(totales.confirmado).toBe(5100);
    // Nunca se presenta una suma incompleta como total general.
    expect(totales.total).toBeNull();

    expect(totalesDeCotizacion(null)).toEqual({
      confirmado: 0,
      pendientes: 0,
      total: null,
      lineas: 0,
      proveedores: 0,
    });
  });

  it("el subtotal de un carrito es nulo si alguna de sus líneas no lo tiene", () => {
    expect(subtotalDeCarrito(carrito())).toBe(5100);
    expect(
      subtotalDeCarrito(carrito({ lines: [linea(), linea({ line_id: "l-2", subtotal: null })] })),
    ).toBeNull();
    expect(subtotalDeCarrito(carrito({ lines: [] }))).toBeNull();
  });

  it("cotiza la cantidad definida del faltante o 1 por defecto, sin inventar unidades", () => {
    expect(cantidadParaCotizar({ target_quantity: "10" })).toBe("10");
    // Una cantidad fraccionaria no se redondea: se cotiza 1 y la cobertura queda parcial.
    expect(cantidadParaCotizar({ target_quantity: "2.5" })).toBe("1");
    // «A cotizar: sin definir»: el alta usa 1 por defecto y la pantalla lo fija con SET.
    expect(cantidadParaCotizar({ target_quantity: null })).toBe("1");
    expect(cantidadParaCotizar({ target_quantity: "0" })).toBe("1");
    expect(cantidadParaCotizar({ target_quantity: "  " })).toBe("1");
    expect(cantidadParaCotizar(null)).toBe("1");
  });
});

describe("mensajes y reintentos", () => {
  it("traduce el fallo de red y usa el mensaje del backend cuando existe", () => {
    expect(mensajeDeErrorCotizacion(new ApiError(0, "NETWORK", "x"))).toMatch(/conexión/i);
    expect(
      mensajeDeErrorCotizacion(new ApiError(409, "QUOTE_EMPTY", "La cotización está vacía.")),
    ).toBe("La cotización está vacía.");
    expect(mensajeDeErrorCotizacion(new Error(""))).toMatch(/no pudimos/i);
  });

  it("reconoce una finalización ya hecha y un resultado desconocido", () => {
    expect(yaFinalizada(new ApiError(409, "QUOTE_ALREADY_FINALIZED", "x"))).toBe(true);
    expect(yaFinalizada(new ApiError(409, "QUOTE_EMPTY", "x"))).toBe(false);
    // Un carrito que dejó de ser editable obliga a releerlo, no a reintentar el alta.
    expect(cotizacionCerrada(new ApiError(409, "QUOTE_CLOSED", "x"))).toBe(true);
    expect(cotizacionCerrada(new ApiError(409, "QUOTE_ALREADY_FINALIZED", "x"))).toBe(true);
    expect(cotizacionCerrada(new ApiError(409, "QUOTE_EMPTY", "x"))).toBe(false);

    // Reintentar con la misma clave solo es obligatorio cuando no se conoce el resultado.
    expect(resultadoDesconocido(new ApiError(0, "NETWORK", "x"))).toBe(true);
    expect(resultadoDesconocido(new ApiError(503, "UPSTREAM_UNAVAILABLE", "x"))).toBe(true);
    expect(resultadoDesconocido(new ApiError(409, "QUOTE_ALREADY_FINALIZED", "x"))).toBe(false);
  });
});
