import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const sesion = {
  status: "authorized",
  profile: { display_name: "Ana", roles: ["admin"] },
};

vi.mock("@/lib/session", () => ({
  useSession: () => sesion,
}));

// La cabecera del cotizador no aporta a esta prueba: se reemplaza por textos simples.
vi.mock("@/components/MenuPrincipal", () => ({
  MenuPrincipal: () => null,
  EncabezadoPagina: ({ titulo }: { titulo: string }) => <h1>{titulo}</h1>,
}));

vi.mock("@/lib/web-access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-access-api")>();
  return {
    ...actual,
    listarUsuariosWeb: vi.fn(),
    eliminarAccesoWeb: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { Usuarios } from "@/routes/usuarios";
import { ApiError } from "@/lib/api";
import {
  eliminarAccesoWeb,
  listarUsuariosWeb,
  type UsuarioWeb,
  type UsuariosWeb,
} from "@/lib/web-access-api";

const listar = listarUsuariosWeb as unknown as Mock;
const eliminar = eliminarAccesoWeb as unknown as Mock;

function persona(overrides: Partial<UsuarioWeb>): UsuarioWeb {
  return {
    user_id: "u-1",
    display_name: "Ana",
    email: "ana@example.test",
    roles: ["admin"],
    is_superadmin: false,
    is_self: false,
    web_access_expires_at: null,
    granted_at: "2026-11-10T12:00:00Z",
    ...overrides,
  };
}

const ana = persona({ user_id: "u-ana", display_name: "Ana", is_self: true });
const yarella = persona({
  user_id: "u-yarella",
  display_name: "Yarella",
  email: "yarella@example.test",
  is_superadmin: true,
});
const pedro = persona({ user_id: "u-pedro", display_name: "Pedro Soto", email: null });

const conTres: UsuariosWeb = { total: 3, items: [ana, yarella, pedro] };
const sinPedro: UsuariosWeb = { total: 2, items: [ana, yarella] };

async function abrirDialogo() {
  fireEvent.click(await screen.findByRole("button", { name: /Eliminar acceso/ }));
  return await screen.findByRole("dialog");
}

describe("Gestión de usuarios", () => {
  beforeEach(() => {
    listar.mockReset();
    eliminar.mockReset();
    listar.mockResolvedValue(conTres);
    eliminar.mockResolvedValue({ user_id: "u-pedro", display_name: "Pedro Soto", removed: true });
  });

  it("lista solo las autorizaciones vigentes con correo, rol y protecciones", async () => {
    render(<Usuarios />);
    expect(await screen.findByText("Pedro Soto")).toBeInTheDocument();
    expect(screen.getByText("Sin correo registrado")).toBeInTheDocument();
    expect(screen.getByText("Superadministradora")).toBeInTheDocument();
    expect(screen.getByText("Tu cuenta")).toBeInTheDocument();
    expect(screen.getByText("Protegida")).toBeInTheDocument();
    expect(screen.getByText("No puedes eliminar tu propio acceso")).toBeInTheDocument();
    // Solo la persona sin protección ofrece la acción de eliminación.
    expect(screen.getAllByRole("button", { name: /Eliminar acceso/ })).toHaveLength(1);
  });

  it("pide confirmación y cancelar no elimina nada", async () => {
    render(<Usuarios />);
    const dialogo = await abrirDialogo();

    expect(screen.getByText("¿Estás segura de eliminar este usuario?")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Pedro Soto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(eliminar).not.toHaveBeenCalled();
  });

  it("confirmar elimina la autorización y refresca el listado", async () => {
    listar.mockResolvedValueOnce(conTres).mockResolvedValue(sinPedro);
    render(<Usuarios />);
    await abrirDialogo();

    fireEvent.click(screen.getByRole("button", { name: /Confirmar eliminación/ }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith("u-pedro"));
    await waitFor(() => expect(screen.queryByText("Pedro Soto")).not.toBeInTheDocument());
  });

  it("no envía dos eliminaciones por un doble clic", async () => {
    let resolver: (valor: unknown) => void = () => {};
    eliminar.mockReturnValue(
      new Promise((listo) => {
        resolver = listo;
      }),
    );
    listar.mockResolvedValueOnce(conTres).mockResolvedValue(sinPedro);
    render(<Usuarios />);
    await abrirDialogo();

    const confirmar = screen.getByRole("button", { name: /Confirmar eliminación/ });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    await waitFor(() => expect(eliminar).toHaveBeenCalledTimes(1));
    resolver({ user_id: "u-pedro", display_name: "Pedro Soto", removed: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("mantiene el diálogo abierto y explica el error del backend", async () => {
    eliminar.mockRejectedValue(
      new ApiError(
        409,
        "LAST_WEB_ADMIN",
        "No puedes eliminar a la última administradora web autorizada de la farmacia.",
      ),
    );
    render(<Usuarios />);
    const dialogo = await abrirDialogo();

    fireEvent.click(screen.getByRole("button", { name: /Confirmar eliminación/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No puedes eliminar a la última administradora web autorizada de la farmacia.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Pedro Soto/)).toBeInTheDocument();
  });
});

describe("Gestión de usuarios sin permiso", () => {
  it("muestra el aviso y no consulta el backend", async () => {
    sesion.profile.roles = ["auxiliary"];
    listar.mockReset();
    render(<Usuarios />);

    expect(screen.getByText("Solo para administradoras")).toBeInTheDocument();
    await new Promise((listo) => setTimeout(listo, 20));
    expect(listar).not.toHaveBeenCalled();
    sesion.profile.roles = ["admin"];
  });
});
