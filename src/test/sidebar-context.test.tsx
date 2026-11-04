import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarContext } from "@/lib/sidebar-context";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

/** Lee el contexto del menú lateral desde un descendiente cualquiera del proveedor. */
function SidebarProbe() {
  const { state, isMobile } = useSidebar();
  return (
    <output data-testid="sidebar-probe">
      {state}:{String(isMobile)}
    </output>
  );
}

describe("contexto del menú lateral", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("el descendiente del proveedor encuentra su contexto", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarProbe />
      </SidebarProvider>,
    );

    expect(screen.getByTestId("sidebar-probe")).toHaveTextContent("collapsed:false");
  });

  it("mantiene el mismo objeto aunque el módulo se evalúe dos veces (actualización en caliente)", async () => {
    // Mismo escenario que en session-context: Vite reimporta con `?t=…` y las dos instancias
    // conviven. El objeto compartido en globalThis debe seguir siendo el mismo.
    const primera = await import("@/lib/sidebar-context");
    vi.resetModules();
    const segunda = await import("@/lib/sidebar-context");

    expect(primera.SidebarContext).toBe(SidebarContext);
    expect(segunda.SidebarContext).toBe(SidebarContext);
  });
});
