import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * Regresión del segundo método de acceso: correo + contraseña convive con Google sin alterar el
 * flujo de la vista previa de Lovable. Aquí se monta el router real con el proveedor de sesión
 * simulado, de modo que solo se comprueba la interfaz y la llamada al método del contexto.
 */

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(async () => {}),
  signInWithPassword: vi.fn(async (_email: string, _password: string) => {}),
  signOut: vi.fn(async () => {}),
  retry: vi.fn(async () => {}),
}));

vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({
    status: "signed_out",
    profile: null,
    error: null,
    signInWithGoogle: mocks.signInWithGoogle,
    signInWithPassword: mocks.signInWithPassword,
    signOut: mocks.signOut,
    retry: mocks.retry,
  }),
}));

async function renderLogin() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Cotizador Inteligente Farmacia" });
}

function setEmbedded(embedded: boolean) {
  Object.defineProperty(window, "top", {
    value: embedded ? {} : window,
    configurable: true,
    writable: true,
  });
}

async function submitCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
}

describe("inicio de sesión con correo y contraseña", () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockClear();
    mocks.signInWithPassword.mockClear();
    mocks.signInWithPassword.mockImplementation(async () => {});
    mocks.signOut.mockClear();
    mocks.retry.mockClear();
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    setEmbedded(false);
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("envía el correo sin espacios y la contraseña al método de sesión", async () => {
    await renderLogin();

    await submitCredentials("  profesor@demo.cl  ", "clave-demo");

    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith("profesor@demo.cl", "clave-demo"),
    );
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("muestra un mensaje claro cuando las credenciales son incorrectas", async () => {
    mocks.signInWithPassword.mockRejectedValueOnce({
      code: "invalid_credentials",
      status: 400,
      message: "Invalid login credentials",
    });
    await renderLogin();

    await submitCredentials("profesor@demo.cl", "incorrecta");

    expect(await screen.findByText(/Correo o contraseña incorrectos/i)).toBeInTheDocument();
  });

  it("avisa cuando el correo todavía no está confirmado", async () => {
    mocks.signInWithPassword.mockRejectedValueOnce({
      code: "email_not_confirmed",
      status: 400,
      message: "Email not confirmed",
    });
    await renderLogin();

    await submitCredentials("profesor@demo.cl", "clave-demo");

    expect(await screen.findByText(/todavía no está confirmado/i)).toBeInTheDocument();
  });

  it("no envía nada si faltan los campos", async () => {
    await renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(
      await screen.findByText(/Ingresa tu correo electrónico y tu contraseña/i),
    ).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("permite ingresar dentro de la vista previa sin abrir otra pestaña", async () => {
    setEmbedded(true);
    const open = vi.spyOn(window, "open");
    await renderLogin();

    await submitCredentials("profesor@demo.cl", "clave-demo");

    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith("profesor@demo.cl", "clave-demo"),
    );
    expect(open).not.toHaveBeenCalled();
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("presenta el formulario y el botón «Ingresar» antes del acceso con Google", async () => {
    await renderLogin();

    const email = screen.getByLabelText("Correo electrónico");
    const submit = screen.getByRole("button", { name: "Ingresar" });
    const google = screen.getByRole("button", { name: /continuar con google/i });

    expect(email.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(submit.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("mantiene el botón de Google intacto", async () => {
    await renderLogin();

    fireEvent.click(screen.getByRole("button", { name: /continuar con google/i }));

    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
