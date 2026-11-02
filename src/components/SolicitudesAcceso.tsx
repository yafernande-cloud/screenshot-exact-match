import { createContext, useContext, useState, type ReactNode } from "react";
import { Bell, Check, X } from "lucide-react";
import { toast } from "sonner";
import { adminDemo, solicitudesDemo, type SolicitudAcceso } from "@/data/demo";
import { pendientes, resolverSolicitud } from "@/lib/faltantes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Ctx {
  solicitudes: SolicitudAcceso[];
  resolver: (solicitudId: string, estado: "aprobada" | "rechazada") => void;
}
const SolicitudesCtx = createContext<Ctx | null>(null);

/** Estado local de demostración: no modifica usuarios reales ni guarda en el servidor. */
export function SolicitudesProvider({ children }: { children: ReactNode }) {
  const [solicitudes, setSolicitudes] = useState<SolicitudAcceso[]>(solicitudesDemo);
  const resolver: Ctx["resolver"] = (id, estado) => {
    setSolicitudes((s) => resolverSolicitud(s, id, estado, adminDemo.usuarioId));
    toast(estado === "aprobada" ? "Solicitud aprobada (demo, sin guardar en el servidor)" : "Solicitud rechazada (demo, sin guardar en el servidor)");
  };
  return <SolicitudesCtx.Provider value={{ solicitudes, resolver }}>{children}</SolicitudesCtx.Provider>;
}

function useSolicitudes() {
  const c = useContext(SolicitudesCtx);
  if (!c) throw new Error("SolicitudesProvider no está montado");
  return c;
}

const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");

/** Campanita junto al nombre del administrador, con las solicitudes de acceso pendientes. */
export function CampanitaSolicitudes() {
  const { solicitudes, resolver } = useSolicitudes();
  const lista = pendientes(solicitudes);

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Solicitudes de acceso${lista.length ? `: ${lista.length} pendientes` : ""}`}
        className="relative rounded-full p-2 text-primary-foreground hover:bg-primary-foreground/15"
      >
        <Bell className="h-5 w-5" />
        {lista.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {lista.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Solicitudes de acceso</p>
          <p className="text-xs text-muted-foreground">Usuarios que ingresaron con Google · demostración, no modifica usuarios reales</p>
        </div>
        {lista.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes</p>
        ) : (
          <ul className="divide-y">
            {lista.map((s) => (
              <li key={s.solicitudId} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.nombre ?? "Nombre no informado"}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.correo}</p>
                    {s.fecha && <p className="text-xs text-muted-foreground">Solicitada el {fecha(s.fecha)}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pendiente</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolver(s.solicitudId, "aprobada")}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90"
                  >
                    <Check className="h-3.5 w-3.5" /> Aprobar
                  </button>
                  <button
                    onClick={() => resolver(s.solicitudId, "rechazada")}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
