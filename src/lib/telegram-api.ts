/**
 * Cliente de administración de Telegram (backend FastAPI existente).
 *
 * Solo consume el contrato actual: personal (`/staff`), solicitudes de acceso
 * (`/telegram-access-requests`) y teléfonos (`/telegram-accounts`). La identidad, la organización y
 * los permisos los resuelve el backend con el JWT de Supabase; aquí no se decide nada de negocio.
 */

import { apiRequest } from "@/lib/api";

export type ModoTelefono = "personal" | "shared_device";
export type EstadoCuenta = "active" | "blocked";
export type EstadoSolicitud = "pending" | "approved" | "rejected" | "expired";
export type MotivoAusencia = "vacation" | "sick_leave" | "day_off" | "other";

/** Fila de `StaffOut`. */
export interface PersonaStaff {
  id: string;
  display_name: string;
  roles: string[];
  /** Pertenece a la farmacia. Desactivar no elimina su historial. */
  member_active: boolean;
  /** Disponible para reportar (no está de vacaciones, con licencia, etc.). */
  available: boolean;
  absence_reason: MotivoAusencia | null;
  absence_label: string | null;
  absence_note: string | null;
  unavailable_since: string | null;
  /** Baja lógica como auxiliar de Telegram; no afecta su acceso web ni sus roles. */
  telegram_deleted_at?: string | null;
  /** Activa + disponible + con rol que permite reportar. */
  can_report: boolean;
  telegram_session: { active: boolean; expires_at: string | null };
  observations_authored: number;
  created_at: string;
  updated_at: string;
}

export interface CambioStaff {
  staff: PersonaStaff;
  sessions_revoked: number;
}

/** Respuesta de `POST /staff/{id}/delete-auxiliary`: baja lógica, sin borrar historial. */
export interface ResultadoEliminarAuxiliar {
  id: string;
  display_name: string;
  telegram_deleted_at: string;
  /** La baja ya estaba registrada; no se repitió nada. */
  already_deleted: boolean;
  sessions_revoked: number;
  account_links_deactivated: number;
  /** La baja NO altera el acceso web ni los roles de la persona. */
  web_access_preserved: boolean;
}

/** Fila de `AccessRequestOut`. */
export interface SolicitudAcceso {
  id: string;
  external_user_id: string;
  external_chat_id: string;
  status: EstadoSolicitud;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  approved_account_id: string | null;
  approved_by_name: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  rejected_by_name: string | null;
}

export interface CuentaExistente {
  id: string;
  display_label: string;
  branch_label: string | null;
  mode: ModoTelefono;
  access_role: "admin" | "operator";
  status: EstadoCuenta;
  app_user_id: string | null;
}

/** Respuesta de `POST /telegram-access-requests/lookup`. */
export interface ResultadoCodigo {
  request: SolicitudAcceso;
  existing_account: CuentaExistente | null;
  can_approve: boolean;
}

export interface EnlaceChat {
  id: string;
  external_chat_id: string;
  mode: ModoTelefono;
  status: "active" | "inactive";
  created_at: string;
}

/** Fila de `AccountOut`. */
export interface CuentaTelegram {
  id: string;
  external_user_id: string;
  display_label: string;
  branch_label: string | null;
  mode: ModoTelefono;
  access_role: "admin" | "operator";
  status: EstadoCuenta;
  origin: "backfill" | "access_request" | "manual";
  created_from_request_id: string | null;
  app_user_id: string | null;
  app_user_name: string | null;
  person_active: boolean | null;
  person_available: boolean | null;
  bindings: EnlaceChat[];
  created_at: string;
  created_by_name: string | null;
  blocked_at: string | null;
  blocked_by_name: string | null;
  block_reason: string | null;
  reactivated_at: string | null;
  reactivated_by_name: string | null;
}

export interface AuxiliarDeCuenta {
  app_user_id: string;
  display_name: string;
  roles: string[];
  person_active: boolean;
  person_available: boolean;
  can_report: boolean;
  active: boolean;
  created_at: string;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}

