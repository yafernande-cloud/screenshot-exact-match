import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import {
  PROTECTED_PATHS,
  gateFor,
  isProtectedPath,
  messageForOAuthError,
  normalizePath,
  oauthErrorFromLocation,
  type AuthStatus,
} from "@/lib/auth";

function router() {
  return createRouter({ routeTree, context: { queryClient: new QueryClient() } });
}

describe("rutas de autenticación", () => {
  it("expone /login como ruta propia", () => {
    expect(router().matchRoutes("/login").at(-1)?.routeId).toBe("/login");
  });

  it.each(PROTECTED_PATHS)("mantiene disponible %s detrás de la autenticación", (path) => {
    expect(router().matchRoutes(path).at(-1)?.routeId).toBe(path);
  });
});

describe("protección de rutas", () => {
  it.each(["/", "/mis-cotizaciones", "/historial", "/proveedores", "/telegram"])(
    "exige sesión en %s",
    (path) => {
      expect(isProtectedPath(path)).toBe(true);
    },
  );

  it("acepta la barra final como la misma ruta", () => {
    expect(normalizePath("/historial/")).toBe("/historial");
    expect(normalizePath("/")).toBe("/");
    expect(isProtectedPath("/proveedores/")).toBe(true);
  });

  it("no protege /login ni rutas desconocidas", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/no-existe")).toBe(false);
  });

  it.each<[AuthStatus, string, string]>([
    ["loading", "/", "loading"],
    ["signed_out", "/", "redirect_login"],
    ["authorized", "/", "render"],
    ["not_provisioned", "/", "blocked"],
    ["error", "/proveedores", "blocked"],
    ["signed_out", "/ruta-desconocida", "redirect_login"],
    ["authorized", "/ruta-desconocida", "render"],
    ["authorized", "/login", "render"],
    ["signed_out", "/login", "render"],
    ["loading", "/login", "loading"],
  ])("estado %s en %s → %s", (status, path, expected) => {
    expect(gateFor(status, path)).toBe(expected);
  });
});

describe("errores de OAuth", () => {
  it("reconoce la cancelación del usuario", () => {
    expect(
      oauthErrorFromLocation("?error=access_denied&error_description=User+denied", ""),
    ).toContain("Cancelaste");
  });

  it("lee el error del fragmento de la URL", () => {
    expect(oauthErrorFromLocation("", "#error=server_error")).toContain("proveedor de identidad");
  });

  it("no inventa errores cuando la URL trae el código de intercambio", () => {
    expect(oauthErrorFromLocation("?code=abc123", "")).toBeNull();
    expect(oauthErrorFromLocation("", "")).toBeNull();
  });

  it("traduce códigos desconocidos a un mensaje comprensible", () => {
    expect(messageForOAuthError("whatever", "detalle técnico")).toBe(
      "No pudimos iniciar sesión con Google. Inténtalo otra vez.",
    );
  });
});
