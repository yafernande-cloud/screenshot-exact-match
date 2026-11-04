import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

/**
 * Monta el router real (shell, componente raíz, proveedor de sesión y rutas) para comprobar que
 * `useSession()` siempre encuentra su proveedor, tanto al abrir `/login` directamente como al
 * navegar desde otra ruta.
 */

const CONTEXT_ERROR = "useSession debe usarse dentro de SessionProvider.";

function makeRouter(initialPath: string) {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

async function renderAt(path: string) {
  const router = makeRouter(path);
  await router.load();
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

/** Junta todo lo que React escribió en consola para detectar el fallo aunque no lance. */
function consoleOutput(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .flat()
    .map((value) => (value instanceof Error ? value.message : String(value)))
    .join(" ");
}

describe("montaje real del router en /login", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // RootShell renderiza <html> dentro del contenedor de pruebas y el proveedor avisa de la
    // configuración de Supabase ausente; se silencian, pero se inspeccionan después.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza /login directamente dentro del proveedor de sesión", async () => {
    await renderAt("/login");

    expect(
      await screen.findByRole("heading", { name: "Cotizador Inteligente Farmacia" }),
    ).toBeInTheDocument();
    // Con la configuración pública de Supabase el inicio de sesión queda habilitado.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continuar con google/i })).toBeEnabled(),
    );
    expect(screen.queryByText(/todavía no está disponible/i)).not.toBeInTheDocument();
    expect(consoleOutput(errorSpy)).not.toContain(CONTEXT_ERROR);
  });

  it("navega desde la raíz a /login sin salir del proveedor", async () => {
    const { router } = await renderAt("/");

    // Sin sesión guardada, la portada protegida redirige al login dentro del mismo proveedor.
    expect(
      await screen.findByRole("heading", { name: "Cotizador Inteligente Farmacia" }),
    ).toBeInTheDocument();

    await act(async () => {
      await router.navigate({ to: "/login" });
    });

    expect(
      await screen.findByRole("button", { name: /continuar con google/i }),
    ).toBeInTheDocument();
    expect(consoleOutput(errorSpy)).not.toContain(CONTEXT_ERROR);
  });
});
