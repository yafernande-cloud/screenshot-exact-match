import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Pill, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messageForPasswordError, oauthErrorFromLocation } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { supabaseIsConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Cotizador Inteligente Farmacia" },
      {
        name: "description",
        content: "Acceso del personal autorizado al Cotizador Inteligente Farmacia.",
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

function startErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "No pudimos iniciar sesión con Google. Inténtalo otra vez.";
}

/**
 * La vista previa de Lovable corre dentro de un iframe y Google rechaza OAuth en ese contexto
 * (403). En una pestaña normal `self` y `top` son la misma ventana y el flujo no cambia.
 */
function isEmbeddedWindow(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Un acceso bloqueado a `top` también implica que estamos embebidos.
    return true;
  }
}

/**
 * Abre la pantalla de login en una pestaña de nivel superior. El flujo de Supabase se inicia
 * allí —no aquí— para que el verificador PKCE y la sesión queden en el almacenamiento de esa
 * pestaña, y no se mezclen con el almacenamiento particionado del iframe.
 *
 * Devuelve `false` si el navegador bloqueó la ventana; en ese caso no se inicia OAuth embebido.
 */
function openLoginInNewTab(): boolean {
  const url = new URL("/login", window.location.origin);
  url.searchParams.set("oauth", "1");

  try {
    const tab = window.open(url.toString(), "_blank");
    if (!tab) return false;
    tab.opener = null;
    return true;
  } catch {
    return false;
  }
}

function LoginPage() {
  const { status, error, signInWithGoogle, signInWithPassword, signOut, retry } = useSession();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [passwordSending, setPasswordSending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const configured = supabaseIsConfigured();

  useEffect(() => {
    setOauthError(oauthErrorFromLocation(window.location.search, window.location.hash));
  }, []);

  useEffect(() => {
    if (status === "authorized") navigate({ to: "/", replace: true });
  }, [status, navigate]);

  // La pestaña abierta desde la vista previa llega con `oauth=1` y arranca aquí el mismo flujo
  // de Supabase. Se quita la marca antes de salir para no reintentarlo si el inicio falla.
  useEffect(() => {
    if (autoStarted.current || !configured || status !== "signed_out") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") !== "1") return;

    autoStarted.current = true;
    params.delete("oauth");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );

    setSending(true);
    void signInWithGoogle().catch((e) => {
      setSending(false);
      setManualError(startErrorMessage(e));
    });
  }, [configured, status, signInWithGoogle]);

  const pending = sending || passwordSending || status === "loading";
  const notProvisioned = status === "not_provisioned";
  // Un fallo del backend solo se muestra si la autenticación está configurada: si faltan las
  // variables, la pantalla informa una sola vez que el inicio de sesión no está disponible.
  const backendError = configured && status === "error";
  const message = manualError ?? oauthError ?? error?.message ?? null;

  const start = async () => {
    setManualError(null);
    setOauthError(null);

    if (isEmbeddedWindow()) {
      if (openLoginInNewTab()) return;
      setManualError(
        "El navegador bloqueó la pestaña de inicio de sesión. Permite las ventanas emergentes para este sitio e inténtalo otra vez.",
      );
      return;
    }

    setSending(true);
    try {
      await signInWithGoogle();
      // El navegador sale hacia Google: el estado de carga se mantiene.
    } catch (e) {
      setSending(false);
      setManualError(startErrorMessage(e));
    }
  };

  /**
   * Correo + contraseña: Supabase valida las credenciales y el proveedor de sesión verifica el
   * acceso contra el backend, igual que con Google. Dentro de la vista previa de Lovable no hace
   * falta abrir otra pestaña: no hay redirección a un tercero.
   */
  const startPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordSending) return;

    setManualError(null);
    setOauthError(null);

    const cleanEmail = email.trim();
    if (cleanEmail === "" || password === "") {
      setManualError("Ingresa tu correo electrónico y tu contraseña.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setManualError("Escribe un correo electrónico válido.");
      return;
    }

    setPasswordSending(true);
    try {
      await signInWithPassword(cleanEmail, password);
    } catch (e) {
      setManualError(messageForPasswordError(e));
    } finally {
      setPasswordSending(false);
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#17845F_0%,#1B7A76_48%,#27718A_100%)] px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-[#0f3f4f]/30 blur-3xl"
      />
      <main className="relative w-full max-w-md">
        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-black/25 ring-1 ring-black/5 sm:p-8">
          <header className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green text-white shadow-lg shadow-brand-green/25">
              <Pill className="h-7 w-7" aria-hidden />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue">
              Acceso seguro
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
              Cotizador Inteligente Farmacia
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Acceso para el personal autorizado</p>
          </header>

          <div className="mt-8 space-y-3">
            {!configured && (
              <Alert>
                <AlertDescription>
                  El inicio de sesión todavía no está disponible. Inténtalo nuevamente más tarde.
                </AlertDescription>
              </Alert>
            )}

            {notProvisioned && (
              <Alert variant="destructive">
                <AlertTitle>Acceso no habilitado</AlertTitle>
                <AlertDescription>
                  {error?.message ?? "Tu cuenta todavía no está habilitada en este cotizador."}
                  <span className="mt-1 block">Si el problema persiste, contacta a YF.</span>
                </AlertDescription>
              </Alert>
            )}

            {backendError && (
              <Alert variant="destructive">
                <AlertTitle>No pudimos validar tu acceso</AlertTitle>
                <AlertDescription>
                  {message ?? "Inténtalo de nuevo en unos segundos."}
                  <span className="mt-1 block">Si el problema persiste, contacta a YF.</span>
                </AlertDescription>
              </Alert>
            )}

            {configured && !notProvisioned && !backendError && message && (
              <Alert variant="destructive">
                <AlertTitle>No pudimos iniciar sesión</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-3 border-border bg-white text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void start()}
              disabled={pending || !configured}
            >
              {sending ? (
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

            <div className="flex items-center gap-3 pt-1" aria-hidden>
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                o
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form className="space-y-3" onSubmit={(event) => void startPassword(event)} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Correo electrónico</Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="nombre@correo.cl"
                  className="h-11 bg-white"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending || !configured}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="h-11 bg-white"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={pending || !configured}
                  required
                />
              </div>
              <Button
                type="submit"
                className="h-12 w-full gap-2 bg-brand-green text-sm font-medium text-primary-foreground shadow-sm hover:bg-brand-green/90 disabled:opacity-60"
                disabled={pending || !configured}
              >
                {passwordSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Ingresando…
                  </>
                ) : (
                  "Ingresar"
                )}
              </Button>
            </form>

            {notProvisioned && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => void signOut()}
              >
                Usar otra cuenta
              </Button>
            )}

            {backendError && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => void retry()}>
                Reintentar
              </Button>
            )}
          </div>

          <div className="mt-8 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
            <p>
              Solo cuentas habilitadas pueden ingresar al cotizador. Si usas Google, compartirá tu
              nombre y correo con este sistema.
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-white/80">
          © Cotizador Inteligente Farmacia YF
        </p>
      </main>
    </div>
  );
}
