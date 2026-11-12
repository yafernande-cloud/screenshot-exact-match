import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Bell, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/lib/session";
import {
  aprobarSolicitud,
  listarSolicitudesPendientes,
  mensajeDeErrorSolicitud,
  rechazarSolicitud,
  type SolicitudAccesoWeb,
} from "@/lib/web-access-api";

export type AccionSolicitud = "aprobar" | "rechazar";

interface Ctx {
  solicitudes: SolicitudAccesoWeb[];
  count: number;
  cargando: boolean;
  error: string | null;
  /** Solicitud cuya decisión está en curso: deshabilita acciones para evitar dobles envíos. */
  resolviendo: string | null;
  recargar: () => Promise<void>;
  resolver: (solicitudId: string, accion: AccionSolicitud) => Promise<void>;
}

const SolicitudesCtx = createContext<Ctx | null>(null);

/**
 * Estado real de la campanita: solicitudes pendientes de la organización de la persona
 * autenticada. Solo consulta cuando hay una sesión autorizada con permiso de administración; el
 * backend vuelve a validar el permiso en cada llamada.
 */
export function SolicitudesProvider({ children }: { children: ReactNode }) {
  const { status, profile } = useSession();
  const administra = (profile?.roles ?? []).includes("admin");
  const [solicitudes, setSolicitudes] = useState<SolicitudAccesoWeb[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const montado = useRef(true);
  const decisionEnCurso = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarSolicitudesPendientes();
      if (montado.current) setSolicitudes(data.items);
    } catch (fallo) {
      if (montado.current) setError(mensajeDeErrorSolicitud(fallo));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authorized" && administra) {
      void recargar();
    } else {
      setSolicitudes([]);
      setError(null);
    }
  }, [status, administra, recargar]);

  const resolver = useCallback(
    async (solicitudId: string, accion: AccionSolicitud) => {
      // Un ref corta el doble clic en el mismo instante, antes de que React vuelva a renderizar.
      if (decisionEnCurso.current || resolviendo !== null) return;
      decisionEnCurso.current = true;
      setResolviendo(solicitudId);
      setError(null);
      try {
        if (accion === "aprobar") {
          await aprobarSolicitud(solicitudId);
          toast.success("Solicitud aprobada. La persona ya tiene acceso web.");
        } else {
          await rechazarSolicitud(solicitudId);
          toast("Solicitud rechazada.");
        }
        await recargar();
      } catch (fallo) {
        const mensaje = mensajeDeErrorSolicitud(fallo);
        setError(mensaje);
        toast.error(mensaje);
        // La solicitud pudo haber sido resuelta por otra administradora: se refresca la lista.
        await recargar();
      } finally {
        decisionEnCurso.current = false;
        if (montado.current) setResolviendo(null);
      }
    },
    [recargar, resolviendo],
  );

  return (
    <SolicitudesCtx.Provider
      value={{
        solicitudes,
        count: solicitudes.length,
        cargando,
        error,
        resolviendo,
        recargar,
        resolver,
      }}
    >
      {children}
    </SolicitudesCtx.Provider>
  );
}

function useSolicitudes() {
  const contexto = useContext(SolicitudesCtx);
  if (!contexto) throw new Error("SolicitudesProvider no está montado");
  return contexto;
}

/** Fecha y hora en la zona de la farmacia; nunca la fecha técnica del navegador. */
function fechaSolicitud(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "fecha no informada";
  return fecha.toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
}

/** Campanita junto al nombre de la administradora, con las solicitudes reales pendientes. */
export function CampanitaSolicitudes() {
  const { solicitudes, count, cargando, error, resolviendo, recargar, resolver } = useSolicitudes();

  return (
    <Popover onOpenChange={(abierto) => abierto && void recargar()}>
      <PopoverTrigger
        aria-label={`Solicitudes de acceso${count ? `: ${count} pendientes` : ""}`}
        className="relative rounded-full p-2 text-primary-foreground hover:bg-primary-foreground/15"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Solicitudes de acceso</p>
          <p className="text-xs text-muted-foreground">
            Personas que ingresaron con Google y esperan aprobación
          </p>
        </div>

        {cargando && solicitudes.length === 0 ? (
          <p
            className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando solicitudes…
          </p>
        ) : error && solicitudes.length === 0 ? (
          <div className="space-y-2 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void recargar()}
              className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Reintentar
            </button>
          </div>
        ) : solicitudes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No hay solicitudes pendientes
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {solicitudes.map((s) => {
              const enCurso = resolviendo === s.id;
              const bloqueado = resolviendo !== null;
              return (
                <li key={s.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Solicitada el {fechaSolicitud(s.requested_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Pendiente
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void resolver(s.id, "aprobar")}
                      disabled={bloqueado}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {enCurso ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolver(s.id, "rechazar")}
                      disabled={bloqueado}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Rechazar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && solicitudes.length > 0 && (
          <p className="border-t px-4 py-2 text-xs text-destructive">{error}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
