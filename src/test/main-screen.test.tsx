import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * Monta la pantalla principal con una sesión ya autorizada. Es el único estado en el que se
 * renderizan `AppSidebar` y `MenuPrincipal`, que consumen `useSidebar()`; así se comprueba que el
 * proveedor envuelve de verdad a toda la aplicación.
 */
vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({
    status: "authorized",
    profile: { display_name: "Prueba", roles: ["admin"] },
    error: null,
    signInWithGoogle: async () => {},
    signOut: async () => {},
    retry: async () => {},
  }),
}));

const SIDEBAR_ERROR = "useSidebar must be used within a SidebarProvider.";

function consoleOutput(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .flat()
    .map((value) => (value instanceof Error ? value.message : String(value)))
    .join(" ");
}

describe("pantalla principal con sesión autorizada", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza el cotizador y el menú lateral dentro de SidebarProvider", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Buscar producto" })).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="sidebar"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: /Mis cotizaciones/i })).toBeInTheDocument();
    expect(consoleOutput(errorSpy)).not.toContain(SIDEBAR_ERROR);
  });
});
