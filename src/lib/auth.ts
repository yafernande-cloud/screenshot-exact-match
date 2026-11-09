/**
 * Decisiones puras de autenticación: qué rutas exigen sesión, qué debe mostrarse según el estado
 * y cómo traducir los errores de OAuth. Sin React ni acceso al navegador, para poder probarlas.
 */

export type AuthStatus =
  /** Todavía no se sabe si hay sesión (SSR o primera carga). */
  | "loading"
  /** Sin sesión de Supabase. */
  | "signed_out"
  /** Sesión válida y persona habilitada en el backend. */
  | "authorized"
  /** Autenticada en Supabase pero sin `app_user` habilitado (403). */
  | "not_provisioned"
  /** No se pudo validar (red, servidor o configuración). */
  | "error";

export const PROTECTED_PATHS = [
  "/",
  "/mis-cotizaciones",
  "/historial",
  "/proveedores",
  "/telegram",
] as const;

/** `/historial/` y `/historial` son la misma ruta a efectos de protección. */
export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function isProtectedPath(pathname: string): boolean {
  return (PROTECTED_PATHS as readonly string[]).includes(normalizePath(pathname));
}

/** Qué hace el shell: cargar, redirigir al login, mostrar bloqueo o renderizar la app. */
export type Gate = "loading" | "redirect_login" | "blocked" | "render";

export function gateFor(status: AuthStatus, pathname: string): Gate {
  // `/login` es la única superficie pública; también se renderiza con una sesión ya válida
  // (la propia pantalla redirige al dashboard).
  if (normalizePath(pathname) === "/login") return status === "loading" ? "loading" : "render";
  if (status === "authorized") return "render";
  if (status === "loading") return "loading";
  if (status === "signed_out") return "redirect_login";
  return "blocked";
}

/**
 * Forma mínima de un error de Supabase Auth. No se depende del tipo concreto del SDK para que
 * esta decisión siga siendo pura y comprobable sin red.
 */
export interface PasswordAuthErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Mensaje para un fallo de correo + contraseña.
 *
 * No distingue si el correo existe (`invalid_credentials` y `user_not_found` reciben el mismo
 * mensaje) para no revelar qué cuentas están dadas de alta. Los casos que la persona sí puede
 * resolver —contraseña incorrecta, correo sin confirmar, demasiados intentos, sin conexión— se
 * informan por separado.
 */
export function messageForPasswordError(error: unknown): string {
  const candidate: PasswordAuthErrorLike =
    typeof error === "object" && error !== null ? (error as PasswordAuthErrorLike) : {};
  const code = asText(candidate.code);
  const message = asText(candidate.message);
  const name = asText(candidate.name);
  const status = typeof candidate.status === "number" ? candidate.status : null;

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Tu correo todavía no está confirmado. Contacta a YF para completar el acceso.";
  }
  if (code === "invalid_email" || code === "email_address_invalid") {
    return "Escribe un correo electrónico válido.";
  }
  if (
    code === "invalid_credentials" ||
    code === "user_not_found" ||
    message.includes("invalid login credentials")
  ) {
    return "Correo o contraseña incorrectos. Revísalos e inténtalo otra vez.";
  }
  if (
    code === "too_many_requests" ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    status === 429
  ) {
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.";
  }
  if (status === 0 || name === "authretryablefetcherror" || message.includes("fetch")) {
    return "No pudimos conectar con el servicio de inicio de sesión. Revisa tu conexión e inténtalo otra vez.";
  }
  if (status !== null && status >= 500) {
    return "El servicio de inicio de sesión tuvo un problema. Espera un momento y reinténtalo.";
  }
  return "No pudimos iniciar sesión. Inténtalo otra vez.";
}

/** Mensaje comprensible para errores que Supabase devuelve en la URL al volver de Google. */
export function messageForOAuthError(code: string, description?: string | null): string {
  if (code === "access_denied") {
    return "Cancelaste el inicio de sesión con Google. Puedes intentarlo de nuevo.";
  }
  if (code === "invalid_request") {
    return "Google no pudo completar el inicio de sesión. Inténtalo otra vez.";
  }
  if (code === "server_error") {
    return "El proveedor de identidad tuvo un problema. Espera un momento y reintenta.";
  }
  if (description && description.trim() !== "") {
    return "No pudimos iniciar sesión con Google. Inténtalo otra vez.";
  }
  return "No pudimos iniciar sesión con Google. Inténtalo otra vez.";
}

/**
 * Extrae el error de OAuth que Supabase deja en la URL (`?error=...` o `#error=...`).
 * Devuelve `null` cuando no hay error o cuando la URL trae un código de intercambio válido.
 */
export function oauthErrorFromLocation(search: string, hash: string): string | null {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const code =
    query.get("error_code") ??
    query.get("error") ??
    fragment.get("error_code") ??
    fragment.get("error");
  if (!code) return null;
  const description = query.get("error_description") ?? fragment.get("error_description");
  return messageForOAuthError(code, description);
}
