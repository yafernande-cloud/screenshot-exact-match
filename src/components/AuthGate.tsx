import { Loader2, Pill, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { useSolicitudAcceso, type EstadoPantallaSolicitud } from "@/lib/use-solicitud-acceso";

function fechaSolicitud(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
}

/**
 * Estados de la solicitud de acceso. Se comparte entre el inicio de sesión y la pantalla
 * bloqueada para que ambos caminos cuenten lo mismo con el mismo diseño.
 */
export function EstadoSolicitudAccesoPanel({
  estado,
  onConsultar,
  onVolverASolicitar,
  onReintentarAcceso,
}: {
  estado: EstadoPantallaSolicitud;
  onConsultar: () => void;
  onVolverASolicitar: () => void;
  onReintentarAcceso: () => void;
}) {
  if (estado.tipo === "inactivo") return null;

  if (estado.tipo === "consultando") {
    return (
      <Alert>
        <AlertTitle>Verificando tu solicitud</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Estamos revisando el estado de tu acceso.
        </AlertDescription>
      </Alert>
    );
  }

  if (estado.tipo === "enviando") {
    return (
      <Alert>
        <AlertTitle>Enviando solicitud de acceso</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Estamos registrando tu solicitud.
        </AlertDescription>
      </Alert>
    );
  }

  if (estado.tipo === "pendiente") {
    const fecha = fechaSolicitud(estado.solicitadaEn);
    return (
      <Alert>
        <AlertTitle>Solicitud pendiente</AlertTitle>
        <AlertDescription>
          <p>Tu solicitud de acceso está esperando aprobación.</p>
          {fecha && <p className="text-xs text-muted-foreground">Solicitada el {fecha}.</p>}
          <Button type="button" variant="outline" className="mt-2 h-9" onClick={onReintentarAcceso}>
            Reintentar acceso
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (estado.tipo === "rechazada") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Tu solicitud de acceso no fue aprobada</AlertTitle>
        <AlertDescription>
          <p>Puedes volver a solicitar acceso cuando quieras.</p>
          <Button
            type="button"
            className="mt-2 h-9 bg-brand-green text-primary-foreground hover:bg-brand-green/90"
            onClick={onVolverASolicitar}
          >
            Volver a solicitar acceso
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (estado.tipo === "sin_acceso") {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {estado.motivo === "expired" ? "Tu acceso web venció" : "Tu acceso web fue eliminado"}
        </AlertTitle>
        <AlertDescription>
          <p>
            Tu cuenta sigue siendo la misma, pero necesitas una autorización nueva. Puedes
            solicitarla y esperar la aprobación de una administradora.
          </p>
          <Button
            type="button"
            className="mt-2 h-9 bg-brand-green text-primary-foreground hover:bg-brand-green/90"
            onClick={onVolverASolicitar}
          >
            Volver a solicitar acceso
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (estado.tipo === "vinculada") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Tu cuenta no tiene acceso activo</AlertTitle>
        <AlertDescription>
          <p>Vuelve a iniciar sesión o pide a una administradora que revise tu acceso.</p>
          <Button type="button" variant="outline" className="mt-2 h-9" onClick={onReintentarAcceso}>
            Reintentar acceso
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>No pudimos consultar tu solicitud</AlertTitle>
      <AlertDescription>
        <p>{estado.mensaje}</p>
        <Button type="button" variant="outline" className="mt-2 h-9" onClick={onConsultar}>
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  );
}

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
  // Sin autorización web (`WEB_ACCESS_REQUIRED`) o con ella vencida, la persona conserva su
  // identidad: la pantalla ofrece consultar el estado y volver a solicitar explícitamente.
  const esperaAcceso =
    notProvisioned &&
    (error?.code === "USER_NOT_PROVISIONED" ||
      error?.code === "WEB_ACCESS_REQUIRED" ||
      error?.code === "WEB_ACCESS_EXPIRED");
  const sinAccesoWeb =
    error?.code === "WEB_ACCESS_REQUIRED" || error?.code === "WEB_ACCESS_EXPIRED";
  const solicitud = useSolicitudAcceso(esperaAcceso);
  const title = notProvisioned
    ? sinAccesoWeb
      ? "Tu cuenta no tiene acceso al cotizador"
      : "Tu cuenta todavía no está habilitada"
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
        {esperaAcceso ? (
          <div className="mt-4">
            <EstadoSolicitudAccesoPanel
              estado={solicitud.estado}
              onConsultar={() => void solicitud.consultar()}
              onVolverASolicitar={() => void solicitud.volverASolicitar()}
              onReintentarAcceso={() => void retry()}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{detail}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Si el problema persiste, contacta a YF.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {!esperaAcceso && (
            <Button
              type="button"
              onClick={() => void retry()}
              className="w-full bg-brand-green text-primary-foreground hover:bg-brand-green/90 sm:w-auto"
            >
              Reintentar
            </Button>
          )}
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
