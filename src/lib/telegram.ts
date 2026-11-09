/**
 * Reglas de presentación de la administración de Telegram.
 *
 * Todo es función pura: no decide permisos reales (los resuelve el backend) ni inventa datos.
 * Convierte las respuestas de la API en etiquetas que Pao, Danny o Julio pueden entender sin
 * conocer códigos internos.
 */

import { ApiError } from "@/lib/api";
import type {
  CuentaTelegram,
  EstadoCuenta,
  EstadoSolicitud,
  ModoTelefono,
  MotivoAusencia,
  PersonaStaff,
} from "@/lib/telegram-api";

/** Roles que el backend considera capaces de reportar faltantes. */
export const ROLES_QUE_REPORTAN = ["auxiliary", "purchasing"] as const;

export const MOTIVOS_AUSENCIA: { value: MotivoAusencia; label: string }[] = [
  { value: "vacation", label: "Vacaciones" },
  { value: "sick_leave", label: "Licencia médica" },
  { value: "day_off", label: "Día libre" },
  { value: "other", label: "Otro motivo" },
];

const LABEL_MOTIVO: Record<MotivoAusencia, string> = {
  vacation: "Vacaciones",
  sick_leave: "Licencia médica",
  day_off: "Día libre",
  other: "Otro motivo",
};

const LABEL_MODO: Record<ModoTelefono, string> = {
  personal: "Personal",
  shared_device: "Compartido",
};

const LABEL_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  active: "Activo",
  blocked: "Bloqueado",
};

const LABEL_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
};

const LABEL_HISTORIAL: Record<string, string> = {
  "telegram_account.authorized": "Teléfono autorizado",
  "telegram_account.updated": "Datos del teléfono actualizados",
  "telegram_account.blocked": "Teléfono bloqueado",
  "telegram_account.reactivated": "Teléfono reactivado",
  "telegram_account.auxiliary_added": "Auxiliar habilitado en el teléfono",
  "telegram_account.auxiliary_reactivated": "Auxiliar reactivado en el teléfono",
  "telegram_account.auxiliary_deactivated": "Auxiliar dado de baja del teléfono",
  "telegram_access_request.approved": "Solicitud aprobada",
  "telegram_access_request.rejected": "Solicitud rechazada",
  "telegram_access_request.created": "Solicitud recibida",
  "telegram_access_request.expired": "Solicitud vencida",
  "telegram_access_request.code_renewed": "Código renovado",
  "channel_binding.revoked": "Chat desvinculado",
  "channel_binding.reactivated": "Chat rehabilitado",
};

/** La pantalla completa es solo para quien administra; el backend igual valida cada operación. */
export function puedeAdministrarTelegram(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes("admin");
}

/** Normaliza para comparar nombres sin distinguir mayúsculas, tildes ni espacios repetidos. */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/** Persona activa de la farmacia con un rol que permite reportar (auxiliar o compras). */
export function tieneRolQueReporta(roles: string[]): boolean {
  return roles.some((rol) => (ROLES_QUE_REPORTAN as readonly string[]).includes(rol));
}

/** Eliminada como auxiliar de Telegram: no se lista, no se ofrece ni se puede rehabilitar. */
export function estaEliminada(persona: PersonaStaff): boolean {
  return Boolean(persona.telegram_deleted_at);
}

/** Personal operativo, incluidas las personas desactivadas o no disponibles. */
export function personalOperativo(staff: PersonaStaff[]): PersonaStaff[] {
  return staff.filter((p) => !estaEliminada(p) && tieneRolQueReporta(p.roles));
}

/** Auxiliares activos y disponibles: quienes el backend aceptará habilitar en un teléfono. */
export function auxiliaresSeleccionables(staff: PersonaStaff[]): PersonaStaff[] {
  return staff.filter(
    (p) => !estaEliminada(p) && p.member_active && p.can_report && tieneRolQueReporta(p.roles),
  );
}

/** Busca una persona activa con el mismo nombre normalizado; sirve para avisar antes de duplicar. */
export function personaConNombre(staff: PersonaStaff[], nombre: string): PersonaStaff | undefined {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return undefined;
  return staff.find((p) => !estaEliminada(p) && normalizarNombre(p.display_name) === buscado);
}

