/**
 * Cliente HTTP del backend comercial (FastAPI). Solo adjunta el JWT de Supabase: la identidad y
 * los permisos los resuelve el backend, nunca este archivo.
 */

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

async function errorBody(response: Response): Promise<{ code: string; message: string }> {
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
  return { code: "UNEXPECTED", message: "No pudimos validar tu acceso. Inténtalo otra vez." };
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
  const { code, message } = await errorBody(response);
  throw new ApiError(response.status, code, message);
}
