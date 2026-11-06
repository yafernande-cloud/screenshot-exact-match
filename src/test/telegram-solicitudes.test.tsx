import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/telegram-api", () => ({
  listarSolicitudes: vi.fn(),
  buscarSolicitudPorCodigo: vi.fn(),
  aprobarSolicitud: vi.fn(),
  rechazarSolicitud: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { SolicitudesSection } from "@/components/telegram/SolicitudesSection";
import {
  aprobarSolicitud,
  listarSolicitudes,
  type CuentaTelegram,
  type PersonaStaff,
  type SolicitudAcceso,
} from "@/lib/telegram-api";

const listar = listarSolicitudes as unknown as Mock;
const aprobar = aprobarSolicitud as unknown as Mock;

function persona(overrides: Partial<PersonaStaff>): PersonaStaff {
  return {
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
    observations_authored: 0,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

const staff = [
  persona({ id: "aux-1", display_name: "Pato" }),
  persona({ id: "aux-2", display_name: "Iván" }),
];

const solicitud: SolicitudAcceso = {
  id: "req-1",
  external_user_id: "987654321",
  external_chat_id: "5550001",
  status: "pending",
  created_at: "2026-11-06T10:00:00Z",
  expires_at: "2026-11-06T18:00:00Z",
  approved_at: null,
  approved_account_id: null,
  approved_by_name: null,
  rejected_at: null,
  reject_reason: null,
  rejected_by_name: null,
};

const cuenta: CuentaTelegram = {
  id: "cuenta-1",
  external_user_id: "987654321",
  display_label: "Teléfono farmacia",
  branch_label: null,
  mode: "shared_device",
  access_role: "operator",
  status: "active",
  origin: "access_request",
  created_from_request_id: "req-1",
  app_user_id: null,
  app_user_name: null,
  person_active: null,
  person_available: null,
  bindings: [],
  created_at: "2026-11-06T12:00:00Z",
  created_by_name: "Pao",
  blocked_at: null,
  blocked_by_name: null,
  block_reason: null,
  reactivated_at: null,
  reactivated_by_name: null,
};

async function abrirFormulario() {
  fireEvent.click(await screen.findByRole("button", { name: /Revisar y aprobar/i }));
}

describe("aprobación de solicitudes desde la pantalla real", () => {
  beforeEach(() => {
    listar.mockReset();
    aprobar.mockReset();
    listar.mockResolvedValue([solicitud]);
    aprobar.mockResolvedValue(cuenta);
  });

  it("aprueba un teléfono compartido con todos los auxiliares en una sola llamada", async () => {
    const onCuentasCambiadas = vi.fn(async () => {});
    render(<SolicitudesSection staff={staff} onCuentasCambiadas={onCuentasCambiadas} />);

    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Nombre del teléfono"), {
      target: { value: "Teléfono farmacia" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Pato/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Iván/ }));
    fireEvent.click(screen.getByRole("button", { name: /Aprobar teléfono/i }));

    await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(1));
    const [requestId, body] = aprobar.mock.calls[0] as [string, Record<string, unknown>];
    expect(requestId).toBe("req-1");
    expect(body["mode"]).toBe("shared_device");
    expect(body["display_label"]).toBe("Teléfono farmacia");
    expect(body["auxiliary_ids"]).toEqual(["aux-1", "aux-2"]);
    expect(body).not.toHaveProperty("app_user_id");
    expect(onCuentasCambiadas).toHaveBeenCalledTimes(1);
  });

  it("aprueba un teléfono personal con la persona y sin auxiliares", async () => {
    const onCuentasCambiadas = vi.fn(async () => {});
    render(<SolicitudesSection staff={staff} onCuentasCambiadas={onCuentasCambiadas} />);

    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Nombre del teléfono"), {
      target: { value: "Teléfono de Pao" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de teléfono"), {
      target: { value: "personal" },
    });
    fireEvent.change(screen.getByLabelText("Persona"), {
      target: { value: "aux-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Aprobar teléfono/i }));

    await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(1));
    const [, body] = aprobar.mock.calls[0] as [string, Record<string, unknown>];
    expect(body["mode"]).toBe("personal");
    expect(body["app_user_id"]).toBe("aux-2");
    expect(body).not.toHaveProperty("auxiliary_ids");
  });

  it("no aprueba un compartido sin ningún auxiliar seleccionado", async () => {
    const onCuentasCambiadas = vi.fn(async () => {});
    render(<SolicitudesSection staff={staff} onCuentasCambiadas={onCuentasCambiadas} />);

    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Nombre del teléfono"), {
      target: { value: "Teléfono farmacia" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Aprobar teléfono/i }));

    await waitFor(() => expect(aprobar).not.toHaveBeenCalled());
    expect(onCuentasCambiadas).not.toHaveBeenCalled();
  });
});