export function etiquetaAusencia(reason: MotivoAusencia | null): string {
  return reason ? LABEL_MOTIVO[reason] : "";
}

export function etiquetaModo(mode: ModoTelefono): string {
  return LABEL_MODO[mode];
}

export function etiquetaEstadoCuenta(status: EstadoCuenta): string {
  return LABEL_ESTADO_CUENTA[status];
}

export function etiquetaEstadoSolicitud(status: EstadoSolicitud): string {
  return LABEL_ESTADO_SOLICITUD[status];
}

export function etiquetaHistorial(action: string): string {
  return LABEL_HISTORIAL[action] ?? action.replace(/[._]/g, " ");
}

/** Estado legible de una persona, incluyendo por qué no puede reportar. */
export function describirPersona(persona: PersonaStaff): string {
  if (!persona.member_active) return "Desactivada";
  if (!persona.available) {
    const motivo = etiquetaAusencia(persona.absence_reason);
    return motivo ? `No disponible · ${motivo}` : "No disponible";
  }
  return "Disponible";
}

/** Fecha y hora en la zona de la farmacia; si el dato viene mal, no muestra una fecha inventada. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(fecha);
}

/** Texto corto para la tarjeta de un teléfono, sin exponer IDs internos. */
export function resumenCuenta(cuenta: CuentaTelegram): string {
  const partes = [etiquetaModo(cuenta.mode), cuenta.branch_label?.trim() || "Sin sucursal"];
  if (cuenta.mode === "personal") {
    partes.push(cuenta.app_user_name ?? "Sin persona ligada");
  }
  return partes.join(" · ");
}

const MENSAJES: Record<string, string> = {
  DUPLICATE_NAME:
    "Ya existe una persona activa con ese nombre. Revisa la lista antes de crear otra.",
  PERSON_INACTIVE: "Esa persona está desactivada en la farmacia. Actívala primero en Auxiliares.",
  PERSON_CANNOT_REPORT:
    "Esa persona no puede reportar: está desactivada, no está disponible o no tiene un rol de auxiliar.",
  PERSON_DELETED:
    "Esa persona fue eliminada como auxiliar y no puede habilitarse de nuevo. Crea una persona nueva si corresponde.",
  AUXILIARY_ALREADY_ENABLED: "Esa persona ya está habilitada en este teléfono.",
  AUXILIARY_NOT_ENABLED: "Esa persona no está habilitada en este teléfono.",
  ACCOUNT_NOT_SHARED: "Este teléfono es personal y no usa auxiliares.",
  AUXILIARY_REQUIRED: "Selecciona al menos un auxiliar para un teléfono compartido.",
  PERSON_REQUIRED: "Selecciona la persona que quedará ligada a este teléfono personal.",
  PERSONAL_WITH_AUXILIARIES: "Un teléfono personal no lleva auxiliares.",
  SHARED_WITHOUT_PERSON: "Un teléfono compartido no se liga a una sola persona.",
  ABSENCE_REASON_REQUIRED: "Indica el motivo por el que la persona no está disponible.",
  NOTHING_TO_UPDATE: "No hay cambios para guardar.",
  REQUEST_NOT_PENDING: "Esa solicitud ya no está pendiente. Actualiza la lista.",
  INVALID_ACCESS_CODE: "El código no es válido o ya venció. Pide uno nuevo desde el bot.",
  TOO_MANY_ATTEMPTS: "Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.",
  LABEL_REQUIRED: "Escribe un nombre para el teléfono.",
  ACCOUNT_WITHOUT_CHAT:
    "Este teléfono no tiene un chat privado previo. Pide una solicitud nueva desde el bot.",
  CHAT_ALREADY_AUTHORIZED: "Ese chat ya está autorizado por otro teléfono.",
  ACCOUNT_ALREADY_AUTHORIZED: "Ese teléfono ya está autorizado. Revisa la lista de teléfonos.",
};

/** Traduce errores del backend a una explicación útil; nunca inventa un éxito. */
export function mensajeDeErrorTelegram(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return error.message;
    if (error.status === 401) return "Tu sesión expiró. Inicia sesión otra vez.";
    if (error.status === 403) {
      return "No tienes permiso para administrar Telegram. Pídeselo a una administradora.";
    }
    const propio = MENSAJES[error.code];
    if (propio) return propio;
    return error.message || fallback;
  }
  return fallback;
}
