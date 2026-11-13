import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * Recorrido real de una cuenta Google recién autenticada que todavía no tiene autorización web.
 *
 * OAuth regresa siempre a `/login`, así que la solicitud debe resolverse ahí mismo: la pantalla
 * consulta el estado público y registra la solicitud una sola vez. Las cuentas ya autorizadas
 * conservan su comportamiento y no tocan estos endpoints.
 */

const sesion = vi.hoisted(() => ({
  status: "signed_out" as "signed_out" | "authorized" | "not_provisioned" | "error" | "loading",
  error: null as { code: string; message: string } | null,
  retry: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));

vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({
    status: sesion.status,
    profile: sesion.status === "authorized" ? { display_name: "Prueba", roles: [] } : null,
    error: sesion.error,
    signInWithGoogle: async () => {},
    signInWithPassword: async () => {},
    signOut: sesion.signOut,
    retry: sesion.retry,
  }),
}));

vi.mock("@/lib/web-access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-access-api")>();
  return {
    ...actual,
    consultarEstadoSolicitud: vi.fn(),
    solicitarAcceso: vi.fn(),
    listarSolicitudesPendientes: vi.fn(async () => ({ pending_count: 0, items: [] })),
  };
});

import { consultarEstadoSolicitud, solicitarAcceso } from "@/lib/web-access-api";

const consultar = consultarEstadoSolicitud as unknown as Mock;
const solicitar = solicitarAcceso as unknown as Mock;

async function renderLogin(esperarFormulario = true) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  if (esperarFormulario) {
    await screen.findByRole("heading", { name: "Cotizador Inteligente Farmacia" });
  }
  return router;
}

describe("cuenta nueva sin autorización en /login", () => {
  beforeEach(() => {
    consultar.mockReset();
    solicitar.mockReset();
    solicitar.mockResolvedValue(undefined);
    sesion.status = "not_provisioned";
    sesion.error = {
      code: "USER_NOT_PROVISIONED",
      message: "Tu cuenta todavía no está habilitada en este cotizador.",
    };
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    sesion.status = "signed_out";
    sesion.error = null;
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("registra la solicitud una sola vez y muestra que queda pendiente", async () => {
    consultar.mockResolvedValue({ status: "none", requested_at: null, decided_at: null });
    await renderLogin();

    expect(await screen.findByText("Solicitud pendiente")).toBeInTheDocument();
    expect(screen.getByText(/esperando aprobación/i)).toBeInTheDocument();
    expect(solicitar).toHaveBeenCalledTimes(1);
    // La pantalla ya no se limita a decir «Acceso no habilitado».
    expect(screen.queryByText("Acceso no habilitado")).not.toBeInTheDocument();
    // Sigue en el inicio de sesión: la identidad no entra al Cotizador antes de la aprobación.
    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeInTheDocument();
  });

  it("una solicitud pendiente no se vuelve a enviar", async () => {
    consultar.mockResolvedValue({
      status: "pending",
      requested_at: "2026-11-12T12:00:00Z",
      decided_at: null,
    });
    await renderLogin();

    expect(await screen.findByText("Solicitud pendiente")).toBeInTheDocument();
    expect(solicitar).not.toHaveBeenCalled();
  });

  it("mantiene el rechazo y solo reenvía si la persona pulsa «Volver a solicitar acceso»", async () => {
    consultar.mockResolvedValue({
      status: "rejected",
      requested_at: "2026-11-12T12:00:00Z",
      decided_at: "2026-11-12T13:00:00Z",
    });
    await renderLogin();

    expect(await screen.findByText("Tu solicitud de acceso no fue aprobada")).toBeInTheDocument();
    expect(solicitar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Volver a solicitar acceso" }));

    await waitFor(() => expect(solicitar).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Solicitud pendiente")).toBeInTheDocument();
  });

  it("no abre la solicitud cuando el rechazo no es una falta de autorización web", async () => {
    // Correo sin verificar (o persona desactivada): solicitar acceso no resolvería el problema.
    sesion.error = {
      code: "EMAIL_NOT_VERIFIED",
      message: "El correo de la cuenta no está verificado.",
    };
    await renderLogin();

    expect(await screen.findByText("Acceso no habilitado")).toBeInTheDocument();
    expect(screen.getByText(/correo de la cuenta no está verificado/i)).toBeInTheDocument();
    expect(consultar).not.toHaveBeenCalled();
    expect(solicitar).not.toHaveBeenCalled();
  });
});

describe("cuenta ya autorizada en /login", () => {
  it("entra al Cotizador sin consultar ni crear solicitudes", async () => {
    sesion.status = "authorized";
    sesion.error = null;
    consultar.mockReset();
    solicitar.mockReset();
    window.history.replaceState({}, "", "/login");

    const router = await renderLogin(false);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(consultar).not.toHaveBeenCalled();
    expect(solicitar).not.toHaveBeenCalled();

    sesion.status = "signed_out";
    window.history.replaceState({}, "", "/");
  });
});
