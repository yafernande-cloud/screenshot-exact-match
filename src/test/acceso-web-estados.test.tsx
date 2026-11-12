import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/web-access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-access-api")>();
  return {
    ...actual,
    consultarEstadoSolicitud: vi.fn(),
    solicitarAcceso: vi.fn(),
  };
});

import { EstadoSolicitudAccesoPanel } from "@/components/AuthGate";
import { useSolicitudAcceso } from "@/lib/use-solicitud-acceso";
import { consultarEstadoSolicitud, solicitarAcceso } from "@/lib/web-access-api";

const consultar = consultarEstadoSolicitud as unknown as Mock;
const solicitar = solicitarAcceso as unknown as Mock;

describe("estado de acceso eliminado o vencido", () => {
  beforeEach(() => {
    consultar.mockReset();
    solicitar.mockReset();
    solicitar.mockResolvedValue(undefined);
  });

  it("no vuelve a solicitar solo tras eliminar el acceso", async () => {
    consultar.mockResolvedValue({ status: "removed", requested_at: null, decided_at: null });
    const { result } = renderHook(() => useSolicitudAcceso(true));

    await waitFor(() =>
      expect(result.current.estado).toEqual({ tipo: "sin_acceso", motivo: "removed" }),
    );
    expect(solicitar).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.volverASolicitar();
    });
    expect(solicitar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toEqual({ tipo: "pendiente", solicitadaEn: null });
  });

  it("tampoco vuelve a solicitar solo cuando el acceso venció", async () => {
    consultar.mockResolvedValue({ status: "expired", requested_at: null, decided_at: null });
    const { result } = renderHook(() => useSolicitudAcceso(true));

    await waitFor(() =>
      expect(result.current.estado).toEqual({ tipo: "sin_acceso", motivo: "expired" }),
    );
    expect(solicitar).not.toHaveBeenCalled();
  });

  it("mantiene el alta automática solo para una identidad nueva", async () => {
    consultar.mockResolvedValue({ status: "none", requested_at: null, decided_at: null });
    const { result } = renderHook(() => useSolicitudAcceso(true));

    await waitFor(() => expect(solicitar).toHaveBeenCalledTimes(1));
    expect(result.current.estado).toEqual({ tipo: "pendiente", solicitadaEn: null });
  });

  it("una solicitud pendiente no se duplica", async () => {
    consultar.mockResolvedValue({
      status: "pending",
      requested_at: "2026-11-10T15:30:00Z",
      decided_at: null,
    });
    const { result } = renderHook(() => useSolicitudAcceso(true));

    await waitFor(() => expect(result.current.estado.tipo).toBe("pendiente"));
    expect(solicitar).not.toHaveBeenCalled();
  });
});

describe("panel de acceso eliminado", () => {
  it("explica la eliminación y ofrece volver a solicitar", () => {
    const volver = vi.fn();
    render(
      <EstadoSolicitudAccesoPanel
        estado={{ tipo: "sin_acceso", motivo: "removed" }}
        onConsultar={vi.fn()}
        onVolverASolicitar={volver}
        onReintentarAcceso={vi.fn()}
      />,
    );

    expect(screen.getByText("Tu acceso web fue eliminado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a solicitar acceso" }));
    expect(volver).toHaveBeenCalledTimes(1);
  });

  it("explica el vencimiento con el mismo camino de solicitud", () => {
    render(
      <EstadoSolicitudAccesoPanel
        estado={{ tipo: "sin_acceso", motivo: "expired" }}
        onConsultar={vi.fn()}
        onVolverASolicitar={vi.fn()}
        onReintentarAcceso={vi.fn()}
      />,
    );
    expect(screen.getByText("Tu acceso web venció")).toBeInTheDocument();
  });
});
