import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * Comprueba el ajuste para la vista previa de Lovable: allí la app vive en un iframe, donde Google
 * responde 403. En ese contexto el login se abre en una pestaña de nivel superior; en una pestaña
 * normal se conserva el flujo actual.
 */

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(async () => {}),
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
}

function setEmbedded(embedded: boolean) {
  Object.defineProperty(window, "top", {
    value: embedded ? {} : window,
    configurable: true,
    writable: true,
  });
}

describe("inicio de sesión con Google en la vista previa", () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockClear();
    mocks.signOut.mockClear();
    mocks.retry.mockClear();
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    setEmbedded(false);
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("mantiene el flujo en la misma pestaña cuando la app no está embebida", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await renderLogin();
    const button = await screen.findByRole("button", { name: /continuar con google/i });

    fireEvent.click(button);

    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();
  });

  it("abre /login?oauth=1 en una pestaña independiente cuando la app está embebida", async () => {
    setEmbedded(true);
    const tab = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    await renderLogin();
    const button = await screen.findByRole("button", { name: /continuar con google/i });

    fireEvent.click(button);

    expect(open).toHaveBeenCalledWith(`${window.location.origin}/login?oauth=1`, "_blank");
    expect(tab.opener).toBeNull();
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("avisa si el navegador bloquea la pestaña y no inicia OAuth dentro del iframe", async () => {
    setEmbedded(true);
    vi.spyOn(window, "open").mockReturnValue(null);
    await renderLogin();
    const button = await screen.findByRole("button", { name: /continuar con google/i });

    fireEvent.click(button);

    expect(await screen.findByText(/bloqueó la pestaña de inicio de sesión/i)).toBeInTheDocument();
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("en la pestaña abierta inicia OAuth una sola vez y quita la marca de la URL", async () => {
    window.history.replaceState({}, "", "/login?oauth=1");

    await renderLogin();

    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(window.location.search).not.toContain("oauth=1");
    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1));
  });
});
