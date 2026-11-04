import { render, screen, waitFor } from "@testing-library/react";
import { Component, useContext, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext } from "@/lib/session-context";
import { SessionProvider, useSession } from "@/lib/session";

/** Lee la sesión y, a la vez, comprueba que el hook usa este mismo objeto de contexto. */
function SessionProbe() {
  const session = useSession();
  const raw = useContext(SessionContext);
  return (
    <output data-testid="session-probe">{raw === null ? "sin-contexto" : session.status}</output>
  );
}

/** Captura el error que React lanza al montar un consumidor fuera del proveedor. */
class ContextErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch() {
    // El error ya queda reflejado en el estado; no hace falta registrarlo otra vez.
  }

  override render() {
    return this.state.message ? (
      <output data-testid="context-error">{this.state.message}</output>
    ) : (
      this.props.children
    );
  }
}

describe("contexto de sesión", () => {
  beforeEach(() => {
    // React registra los errores de render en consola y el proveedor avisa de la configuración
    // faltante; aquí solo interesa el comportamiento, no el ruido de la consola de pruebas.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reproduce el error cuando un consumidor queda fuera de SessionProvider", () => {
    render(
      <ContextErrorBoundary>
        <SessionProbe />
      </ContextErrorBoundary>,
    );

    expect(screen.getByTestId("context-error")).toHaveTextContent(
      "useSession debe usarse dentro de SessionProvider.",
    );
  });

  it("comparte el mismo objeto de contexto entre el proveedor y useSession", async () => {
    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );

    // Si el proveedor y el hook usaran contextos distintos, el sondeo leería `null`.
    expect(screen.getByTestId("session-probe")).not.toHaveTextContent("sin-contexto");
    // Con la configuración pública de Supabase el contexto arranca y, sin sesión guardada,
    // el estado termina en "signed_out".
    await waitFor(() =>
      expect(screen.getByTestId("session-probe")).toHaveTextContent("signed_out"),
    );
  });

  it("mantiene el mismo objeto aunque el módulo se evalúe dos veces (actualización en caliente)", async () => {
    // Vite reimporta el módulo cambiado con `?t=…` y la instancia nueva convive con la anterior,
    // que siguen usando los módulos que no cambiaron. Simulamos esa doble evaluación.
    const primera = await import("@/lib/session-context");
    vi.resetModules();
    const segunda = await import("@/lib/session-context");

    expect(primera.SessionContext).toBe(SessionContext);
    expect(segunda.SessionContext).toBe(SessionContext);
  });
});
