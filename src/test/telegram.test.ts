import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { PersonaStaff } from "@/lib/telegram-api";
import {
  auxiliaresSeleccionables,
  describirPersona,
  etiquetaHistorial,
  formatearFecha,
  mensajeDeErrorTelegram,
  normalizarNombre,
  personalOperativo,
  personaConNombre,
  puedeAdministrarTelegram,
  resumenCuenta,
} from "@/lib/telegram";

function persona(overrides: Partial<PersonaStaff> = {}): PersonaStaff {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    display_name: "Pato",
    roles: ["auxiliary"],
    member_active: true,
    available: true,
    absence_reason: null,
    absence_label: null,
    absence_note: null,
    unavailable_since: null,
    can_report: true,
    telegram_session: { active: false, expires_at: null },
    observations_authored: 0,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

describe("permisos de la pantalla de Telegram", () => {
  it("only admin sees the administration controls", () => {
    expect(puedeAdministrarTelegram(["admin"])).toBe(true);
    expect(puedeAdministrarTelegram(["auxiliary", "purchasing"])).toBe(false);
    expect(puedeAdministrarTelegram([])).toBe(false);
    expect(puedeAdministrarTelegram(null)).toBe(false);
  });
});

describe("personal y auxiliares", () => {
  it("compares names ignoring case, accents and repeated spaces", () => {
    expect(normalizarNombre("  MARÍA   José ")).toBe("maria jose");
    expect(
      personaConNombre([persona({ display_name: "María José" })], "maria jose")?.display_name,
    ).toBe("María José");
    expect(personaConNombre([persona()], "   ")).toBeUndefined();
  });

  it("keeps inactive auxiliary people visible but leaves them out of selectable ones", () => {
    const staff = [
      persona({ id: "a", display_name: "Pato" }),
      persona({ id: "b", display_name: "Iván", member_active: false, can_report: false }),
      persona({ id: "c", display_name: "Pao", roles: ["admin"], can_report: false }),
      persona({ id: "d", display_name: "Danny", available: false, can_report: false }),
    ];
    expect(personalOperativo(staff).map((p) => p.display_name)).toEqual(["Pato", "Iván", "Danny"]);
    expect(auxiliaresSeleccionables(staff).map((p) => p.display_name)).toEqual(["Pato"]);
  });

  it("leaves out people deleted as Telegram auxiliaries everywhere, and frees their name", () => {
    const staff = [
      persona({ id: "a", display_name: "Pato" }),
      persona({
        id: "b",
        display_name: "Danny",
        telegram_deleted_at: "2026-11-06T12:00:00Z",
        can_report: false,
      }),
    ];
    expect(personalOperativo(staff).map((p) => p.display_name)).toEqual(["Pato"]);
    expect(auxiliaresSeleccionables(staff).map((p) => p.display_name)).toEqual(["Pato"]);
    expect(personaConNombre(staff, "danny")).toBeUndefined();
  });

  it("explains why a person cannot report", () => {
    expect(describirPersona(persona())).toBe("Disponible");
    expect(describirPersona(persona({ member_active: false }))).toBe("Desactivada");
    expect(describirPersona(persona({ available: false, absence_reason: "vacation" }))).toBe(
      "No disponible · Vacaciones",
    );
    expect(describirPersona(persona({ available: false }))).toBe("No disponible");
  });
});

describe("etiquetas y fechas", () => {
  it("translates known history actions and falls back to a readable action", () => {
    expect(etiquetaHistorial("telegram_account.blocked")).toBe("Teléfono bloqueado");
    expect(etiquetaHistorial("telegram_account.auxiliary_added")).toBe(
      "Auxiliar habilitado en el teléfono",
    );
    expect(etiquetaHistorial("telegram_account.otro_cambio")).toBe("telegram account otro cambio");
  });

  it("does not invent dates for missing or invalid values", () => {
    expect(formatearFecha(null)).toBe("—");
    expect(formatearFecha("no-es-una-fecha")).toBe("—");
    expect(formatearFecha("2026-11-06T12:00:00Z")).not.toBe("—");
  });

  it("summarises the phone without exposing internal IDs", () => {
    const resumen = resumenCuenta({
      id: "cuenta-1",
      external_user_id: "987654321",
      display_label: "Teléfono farmacia",
      branch_label: "Parque Lantaño",
      mode: "shared_device",
      access_role: "operator",
      status: "active",
      origin: "access_request",
      created_from_request_id: null,
      app_user_id: null,
      app_user_name: null,
      person_active: null,
      person_available: null,
      bindings: [],
      created_at: "2026-11-01T12:00:00Z",
      created_by_name: null,
      blocked_at: null,
      blocked_by_name: null,
      block_reason: null,
      reactivated_at: null,
      reactivated_by_name: null,
    });
    expect(resumen).toBe("Compartido · Parque Lantaño");
  });
});

describe("errores comprensibles", () => {
  it("explains the most common backend errors in plain Spanish", () => {
    expect(
      mensajeDeErrorTelegram(
        new ApiError(409, "DUPLICATE_NAME", "Ya hay una persona activa llamada «Pato»."),
        "fallback",
      ),
    ).toContain("Ya existe una persona activa");
    expect(
      mensajeDeErrorTelegram(
        new ApiError(400, "AUXILIARY_REQUIRED", "Un teléfono compartido debe indicar…"),
        "fallback",
      ),
    ).toContain("al menos un auxiliar");
    expect(
      mensajeDeErrorTelegram(new ApiError(403, "FORBIDDEN", "Sin permiso"), "fallback"),
    ).toContain("No tienes permiso");
    expect(
      mensajeDeErrorTelegram(
        new ApiError(409, "PERSON_DELETED", "Danny fue eliminada como auxiliar."),
        "fallback",
      ),
    ).toContain("eliminada como auxiliar");
  });

  it("uses the backend message for unknown codes and the fallback for unknown errors", () => {
    expect(
      mensajeDeErrorTelegram(new ApiError(400, "OTRO", "Detalle del backend"), "fallback"),
    ).toBe("Detalle del backend");
    expect(mensajeDeErrorTelegram(new Error("boom"), "fallback")).toBe("fallback");
  });
});
