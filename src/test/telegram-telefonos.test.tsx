import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/telegram-api", () => ({
  asociarAuxiliar: vi.fn(),
  bloquearCuenta: vi.fn(),
  desasociarAuxiliar: vi.fn(),
  editarCuenta: vi.fn(),
  historialCuenta: vi.fn(),
  listarAuxiliaresDeCuenta: vi.fn(),
  reactivarCuenta: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { TelefonosSection } from "@/components/telegram/TelefonosSection";
import {
  asociarAuxiliar,
  listarAuxiliaresDeCuenta,
  type AuxiliaresDeCuenta,
  type CuentaTelegram,
  type PersonaStaff,
} from "@/lib/telegram-api";

const asociar = asociarAuxiliar as unknown as Mock;
const listarAuxiliares = listarAuxiliaresDeCuenta as unknown as Mock;

const cuenta: CuentaTelegram = {
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
  created_by_name: "Pao",
  blocked_at: null,
  blocked_by_name: null,
  block_reason: null,
  reactivated_at: null,
  reactivated_by_name: null,
};

const pato: PersonaStaff = {
  id: "aux-1",
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
  observations_authored: 4,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
};

const actuales: AuxiliaresDeCuenta = {
  account_id: "cuenta-1",
  mode: "shared_device",
  branch_label: "Parque Lantaño",
  app_user_id: null,
  auxiliaries: [],
};

describe("auxiliares de un teléfono ya autorizado", () => {
  beforeEach(() => {
    asociar.mockReset();
    listarAuxiliares.mockReset();
    listarAuxiliares.mockResolvedValue(actuales);
    asociar.mockResolvedValue({
      account_id: "cuenta-1",
      app_user_id: "aux-1",
      active: true,
      sessions_revoked: 0,
      history_preserved: true,
      reactivated: false,
    });
  });

  it("habilita a la persona desde el teléfono, sin aprobar de nuevo la cuenta", async () => {
    const recargar = vi.fn(async () => {});
    render(
      <TelefonosSection
        cuentas={[cuenta]}
        staff={[pato]}
        cargando={false}
        error={null}
        recargar={recargar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Auxiliares/ }));
    const selector = await screen.findByLabelText("Persona para habilitar");
    fireEvent.change(selector, { target: { value: "aux-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Habilitar$/ }));

    await waitFor(() => expect(asociar).toHaveBeenCalledTimes(1));
    expect(asociar).toHaveBeenCalledWith("cuenta-1", "aux-1");
    expect(recargar).toHaveBeenCalled();
  });
});
