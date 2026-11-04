/**
 * Cliente HTTP del backend comercial (FastAPI). Solo adjunta el JWT de Supabase: la identidad y
 * los permisos los resuelve el backend, nunca este archivo.
 */

import { getSupabase } from "@/lib/supabase";

const DEFAULT_API_URL = "https://cotizador-farmacia-demo-3ea67af09b39.herokuapp.com";

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Base del backend, sin barra final. `VITE_API_URL` tiene prioridad sobre el valor de demostración. */
export const API_URL = (env("VITE_API_URL") ?? DEFAULT_API_URL).replace(/\/+$/, "");

export interface MeProfile {
  id: string;
  display_name: string;
  roles: string[];
  organization_id: string;
  organization_kind: string;
  is_superadmin: boolean;
  web_access_expires_at: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function errorBody(
  response: Response,
  fallback: string,
): Promise<{ code: string; message: string }> {
  try {
    const data = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    const code = data.error?.code;
    const message = data.error?.message;
    if (typeof code === "string" && typeof message === "string") return { code, message };
  } catch {
    // El cuerpo no era JSON; se usa un mensaje genérico.
  }
  if (response.status === 503) {
    return { code: "UNAVAILABLE", message: "El servidor no está disponible en este momento." };
  }
  return { code: "UNEXPECTED", message: fallback };
}

async function request(path: string, token: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      "No pudimos contactar el servidor. Revisa tu conexión e inténtalo otra vez.",
    );
  }
}

/** Perfil autorizado de la persona (identidad, roles y organización salen del backend). */
export async function fetchMe(token: string): Promise<MeProfile> {
  const response = await request("/api/v1/me", token);
  if (response.ok) return (await response.json()) as MeProfile;
  const { code, message } = await errorBody(
    response,
    "No pudimos validar tu acceso. Inténtalo otra vez.",
  );
  throw new ApiError(response.status, code, message);
}

const SESION_EXPIRADA = "Tu sesión expiró. Inicia sesión otra vez.";

/** Token vigente del único cliente de Supabase; nunca se guarda ni se expone fuera de este módulo. */
async function accessToken(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new ApiError(401, "UNAUTHENTICATED", SESION_EXPIRADA);
  return token;
}

/** Un único intento de refresco; si falla, la sesión se cierra con el flujo de autenticación existente. */
async function refreshedToken(): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().auth.refreshSession();
    return !error && data.session ? data.session.access_token : null;
  } catch {
    return null;
  }
}

/**
 * Llamada autenticada al backend. Renueva el token una vez si expiró y, si el backend sigue
 * rechazando la identidad, cierra la sesión para que el proveedor de sesión y la protección de
 * rutas hagan su trabajo. Los errores se normalizan a `ApiError` con mensajes para la persona.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  fallbackMessage = "No pudimos completar la solicitud. Inténtalo otra vez.",
): Promise<T> {
  const token = await accessToken();
  let response = await request(path, token, init);
  if (response.status === 401) {
    const renewed = await refreshedToken();
    if (renewed) response = await request(path, renewed, init);
    if (response.status === 401) {
      try {
        await getSupabase().auth.signOut();
      } catch {
        // La sesión local se descarta igual mediante el evento de autenticación.
      }
      throw new ApiError(401, "UNAUTHENTICATED", SESION_EXPIRADA);
    }
  }
  if (!response.ok) {
    const { code, message } = await errorBody(response, fallbackMessage);
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}
