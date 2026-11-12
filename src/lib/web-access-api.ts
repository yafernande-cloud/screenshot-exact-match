/**
 * Solicitudes de acceso web (G1) contra el backend real.
 *
 * La identidad y la organización las resuelve el backend desde el JWT de Supabase: este módulo
 * nunca las envía. La solicitud no otorga acceso; solo una administradora puede aprobarla.
 */

import { ApiError, apiRequest } from "@/lib/api";

export type EstadoSolicitudWeb =
  "none" | "pending" | "rejected" | "approved" | "removed" | "expired";

export interface EstadoSolicitudAcceso {
  status: EstadoSolicitudWeb;
  requested_at: string | null;
  decided_at: string | null;
}

export interface SolicitudAccesoWeb {
  id: string;
  email: string;
  display_name: string;
  requested_at: string;
  /** Solo lo entrega el backend a la superadministradora. */
  organization: string | null;
}

export interface PendientesWeb {
  pending_count: number;
  items: SolicitudAccesoWeb[];
}

export interface AprobacionWeb {
  request_id: string;
  status: "approved";
  user_id: string;
  display_name: string;
  roles: string[];
  web_access_expires_at: string | null;
}

export interface RechazoWeb {
  request_id: string;
  status: "rejected";
}

/** Persona con autorización web vigente (listado de «Gestión de usuarios»). */
export interface UsuarioWeb {
  user_id: string;
  display_name: string;
  email: string | null;
  roles: string[];
  is_superadmin: boolean;
  /** La propia cuenta: el backend no permite eliminar el acceso propio. */
  is_self: boolean;
  web_access_expires_at: string | null;
  granted_at: string;
}

export interface UsuariosWeb {
  total: number;
  items: UsuarioWeb[];
}

export interface EliminacionAccesoWeb {
  user_id: string;
  display_name: string;
  /** False si la persona ya no tenía autorización (operación idempotente). */
  removed: boolean;
}

const ROLES_ADMINISTRACION = new Set(["admin"]);

/** El backend exige el permiso `manage_web_access`, que hoy solo tiene el rol `admin`. */
export function puedeAdministrarAccesoWeb(roles: string[] | undefined | null): boolean {
  return (roles ?? []).some((rol) => ROLES_ADMINISTRACION.has(rol));
}

/** Mensaje para la persona; nunca expone detalles técnicos del backend. */
export function mensajeDeErrorSolicitud(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "UNAUTHENTICATED":
        return "Tu sesión expiró. Inicia sesión otra vez.";
      case "RATE_LIMITED":
        return "Demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentarlo.";
      case "ACCESS_NOT_CONFIGURED":
      case "UNAVAILABLE":
        return "La solicitud de acceso no está disponible en este momento. Contacta a YF.";
      case "NETWORK":
        return "No pudimos contactar el servidor. Revisa tu conexión e inténtalo otra vez.";
      case "FORBIDDEN":
        return "No tienes permiso para esta acción.";
      case "REQUEST_ALREADY_DECIDED":
        return "La solicitud ya fue resuelta.";
      case "USER_ALREADY_EXISTS":
      case "DUPLICATE_NAME":
      case "USER_ALREADY_HAS_ACCESS":
      case "USER_INACTIVE":
      case "WEB_ADMIN_ROLE_REQUIRED":
        return error.message;
      case "SUPERADMIN_PROTECTED":
      case "CANNOT_REMOVE_SELF":
      case "LAST_WEB_ADMIN":
        return error.message;
      default:
        return error.message || "No pudimos completar la operación. Inténtalo otra vez.";
    }
  }
  return "No pudimos completar la operación. Inténtalo otra vez.";
}

/** Estado de la propia identidad. Solo consulta: no crea ni modifica solicitudes. */
export function consultarEstadoSolicitud(): Promise<EstadoSolicitudAcceso> {
  return apiRequest<EstadoSolicitudAcceso>(
    "/api/v1/web-access-requests/status",
    { headers: { Accept: "application/json" } },
    "No pudimos consultar el estado de tu solicitud.",
  );
}

let solicitudEnCurso: Promise<void> | null = null;

/**
 * Registra la solicitud de la identidad autenticada. El backend es idempotente mientras haya una
 * pendiente; aquí además se comparte la petición en vuelo para que un doble clic no la repita.
 */
export function solicitarAcceso(): Promise<void> {
  if (solicitudEnCurso) return solicitudEnCurso;
  solicitudEnCurso = apiRequest<{ received: boolean }>(
    "/api/v1/web-access-requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    },
    "No pudimos enviar tu solicitud de acceso.",
  )
    .then(() => undefined)
    .finally(() => {
      solicitudEnCurso = null;
    });
  return solicitudEnCurso;
}

/** Bandeja de la campanita: solo administradoras de la organización. */
export function listarSolicitudesPendientes(): Promise<PendientesWeb> {
  return apiRequest<PendientesWeb>(
    "/api/v1/web-access-requests",
    { headers: { Accept: "application/json" } },
    "No pudimos cargar las solicitudes de acceso.",
  );
}

export function aprobarSolicitud(requestId: string): Promise<AprobacionWeb> {
  return apiRequest<AprobacionWeb>(
    `/api/v1/web-access-requests/${requestId}/approve`,
    { method: "POST", headers: { Accept: "application/json" } },
    "No pudimos aprobar la solicitud.",
  );
}

export function rechazarSolicitud(requestId: string, nota?: string): Promise<RechazoWeb> {
  const cuerpo = nota?.trim() ? JSON.stringify({ note: nota.trim() }) : undefined;
  return apiRequest<RechazoWeb>(
    `/api/v1/web-access-requests/${requestId}/reject`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(cuerpo ? { body: cuerpo } : {}),
    },
    "No pudimos rechazar la solicitud.",
  );
}

/** Personas con autorización web vigente de la organización. */
export function listarUsuariosWeb(): Promise<UsuariosWeb> {
  return apiRequest<UsuariosWeb>(
    "/api/v1/admin/users",
    { headers: { Accept: "application/json" } },
    "No pudimos cargar las personas con acceso web.",
  );
}

/** Elimina la autorización web, conservando identidad, Telegram e historial. */
export function eliminarAccesoWeb(userId: string): Promise<EliminacionAccesoWeb> {
  return apiRequest<EliminacionAccesoWeb>(
    `/api/v1/admin/users/${userId}/web-access`,
    { method: "DELETE", headers: { Accept: "application/json" } },
    "No pudimos eliminar el acceso web.",
  );
}
