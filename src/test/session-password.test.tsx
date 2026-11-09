import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMe, type MeProfile } from "@/lib/api";
import { messageForPasswordError } from "@/lib/auth";
import { SessionProvider, useSession } from "@/lib/session";

/**
 * Comprueba el método del proveedor de sesión: Supabase valida correo + contraseña y el backend
 * decide si la persona está habilitada. Se sustituyen el cliente de Supabase y `fetchMe` para no
 * tocar la red.
 */

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseIsConfigured: () => true,
  logSupabaseConfigIssue: () => {},
  getSupabase: () => ({ auth: authMock }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, fetchMe: vi.fn() };
});

const PROFILE: MeProfile = {
  id: "u-1",
  display_name: "Profesor Demo",
  roles: ["admin"],
  organization_id: "org-1",
  organization_kind: "real_test",
  is_superadmin: false,
  web_access_expires_at: null,
};

function PasswordProbe() {
  const session = useSession();
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <div>
      <output data-testid="status">{session.status}</output>
      <output data-testid="failure">{failure ?? ""}</output>
      <button
        type="button"
        onClick={() => {
          setFailure(null);
          void session
            .signInWithPassword("  profesor@demo.cl  ", "clave-demo")
            .catch((error) => setFailure(messageForPasswordError(error)));
        }}
      >
        entrar
      </button>
    </div>
  );
}

function renderProvider() {
  render(
    <SessionProvider>
      <PasswordProbe />
    </SessionProvider>,
  );
}

describe("signInWithPassword en el proveedor de sesión", () => {
  beforeEach(() => {
    authMock.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    authMock.onAuthStateChange
      .mockReset()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    authMock.signInWithPassword.mockReset();
    authMock.refreshSession.mockReset();
    authMock.signInWithOAuth.mockReset();
    authMock.signOut.mockReset();
    vi.mocked(fetchMe).mockReset();
  });

  it("valida la sesión creada por Supabase contra el backend", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token-demo" }, user: { id: "sub-1" } },
      error: null,
    });
    vi.mocked(fetchMe).mockResolvedValue(PROFILE);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));

    fireEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authorized"));
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: "profesor@demo.cl",
      password: "clave-demo",
    });
    expect(fetchMe).toHaveBeenCalledWith("token-demo");
  });

  it("propaga el error de Supabase y no deja la sesión como autorizada", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));

    fireEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() =>
      expect(screen.getByTestId("failure")).toHaveTextContent("Correo o contraseña incorrectos"),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("signed_out");
    expect(fetchMe).not.toHaveBeenCalled();
  });
});
