import { createContext, type Context } from "react";

import type { MeProfile } from "@/lib/api";
import type { AuthStatus } from "@/lib/auth";

/**
 * Objeto de contexto de la sesión.
 *
 * Vive en este módulo —sin componentes— y se registra en `globalThis` con `Symbol.for` para que
 * exista **un único objeto por página**, aunque el runtime evalúe este módulo más de una vez.
 *
 * Vite resuelve una actualización en caliente reimportando el módulo cambiado con `?t=…`: la
 * instancia nueva convive con la anterior, que siguen usando los módulos que no cambiaron. En ese
 * estado mixto, `SessionProvider` (instancia nueva) y `useSession` (instancia anterior) podían
 * leer dos objetos distintos y el hook fallaba aunque el árbol de React fuera el correcto.
 * Compartir el objeto en `globalThis` elimina esa diferencia de identidad sin simular un contexto:
 * si de verdad no hay proveedor arriba, el hook sigue lanzando el mismo error.
 */

export interface SessionError {
  code: string;
  message: string;
}

export interface SessionContextValue {
  status: AuthStatus;
  /** Perfil autorizado devuelto por `GET /api/v1/me`; nunca se inventa en el frontend. */
  profile: MeProfile | null;
  error: SessionError | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}

type SessionContextType = Context<SessionContextValue | null>;

const CONTEXT_KEY = Symbol.for("cotizador-farmacia.session-context");

function sharedSessionContext(): SessionContextType {
  const registry = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const existing = registry[CONTEXT_KEY];
  if (existing) return existing as SessionContextType;

  const created = createContext<SessionContextValue | null>(null);
  registry[CONTEXT_KEY] = created;
  return created;
}

export const SessionContext = sharedSessionContext();