export interface AuxiliaresDeCuenta {
  account_id: string;
  mode: ModoTelefono;
  branch_label: string | null;
  app_user_id: string | null;
  auxiliaries: AuxiliarDeCuenta[];
}

export interface CambioAuxiliar {
  account_id: string;
  app_user_id: string;
  active: boolean;
  sessions_revoked: number;
  history_preserved: boolean;
  reactivated?: boolean | null;
}

export interface EntradaHistorial {
  action: string;
  actor_name: string | null;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AprobacionTelefono {
  display_label: string;
  branch_label?: string | null;
  mode: ModoTelefono;
  app_user_id?: string | null;
  access_role?: "admin" | "operator";
  /** Obligatorio (≥1) para un teléfono compartido; prohibido en uno personal. */
  auxiliary_ids?: string[];
}

const LISTA_FALLBACK = "No pudimos cargar la información de Telegram. Inténtalo otra vez.";
const STAFF_FALLBACK = "No pudimos cargar el personal. Inténtalo otra vez.";
const MUTACION_FALLBACK = "No pudimos guardar el cambio. Inténtalo otra vez.";

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ------------------------------------------------------------------ auxiliares

/** Personal completo (incluye inactivas y no disponibles), como lo entrega `GET /staff`. */
export function listarPersonal(includeInactive = true): Promise<PersonaStaff[]> {
  return apiRequest<PersonaStaff[]>(
    `/api/v1/staff?include_inactive=${includeInactive ? "true" : "false"}`,
    {},
    STAFF_FALLBACK,
  );
}

/** Crea una persona con rol `auxiliary`; nunca modifica a otra existente. */
export function crearAuxiliar(displayName: string): Promise<PersonaStaff> {
  return apiRequest<PersonaStaff>(
    "/api/v1/staff",
    json("POST", { display_name: displayName, roles: ["auxiliary"] }),
    "No pudimos crear el auxiliar. Inténtalo otra vez.",
  );
}

export function cambiarActividadPersona(id: string, active: boolean): Promise<CambioStaff> {
  return apiRequest<CambioStaff>(
    `/api/v1/staff/${id}/${active ? "activate" : "deactivate"}`,
    { method: "POST" },
    MUTACION_FALLBACK,
  );
}

/** Cambia la disponibilidad; el motivo es obligatorio al marcarla como no disponible. */
export function cambiarDisponibilidadPersona(
  id: string,
  available: boolean,
  reason?: MotivoAusencia | null,
  note?: string | null,
): Promise<CambioStaff> {
  return apiRequest<CambioStaff>(
    `/api/v1/staff/${id}/availability`,
    json("PUT", { available, reason: available ? null : reason, note: available ? null : note }),
    "No pudimos cambiar la disponibilidad. Inténtalo otra vez.",
  );
}

/**
 * Elimina a la persona como auxiliar de Telegram: baja lógica que cierra sus sesiones y sus
 * vínculos por teléfono. Conserva su historial y su acceso web; no se puede deshacer.
 */
export function eliminarAuxiliar(id: string): Promise<ResultadoEliminarAuxiliar> {
  return apiRequest<ResultadoEliminarAuxiliar>(
    `/api/v1/staff/${id}/delete-auxiliary`,
    { method: "POST" },
    "No pudimos eliminar al auxiliar. Inténtalo otra vez.",
  );
}

// ------------------------------------------------------------------ solicitudes

export function listarSolicitudes(status?: EstadoSolicitud): Promise<SolicitudAcceso[]> {
  const params = status ? `?status=${status}` : "";
  return apiRequest<SolicitudAcceso[]>(
    `/api/v1/telegram-access-requests${params}`,
    {},
    "No pudimos cargar las solicitudes de acceso. Inténtalo otra vez.",
  );
}

export function buscarSolicitudPorCodigo(codigo: string): Promise<ResultadoCodigo> {
  return apiRequest<ResultadoCodigo>(
    "/api/v1/telegram-access-requests/lookup",
    json("POST", { code: codigo }),
    "No pudimos buscar el código. Inténtalo otra vez.",
  );
}

/**
 * Aprueba y habilita el teléfono en UNA sola llamada. En un teléfono compartido los auxiliares
 * viajan en `auxiliary_ids`; en uno personal se usa `app_user_id` y no se envían auxiliares.
 */
export function aprobarSolicitud(
  requestId: string,
  body: AprobacionTelefono,
): Promise<CuentaTelegram> {
  return apiRequest<CuentaTelegram>(
    `/api/v1/telegram-access-requests/${requestId}/approve`,
    json("POST", body),
    "No pudimos aprobar la solicitud. Inténtalo otra vez.",
  );
}

export function rechazarSolicitud(
  requestId: string,
  reason?: string | null,
): Promise<SolicitudAcceso> {
  return apiRequest<SolicitudAcceso>(
    `/api/v1/telegram-access-requests/${requestId}/reject`,
    json("POST", { reason: reason?.trim() || null }),
    "No pudimos rechazar la solicitud. Inténtalo otra vez.",
  );
}

// ------------------------------------------------------------------ teléfonos

export function listarCuentasTelegram(): Promise<CuentaTelegram[]> {
  return apiRequest<CuentaTelegram[]>("/api/v1/telegram-accounts", {}, LISTA_FALLBACK);
}

/** Edita nombre y sucursal en un solo PATCH; no cambia modo, estado ni auxiliares. */
export function editarCuenta(
  id: string,
  cambios: { display_label: string; branch_label: string | null },
): Promise<CuentaTelegram> {
  return apiRequest<CuentaTelegram>(
    `/api/v1/telegram-accounts/${id}`,
    json("PATCH", cambios),
    "No pudimos guardar los datos del teléfono. Inténtalo otra vez.",
  );
}

export function bloquearCuenta(id: string, reason?: string | null): Promise<unknown> {
  return apiRequest(
    `/api/v1/telegram-accounts/${id}/block`,
    json("POST", { reason: reason?.trim() || null }),
    "No pudimos bloquear el teléfono. Inténtalo otra vez.",
  );
}

export function reactivarCuenta(id: string, reason?: string | null): Promise<CuentaTelegram> {
  return apiRequest<CuentaTelegram>(
    `/api/v1/telegram-accounts/${id}/reactivate`,
    json("POST", { reason: reason?.trim() || null }),
    "No pudimos reactivar el teléfono. Inténtalo otra vez.",
  );
}

export function historialCuenta(id: string): Promise<EntradaHistorial[]> {
  return apiRequest<EntradaHistorial[]>(
    `/api/v1/telegram-accounts/${id}/history`,
    {},
    "No pudimos cargar el historial del teléfono. Inténtalo otra vez.",
  );
}

export function listarAuxiliaresDeCuenta(id: string): Promise<AuxiliaresDeCuenta> {
  return apiRequest<AuxiliaresDeCuenta>(
    `/api/v1/telegram-accounts/${id}/auxiliaries`,
    {},
    "No pudimos cargar los auxiliares del teléfono. Inténtalo otra vez.",
  );
}

/** Habilita o reactiva una persona SOLO en ese teléfono; no vuelve a aprobarlo ni crea solicitudes. */
export function asociarAuxiliar(id: string, appUserId: string): Promise<CambioAuxiliar> {
  return apiRequest<CambioAuxiliar>(
    `/api/v1/telegram-accounts/${id}/auxiliaries`,
    json("POST", { app_user_id: appUserId }),
    "No pudimos asociar el auxiliar. Inténtalo otra vez.",
  );
}

export function desasociarAuxiliar(
  id: string,
  appUserId: string,
  reason?: string | null,
): Promise<CambioAuxiliar> {
  return apiRequest<CambioAuxiliar>(
    `/api/v1/telegram-accounts/${id}/auxiliaries/${appUserId}/deactivate`,
    json("POST", { reason: reason?.trim() || null }),
    "No pudimos dar de baja al auxiliar. Inténtalo otra vez.",
  );
}
