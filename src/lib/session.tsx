import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { ApiError, fetchMe, type MeProfile } from "@/lib/api";
import type { AuthStatus } from "@/lib/auth";
import { getSupabase, supabaseIsConfigured } from "@/lib/supabase";

export interface SessionError {
  code: string;
  message: string;
}

interface SessionContextValue {
  status: AuthStatus;
  /** Perfil autorizado devuelto por `GET /api/v1/me`; nunca se inventa en el frontend. */
  profile: MeProfile | null;
  error: SessionError | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}

interface SessionState {
  status: AuthStatus;
  profile: MeProfile | null;
  error: SessionError | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const NOT_CONFIGURED: SessionError = {
  code: "AUTH_NOT_CONFIGURED",
  message:
    "La autenticación no está configurada en este entorno. Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
};

const NOT_PROVISIONED: SessionError = {
  code: "USER_NOT_PROVISIONED",
  message: "Tu cuenta de Google todavía no está habilitada en esta farmacia.",
};

function toSessionError(error: unknown): SessionError {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { code: "UNAUTHENTICATED", message: "Tu sesión expiró. Inicia sesión otra vez." };
    }
    if (error.status === 403 && error.code === "USER_NOT_PROVISIONED") return NOT_PROVISIONED;
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return { code: "UNEXPECTED", message: error.message };
  }
  return { code: "UNEXPECTED", message: "No pudimos validar tu acceso. Inténtalo otra vez." };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    profile: null,
    error: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const signedOut = useCallback(() => {
    if (!mounted.current) return;
    setState({ status: "signed_out", profile: null, error: null });
  }, []);

  /** Valida el token contra el backend; refresca una vez si expiró. */
  const verify = useCallback(
    async (session: Session, allowRefresh = true) => {
      setState((prev) => ({ ...prev, status: "loading" }));
      try {
        const profile = await fetchMe(session.access_token);
        if (mounted.current) setState({ status: "authorized", profile, error: null });
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof ApiError && error.status === 401 && allowRefresh) {
          try {
            const { data, error: refreshError } = await getSupabase().auth.refreshSession();
            if (!refreshError && data.session) {
              await verify(data.session, false);
              return;
            }
          } catch {
            // Sin refresco posible: se trata como sesión vencida.
          }
          signedOut();
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          signedOut();
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: "not_provisioned", profile: null, error: toSessionError(error) });
          return;
        }
        setState({ status: "error", profile: null, error: toSessionError(error) });
      }
    },
    [signedOut],
  );

  // Arranque: recoge la sesión existente (o el retorno de Google) antes de decidir cualquier ruta.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!supabaseIsConfigured()) {
      setState({ status: "error", profile: null, error: NOT_CONFIGURED });
      return;
    }

    const supabase = getSupabase();
    let cancelled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const url = window.location;
    const returningFromOauth =
      url.search.includes("code=") || url.search.includes("error=") || url.hash.includes("error=");

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          void verify(data.session);
        } else if (returningFromOauth) {
          // El intercambio del código puede estar en curso: se espera el evento SIGNED_IN.
          fallback = setTimeout(() => {
            if (!cancelled) signedOut();
          }, 8000);
        } else {
          signedOut();
        }
      })
      .catch(() => {
        if (!cancelled) signedOut();
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" && session) {
        if (fallback) clearTimeout(fallback);
        // Diferido: supabase-js no permite llamar a sus métodos dentro de este callback.
        setTimeout(() => {
          if (!cancelled) void verify(session);
        }, 0);
      } else if (event === "SIGNED_OUT") {
        signedOut();
      }
    });

    return () => {
      cancelled = true;
      if (fallback) clearTimeout(fallback);
      listener.subscription.unsubscribe();
    };
  }, [signedOut, verify]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseIsConfigured()) throw new Error(NOT_CONFIGURED.message);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (supabaseIsConfigured()) await getSupabase().auth.signOut();
    } catch {
      // Aunque falle el cierre remoto, la sesión local se descarta.
    } finally {
      signedOut();
    }
  }, [signedOut]);

  const retry = useCallback(async () => {
    if (!supabaseIsConfigured()) {
      setState({ status: "error", profile: null, error: NOT_CONFIGURED });
      return;
    }
    setState((prev) => ({ ...prev, status: "loading" }));
    const { data } = await getSupabase().auth.getSession();
    if (data.session) await verify(data.session);
    else signedOut();
  }, [signedOut, verify]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      profile: state.profile,
      error: state.error,
      signInWithGoogle,
      signOut,
      retry,
    }),
    [state, signInWithGoogle, signOut, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession debe usarse dentro de SessionProvider.");
  return context;
}
