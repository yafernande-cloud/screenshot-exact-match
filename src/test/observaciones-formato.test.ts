import { describe, expect, it, vi } from "vitest";

import { describirPreferencia, formatearPorcentaje } from "@/lib/observaciones-api";
import type { PreferenciaComercial } from "@/lib/observaciones-api";

/**
 * Formato de la tolerancia en «Enseñar a la IA».
 *
 * La base guarda `tolerance_percent` como `NUMERIC(6,3)` y la API lo serializa tal cual
 * («10.000»). Ese punto es decimal, no de miles: se presenta en es-CL sin cambiar el valor
 * guardado ni la regla del motor, que sigue aplicando 10 %.
 */
vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

function preferencia(over: Partial<PreferenciaComercial> = {}): PreferenciaComercial {
  return {
    preference_id: "pref-1",
    subject_kind: "laboratory",
    subject_label: "ASCEND LABORATORIES SPA",
    effect: "prefer",
    tolerance: { kind: "relative_percent", percent: "10.000", amount: null, currency: null },
    price_reference: null,
    ...over,
  };
}

describe("formato de la tolerancia de una preferencia", () => {
  it("presenta el porcentaje guardado como NUMERIC(6,3) en formato chileno", () => {
    expect(formatearPorcentaje("10.000")).toBe("10");
    expect(formatearPorcentaje("12.500")).toBe("12,5");
    expect(formatearPorcentaje(null)).toBeNull();
  });

  it("no convierte una tolerancia de 10 % en diez mil por ciento", () => {
    expect(describirPreferencia(preferencia())).toBe(
      "Laboratorio «ASCEND LABORATORIES SPA» se prefiere, con hasta 10 % más de precio.",
    );
  });

  it("mantiene la tolerancia absoluta como monto, sin porcentaje", () => {
    const descripcion = describirPreferencia(
      preferencia({
        tolerance: { kind: "absolute_amount", percent: null, amount: "500", currency: "CLP" },
      }),
    );
    expect(descripcion).toContain("con hasta 500 CLP de diferencia");
    expect(descripcion).not.toContain("%");
  });

  it("un valor inesperado no se inventa ni se redondea", () => {
    expect(formatearPorcentaje("no-numero")).toBe("no-numero");
  });
});
