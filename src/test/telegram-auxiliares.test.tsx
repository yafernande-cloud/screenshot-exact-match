import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/telegram-api", () => ({
  cambiarActividadPersona: vi.fn(),
  cambiarDisponibilidadPersona: vi.fn(),
  crearAuxiliar: vi.fn(),
  eliminarAuxiliar: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AuxiliaresSection } from "@/components/telegram/AuxiliaresSection";
import { eliminarAuxiliar, type PersonaStaff } from "@/lib/telegram-api";

/** jsdom no implementa ResizeObserver; Radix lo usa al montar. */
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: ResizeObserverStub,
  });
}

const eliminar = eliminarAuxiliar as unknown as Mock;

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
    telegram_deleted_at: null,
    can_report: true,
    telegram_session: { active: false, expires_at: null },
    observations_authored: 0,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

const pato = persona({ id: "aux-1", display_name: "Pato" });
const staff = [pato, persona({ id: "aux-2", display_name: "Iván" })];

function montar(personas: PersonaStaff[] = staff, recargar = vi.fn().mockResolvedValue(undefined)) {
  render(<AuxiliaresSection staff={personas} cargando={false} error={null} recargar={recargar} />);
  return recargar;
}

describe("sección de auxiliares", () => {
  beforeEach(() => {
    eliminar.mockReset();
    eliminar.mockResolvedValue({
      id: "aux-1",
      display_name: "Pato",
      telegram_deleted_at: "2026-11-08T12:00:00Z",
      already_deleted: false,
      sessions_revoked: 1,
      account_links_deactivated: 1,
      web_access_preserved: true,
    });
  });

  it("no longer offers renaming, and offers activate, deactivate and delete", () => {
    montar();
    expect(screen.queryByText("Cambiar nombre")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Eliminar$/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Desactivar$/ })).toHaveLength(2);
  });

  it("keeps people deleted as auxiliaries out of the list", () => {
    const conEliminada = [
      ...staff,
      persona({
        id: "aux-3",
        display_name: "Danny",
        telegram_deleted_at: "2026-11-06T12:00:00Z",
        can_report: false,
      }),
    ];
    render(
      <AuxiliaresSection
        staff={conEliminada}
        cargando={false}
        error={null}
        recargar={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByText("Danny")).toBeNull();
  });

  it("asks for confirmation and only then deletes, refreshing the list", async () => {
    const recargar = montar([pato]);
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar$/ }));

    expect(await screen.findByText("¿Eliminar a Pato?")).toBeTruthy();
    expect(eliminar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Sí, eliminar/ }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith("aux-1"));
    await waitFor(() => expect(recargar).toHaveBeenCalled());
  });

  it("does nothing when the deletion is cancelled", async () => {
    const recargar = montar([pato]);
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar$/ }));
    await screen.findByText("¿Eliminar a Pato?");

    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/ }));

    expect(eliminar).not.toHaveBeenCalled();
    expect(recargar).not.toHaveBeenCalled();
  });
});
