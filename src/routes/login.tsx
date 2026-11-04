import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Pill, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { oauthErrorFromLocation } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { supabaseIsConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Cotizador Inteligente Farmacia" },
      {
        name: "description",
        content: "Acceso del personal autorizado de Farmacia Parque Lantaño.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

/** Logo «G» de Google, sin depender de un paquete adicional. */
function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C37 40.3 44 36 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function LoginPage() {
  const { status, error, signInWithGoogle, signOut, retry } = useSession();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const configured = supabaseIsConfigured();

  useEffect(() => {
    setOauthError(oauthErrorFromLocation(window.location.search, window.location.hash));
  }, []);

  useEffect(() => {
    if (status === "authorized") navigate({ to: "/", replace: true });
  }, [status, navigate]);

  const pending = sending || status === "loading";
  const blocked = status === "not_provisioned" || status === "error";
  const message = manualError ?? oauthError ?? error?.message ?? null;

  const start = async () => {
    setManualError(null);
    setOauthError(null);
    setSending(true);
    try {
      await signInWithGoogle();
      // El navegador sale hacia Google: el estado de carga se mantiene.
    } catch (e) {
      setSending(false);
      setManualError(
        e instanceof Error && e.message.trim() !== ""
          ? e.message
          : "No pudimos iniciar sesión con Google. Inténtalo otra vez.",
      );
    }
  };

  if (status === "authorized") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-brand-green" aria-hidden />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-green/15 via-brand-blue/5 to-transparent"
      />
      <main className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <header className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green text-primary-foreground">
              <Pill className="h-7 w-7" aria-hidden />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue">
              Farmacia Parque Lantaño
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
              Cotizador Inteligente Farmacia
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Acceso para el personal autorizado</p>
          </header>

          <div className="mt-8 space-y-3">
            {!configured && (
              <Alert>
                <AlertTitle>Autenticación sin configurar</AlertTitle>
                <AlertDescription>
                  Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.
                </AlertDescription>
              </Alert>
            )}

            {blocked && (
              <Alert variant="destructive">
                <AlertTitle>
                  {status === "not_provisioned"
                    ? "Acceso no habilitado"
                    : "No pudimos validar tu acceso"}
                </AlertTitle>
                <AlertDescription>
                  {error?.message ??
                    "Tu cuenta de Google todavía no está habilitada en esta farmacia."}
                </AlertDescription>
              </Alert>
            )}

            {!blocked && message && (
              <Alert variant="destructive">
                <AlertTitle>No pudimos iniciar sesión</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            {blocked ? (
              <>
                <Button
                  type="button"
                  onClick={() => void retry()}
                  className="w-full bg-brand-green text-primary-foreground hover:bg-brand-green/90"
                >
                  Reintentar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void signOut()}
                >
                  Usar otra cuenta
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 text-sm font-medium"
                onClick={() => void start()}
                disabled={pending || !configured}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Conectando con Google…
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    Continuar con Google
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="mt-8 flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
            <p>
              Solo cuentas habilitadas por una administradora pueden ingresar al cotizador. Al
              continuar, Google compartirá tu nombre y correo con este sistema.
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          © Farmacia Parque Lantaño · Cotizador Inteligente
        </p>
      </main>
    </div>
  );
}
