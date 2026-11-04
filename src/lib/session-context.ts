import { createContext } from "react";

import type { MeProfile } from "@/lib/api";
import type { AuthStatus } from "@/lib/auth";

/**
 * Objeto de contexto de la sesión.
 *
 * Vive en este módulo —sin componentes— para que su identidad nunca cambie cuando se reevalúa
 * `session.tsx` (por ejemplo, con una actualización en caliente del preview). Si el contexto se
 * creara dentro de `session.tsx`, una recarga parcial podría dejar al proveedor montado y a los
 * consumidores usando dos objetos distintos, y `useSession()` fallaría aunque el árbol de React
 * fuera el correcto.
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

export const SessionContext = createContext<SessionContextValue | null>(null);
