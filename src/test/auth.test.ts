import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import {
  PROTECTED_PATHS,
  gateFor,
  isProtectedPath,
  messageForOAuthError,
  messageForPasswordError,
  normalizePath,
  oauthErrorFromLocation,
  pideSolicitudAcceso,
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

describe("solicitud de acceso de una identidad sin autorización", () => {
  it("solo abre el flujo con los códigos que una solicitud puede resolver", () => {
    for (const code of ["USER_NOT_PROVISIONED", "WEB_ACCESS_REQUIRED", "WEB_ACCESS_EXPIRED"]) {
      expect(pideSolicitudAcceso(code)).toBe(true);
    }
    for (const code of [
      "EMAIL_NOT_VERIFIED",
      "EMAIL_REQUIRED",
      "UNAUTHENTICATED",
      "USER_INACTIVE",
      "UNEXPECTED",
      "",
      null,
      undefined,
    ]) {
      expect(pideSolicitudAcceso(code)).toBe(false);
    }
  });
});

describe("errores de correo + contraseña", () => {
  it("no revela si el correo existe: credenciales inválidas y usuario inexistente dicen lo mismo", () => {
    const credenciales = messageForPasswordError({ code: "invalid_credentials", status: 400 });
    const inexistente = messageForPasswordError({ code: "user_not_found", status: 400 });
    expect(credenciales).toContain("Correo o contraseña incorrectos");
    expect(inexistente).toBe(credenciales);
  });

  it("reconoce el mensaje del SDK cuando no viene un código estable", () => {
    expect(
      messageForPasswordError({ message: "Invalid login credentials", status: 400 }),
    ).toContain("Correo o contraseña incorrectos");
  });

  it("explica que el correo no está confirmado", () => {
    expect(messageForPasswordError({ code: "email_not_confirmed", status: 400 })).toContain(
      "todavía no está confirmado",
    );
  });

  it("pide esperar cuando hay demasiados intentos", () => {
    expect(messageForPasswordError({ code: "over_request_rate_limit", status: 429 })).toContain(
      "Demasiados intentos",
    );
    expect(messageForPasswordError({ status: 429 })).toContain("Demasiados intentos");
  });

  it("distingue un problema de conexión de un error del servicio", () => {
    expect(messageForPasswordError({ name: "AuthRetryableFetchError", status: 0 })).toContain(
      "No pudimos conectar",
    );
    expect(messageForPasswordError({ status: 503, message: "Service unavailable" })).toContain(
      "tuvo un problema",
    );
  });

  it("usa un mensaje genérico para lo desconocido, incluso sin objeto de error", () => {
    const generico = "No pudimos iniciar sesión. Inténtalo otra vez.";
    expect(messageForPasswordError(undefined)).toBe(generico);
    expect(messageForPasswordError({ code: "otro" })).toBe(generico);
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
