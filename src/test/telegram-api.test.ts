import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api";
import {
  aprobarSolicitud,
  asociarAuxiliar,
  cambiarDisponibilidadPersona,
  crearAuxiliar,
  desasociarAuxiliar,
  editarCuenta,
  eliminarAuxiliar,
  listarPersonal,
  listarSolicitudes,
} from "@/lib/telegram-api";

const llamada = apiRequest as unknown as Mock;

function cuerpo(indice = 0): unknown {
  const init = llamada.mock.calls[indice]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

describe("cliente de Telegram", () => {
  beforeEach(() => {
    llamada.mockReset();
    llamada.mockResolvedValue({});
  });

  it("loads staff including inactive people", async () => {
    await listarPersonal(true);
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/staff?include_inactive=true");
  });

  it("creates an auxiliary with only the display name and the auxiliary role", async () => {
    await crearAuxiliar("Pato");
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/staff");
    expect((llamada.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect(cuerpo()).toEqual({ display_name: "Pato", roles: ["auxiliary"] });
  });

  it("deletes an auxiliary through the terminal soft-delete endpoint", async () => {
    await eliminarAuxiliar("staff-1");
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/staff/staff-1/delete-auxiliary");
    expect((llamada.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
  });

  it("sends availability with its reason", async () => {
    await cambiarDisponibilidadPersona("staff-1", false, "vacation", "vuelve el lunes");
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/staff/staff-1/availability");
    expect((llamada.mock.calls[0]?.[1] as RequestInit).method).toBe("PUT");
    expect(cuerpo()).toEqual({
      available: false,
      reason: "vacation",
      note: "vuelve el lunes",
    });
  });

  it("lists only pending access requests", async () => {
    await listarSolicitudes("pending");
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/telegram-access-requests?status=pending");
  });

  it("approves a shared phone with every auxiliary in ONE call", async () => {
    await aprobarSolicitud("req-1", {
      display_label: "Teléfono farmacia",
      branch_label: "Parque Lantaño",
      mode: "shared_device",
      access_role: "operator",
      auxiliary_ids: ["aux-1", "aux-2"],
    });

    expect(llamada).toHaveBeenCalledTimes(1);
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/telegram-access-requests/req-1/approve");
    expect((llamada.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    const body = cuerpo() as Record<string, unknown>;
    expect(body["mode"]).toBe("shared_device");
    expect(body["auxiliary_ids"]).toEqual(["aux-1", "aux-2"]);
    expect(body).not.toHaveProperty("app_user_id");
  });

  it("approves a personal phone with the person and without auxiliaries", async () => {
    await aprobarSolicitud("req-2", {
      display_label: "Teléfono de Pao",
      mode: "personal",
      app_user_id: "staff-9",
    });
    const body = cuerpo() as Record<string, unknown>;
    expect(body["app_user_id"]).toBe("staff-9");
    expect(body).not.toHaveProperty("auxiliary_ids");
    expect(body["mode"]).toBe("personal");
  });

  it("enables an auxiliary on an existing phone without touching the request endpoints", async () => {
    await asociarAuxiliar("cuenta-1", "staff-2");
    expect(llamada).toHaveBeenCalledTimes(1);
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/telegram-accounts/cuenta-1/auxiliaries");
    expect(cuerpo()).toEqual({ app_user_id: "staff-2" });
    const ruta = String(llamada.mock.calls[0]?.[0]);
    expect(ruta).not.toContain("telegram-access-requests");
    expect(ruta).not.toContain("/approve");
  });

  it("deactivates an auxiliary only on that phone", async () => {
    await desasociarAuxiliar("cuenta-1", "staff-2", "licencia");
    expect(llamada.mock.calls[0]?.[0]).toBe(
      "/api/v1/telegram-accounts/cuenta-1/auxiliaries/staff-2/deactivate",
    );
    expect(cuerpo()).toEqual({ reason: "licencia" });
  });

  it("edits the phone with a single PATCH", async () => {
    await editarCuenta("cuenta-1", { display_label: "Mostrador", branch_label: null });
    expect(llamada.mock.calls[0]?.[0]).toBe("/api/v1/telegram-accounts/cuenta-1");
    expect((llamada.mock.calls[0]?.[1] as RequestInit).method).toBe("PATCH");
    expect(cuerpo()).toEqual({ display_label: "Mostrador", branch_label: null });
  });
});
