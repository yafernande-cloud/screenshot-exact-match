import { afterEach, describe, expect, it, vi } from "vitest";

/** Sesión única de Supabase simulada: el cliente real no debe abrirse en las pruebas. */
const supabase = vi.hoisted(() => ({ token: "token-vigente", signOut: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: supabase.token } },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session: null },
        error: new Error("sin refresco"),
      }),
      signOut: async () => {
        supabase.signOut();
        return { error: null };
      },
    },
  }),
}));

import { ApiError } from "@/lib/api";
import {
  cancelarFaltante,
  cargarFotografia,
  esConflictoDeVersion,
  fijarCantidad,
  limpiarCantidad,
  listarFaltantes,
  type Faltante,
} from "@/lib/faltantes-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function faltante(overrides: Partial<Faltante> = {}): Faltante {
  return {
    id: "f-1",
    display_name: "Omeprazol 20 mg",
    ingredient: "omeprazol",
    status: "active",
    version: 3,
    observation_count: 2,
    reporters: ["Pato"],
    data_origin: "captured",
    created_at: "2026-11-05T10:00:00Z",
    reported_by: "u-1",
    reported_by_name: "Pato",
    branch_label: "Parque Lantaño",
    declared_quantity: "2",
    declared_unit: "box",
    requested_quantity: "2",
    requested_unit: "box",
    requested_quantity_origin: "explicit",
    target_quantity: null,
    quantity_unit: null,
    quantity_status: "unknown",
    needs_quantity: true,
    reported_at: "2026-11-05T10:00:00Z",
    cancelled_at: null,
    last_raw_text: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("listarFaltantes", () => {
  it("sigue el cursor y no duplica filas repetidas entre páginas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [faltante()],
          next_cursor: "cursor-2",
          pending_review_count: 0,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [faltante(), faltante({ id: "f-2", display_name: "Loratadina 10 mg" })],
          next_cursor: null,
          pending_review_count: 0,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const items = await listarFaltantes();

    expect(items.map((f) => f.id)).toEqual(["f-1", "f-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const primera = String(fetchMock.mock.calls[0]?.[0]);
    const segunda = String(fetchMock.mock.calls[1]?.[0]);
    expect(primera).toContain("status=active");
    expect(primera).toContain("limit=50");
    expect(segunda).toContain("cursor=cursor-2");
  });
});

describe("comandos reales de la bandeja", () => {
  it("fija la cantidad con SET, If-Match e Idempotency-Key", async () => {
    const item = faltante({ target_quantity: "3", quantity_unit: "box", version: 4 });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        replayed: false,
        previous_quantity: null,
        previous_unit: null,
        item,
        event: {
          id: "e-1",
          operation: "SET",
          value: "3",
          unit: "box",
          before_value: null,
          before_unit: null,
          after_value: "3",
          after_unit: "box",
          version_after: 4,
          actor: "Pao",
          reason: null,
          created_at: "2026-11-05T10:05:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await fijarCantidad(faltante(), 3, "box");

    expect(resultado.item.target_quantity).toBe("3");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/demand-items/f-1/quantity-commands");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"3"');
    expect(
      String((init.headers as Record<string, string>)["Idempotency-Key"]).length,
    ).toBeGreaterThanOrEqual(8);
    expect(JSON.parse(String(init.body))).toMatchObject({
      operation: "SET",
      value: "3",
      unit: "box",
    });
  });

  it("revierte el 1 por defecto con CLEAR, sin valor ni unidad", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        replayed: false,
        previous_quantity: "1",
        previous_unit: "unit",
        item: faltante({ target_quantity: null, quantity_unit: null, version: 5 }),
        event: {
          id: "e-2",
          operation: "CLEAR",
          value: null,
          unit: null,
          before_value: "1",
          before_unit: "unit",
          after_value: null,
          after_unit: null,
          version_after: 5,
          actor: "Pao",
          reason: null,
          created_at: "2026-11-05T10:06:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await limpiarCantidad(faltante({ target_quantity: "1", version: 4 }));

    expect(resultado.item.target_quantity).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/demand-items/f-1/quantity-commands");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"4"');
    expect(JSON.parse(String(init.body))).toEqual({ operation: "CLEAR" });
  });

  it("retira con la cancelación lógica del backend, sin borrar historial", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        item: faltante({ status: "cancelled" }),
        affected_quote_lines: [],
        message: "Reporte cancelado. No se borró ninguna observación ni el historial.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await cancelarFaltante(faltante());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/demand-items/f-1/cancel");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"3"');
    expect(JSON.parse(String(init.body))).toMatchObject({
      reason: "Retirado desde la bandeja de faltantes",
    });
  });
});

describe("fotografía original del reporte", () => {
  it("la descarga con la misma identidad que el resto de la API y devuelve el binario", async () => {
    const imagen = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(imagen, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await cargarFotografia("/api/v1/attachments/a-1/content");

    expect(blob.type).toBe("image/jpeg");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/attachments/a-1/content");
    // Nunca como <img src> directo: el encabezado de identidad viaja en la solicitud.
    const encabezados = init.headers as Record<string, string>;
    expect(encabezados["Authorization"]).toBe("Bearer token-vigente");
    expect(encabezados["Accept"]).toBe("image/*");
  });

  it("no sigue una URL absoluta ni otro origen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarFotografia("https://otro-sitio.example/foto.jpg")).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("informa cuando la fotografía ya no está disponible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "PHOTO_NOT_AVAILABLE",
              message: "La fotografía no está disponible.",
            },
          },
          404,
        ),
      ),
    );

    await expect(cargarFotografia("/api/v1/attachments/a-1/content")).rejects.toMatchObject({
      status: 404,
      message: "La fotografía no está disponible.",
    });
  });

  it("no solicita nada cuando el reporte no tiene fotografía", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarFotografia("")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("errores de concurrencia", () => {
  it("reconoce solo el conflicto de versión como reintento con refresco", () => {
    expect(esConflictoDeVersion(new ApiError(409, "VERSION_CONFLICT", "La lista cambió."))).toBe(
      true,
    );
    expect(esConflictoDeVersion(new ApiError(409, "QUANTITY_BELOW_ALLOCATED", "Asignada."))).toBe(
      false,
    );
    expect(esConflictoDeVersion(new Error("otro"))).toBe(false);
  });
});
