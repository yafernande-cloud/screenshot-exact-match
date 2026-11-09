import { Loader2, Pill, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/** Pantalla intermedia mientras se valida la sesión; nunca muestra datos comerciales. */
export function SessionLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green text-primary-foreground">
        <Pill className="h-7 w-7" aria-hidden />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Validando tu sesión…
      </div>
    </div>
  );
}

/** Cuenta autenticada en Supabase pero sin acceso al cotizador (403) o backend inaccesible. */
export function AccessBlockedScreen() {
  const { status, error, retry, signOut } = useSession();
  const notProvisioned = status === "not_provisioned";
  const title = notProvisioned
    ? "Tu cuenta todavía no está habilitada"
    : "No pudimos validar tu acceso";
  const detail =
    error?.message ??
    (notProvisioned
      ? "Tu cuenta todavía no está habilitada en este cotizador."
      : "Inténtalo de nuevo en unos segundos.");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">
              Acceso restringido
            </p>
            <h1 className="mt-0.5 text-lg font-semibold text-foreground">{title}</h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{detail}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Si el problema persiste, contacta a YF.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => void retry()}
            className="w-full bg-brand-green text-primary-foreground hover:bg-brand-green/90 sm:w-auto"
          >
            Reintentar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void signOut()}
            className="w-full sm:w-auto"
          >
            Usar otra cuenta
          </Button>
        </div>
      </div>
    </div>
  );
}
