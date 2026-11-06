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
  esConflictoDeVersion,
  fijarCantidad,
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
