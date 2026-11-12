import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const sesion = {
  status: "authorized",
  profile: { display_name: "Ana", roles: ["admin"] },
};

vi.mock("@/lib/session", () => ({
  useSession: () => sesion,
}));

vi.mock("@/lib/web-access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-access-api")>();
  return {
    ...actual,
    listarSolicitudesPendientes: vi.fn(),
    aprobarSolicitud: vi.fn(),
    rechazarSolicitud: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { CampanitaSolicitudes, SolicitudesProvider } from "@/components/SolicitudesAcceso";
import { ApiError } from "@/lib/api";
import {
  aprobarSolicitud,
  listarSolicitudesPendientes,
  rechazarSolicitud,
  type PendientesWeb,
  type SolicitudAccesoWeb,
} from "@/lib/web-access-api";

const listar = listarSolicitudesPendientes as unknown as Mock;
const aprobar = aprobarSolicitud as unknown as Mock;
const rechazar = rechazarSolicitud as unknown as Mock;

const solicitud: SolicitudAccesoWeb = {
  id: "req-1",
  email: "nueva@example.test",
  display_name: "Nueva Persona",
  requested_at: "2026-11-10T15:30:00Z",
  organization: null,
};

const conUna: PendientesWeb = { pending_count: 1, items: [solicitud] };
const vacia: PendientesWeb = { pending_count: 0, items: [] };

function montar() {
  return render(
    <SolicitudesProvider>
      <CampanitaSolicitudes />
    </SolicitudesProvider>,
  );
}

async function abrirCampanita() {
  const boton = await screen.findByRole("button", { name: /Solicitudes de acceso/ });
  fireEvent.click(boton);
}

describe("campanita de solicitudes reales", () => {
  let pendientes: PendientesWeb = conUna;

  beforeEach(() => {
    pendientes = conUna;
    listar.mockReset();
    aprobar.mockReset();
    rechazar.mockReset();
    // Abrir la campanita también refresca: el mock responde siempre el estado vigente.
    listar.mockImplementation(async () => pendientes);
  });

  it("muestra el contador y los datos reales de la solicitud", async () => {
    montar();
    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(screen.getByLabelText(/1 pendientes/)).toBeInTheDocument();

    await abrirCampanita();
    expect(await screen.findByText("Nueva Persona")).toBeInTheDocument();
    expect(screen.getByText("nueva@example.test")).toBeInTheDocument();
    expect(screen.getByText(/Solicitada el/)).toBeInTheDocument();
    expect(screen.queryByText("Camila Rojas")).not.toBeInTheDocument();
  });

  it("aprueba contra el backend y refresca el listado", async () => {
    aprobar.mockImplementation(async () => {
      pendientes = vacia;
      return {
        request_id: "req-1",
        status: "approved",
        user_id: "u-1",
        display_name: "Nueva Persona",
        roles: ["admin"],
        web_access_expires_at: null,
      };
    });

    montar();
    await abrirCampanita();
    fireEvent.click(await screen.findByRole("button", { name: /Aprobar/ }));

    await waitFor(() => expect(aprobar).toHaveBeenCalledWith("req-1"));
    await waitFor(() => expect(screen.queryByText("Nueva Persona")).not.toBeInTheDocument());
    expect(screen.getByText("No hay solicitudes pendientes")).toBeInTheDocument();
  });

  it("rechaza contra el backend y refresca el listado", async () => {
    rechazar.mockImplementation(async () => {
      pendientes = vacia;
      return { request_id: "req-1", status: "rejected" };
    });

    montar();
    await abrirCampanita();
    fireEvent.click(await screen.findByRole("button", { name: /Rechazar/ }));

    await waitFor(() => expect(rechazar).toHaveBeenCalledWith("req-1"));
    await waitFor(() => expect(screen.queryByText("Nueva Persona")).not.toBeInTheDocument());
  });

  it("no envía dos decisiones por un doble clic", async () => {
    let resolver: (valor: unknown) => void = () => {};
    aprobar.mockReturnValue(
      new Promise((listo) => {
        resolver = listo;
      }),
    );

    montar();
    await abrirCampanita();
    const boton = await screen.findByRole("button", { name: /Aprobar/ });
    fireEvent.click(boton);
    fireEvent.click(boton);

    await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(1));
    pendientes = vacia;
    resolver({
      request_id: "req-1",
      status: "approved",
      user_id: "u-1",
      display_name: "Nueva Persona",
      roles: ["admin"],
      web_access_expires_at: null,
    });
    await waitFor(() => expect(screen.queryByText("Nueva Persona")).not.toBeInTheDocument());
  });

  it("muestra el error del backend y permite reintentar", async () => {
    listar.mockRejectedValue(new ApiError(403, "FORBIDDEN", "No tienes permiso para esta acción."));

    montar();
    await abrirCampanita();
    expect(await screen.findByText("No tienes permiso para esta acción.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("campanita sin permisos de administración", () => {
  it("no consulta el backend para un rol auxiliar", async () => {
    sesion.profile.roles = ["auxiliary"];
    listar.mockReset();
    montar();
    // Se da tiempo al efecto; sin permiso no debe haber ninguna llamada.
    await new Promise((listo) => setTimeout(listo, 20));
    expect(listar).not.toHaveBeenCalled();
    sesion.profile.roles = ["admin"];
  });
});
