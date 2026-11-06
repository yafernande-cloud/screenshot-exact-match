import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Search, ShieldCheck, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  aprobarSolicitud,
  buscarSolicitudPorCodigo,
  listarSolicitudes,
  rechazarSolicitud,
  type AprobacionTelefono,
  type CuentaExistente,
  type CuentaTelegram,
  type ModoTelefono,
  type PersonaStaff,
  type SolicitudAcceso,
} from "@/lib/telegram-api";
import {
  describirPersona,
  formatearFecha,
  mensajeDeErrorTelegram,
  personalOperativo,
} from "@/lib/telegram";
import {
  BloqueCargando,
  BloqueError,
  BotonActualizar,
  Tarjeta,
  TituloSeccion,
  inputClass,
} from "./Comunes";

interface Seleccion {
  request: SolicitudAcceso;
  existingAccount: CuentaExistente | null;
}

function FormularioAprobacion({
  seleccion,
  staff,
  onAprobada,
  onCancelar,
}: {
  seleccion: Seleccion;
  staff: PersonaStaff[];
  onAprobada: (cuenta: CuentaTelegram) => Promise<void>;
  onCancelar: () => void;
}) {
  const { request, existingAccount } = seleccion;
  const [nombreTelefono, setNombreTelefono] = useState(existingAccount?.display_label ?? "");
  const [sucursal, setSucursal] = useState(existingAccount?.branch_label ?? "");
  const [modo, setModo] = useState<ModoTelefono>(existingAccount?.mode ?? "shared_device");
  const [personaId, setPersonaId] = useState(existingAccount?.app_user_id ?? "");
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const candidatos = useMemo(
    () =>
      personalOperativo(staff)
        .filter((p) => p.member_active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "es")),
    [staff],
  );

  function alternarAuxiliar(id: string, marcado: boolean) {
    setAuxiliares((prev) => (marcado ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function aprobar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nombreTelefono.trim();
    if (!limpio) {
      toast.error("Escribe un nombre para reconocer este teléfono.");
      return;
    }
    if (modo === "personal" && !personaId) {
      toast.error("Selecciona la persona que usará este teléfono personal.");
      return;
    }
    if (modo === "shared_device" && auxiliares.length === 0) {
      toast.error("Selecciona al menos un auxiliar para este teléfono compartido.");
      return;
    }

    const body: AprobacionTelefono = {
      display_label: limpio,
      branch_label: sucursal.trim() || null,
      mode: modo,
      access_role: "operator",
    };
    // Una sola llamada: en personal viaja la persona; en compartido, todos los auxiliares juntos.
    if (modo === "personal") body.app_user_id = personaId;
    else body.auxiliary_ids = auxiliares;

    setGuardando(true);
    try {
      const cuenta = await aprobarSolicitud(request.id, body);
      await onAprobada(cuenta);
    } catch (error) {
      toast.error(mensajeDeErrorTelegram(error, "No pudimos aprobar la solicitud."));
    } finally {
      setGuardando(false);
    }
  }

  if (request.status !== "pending") {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        Esta solicitud ya no está pendiente. No se puede aprobar.
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onCancelar}>
          Cerrar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={aprobar} className="rounded-2xl border bg-background/60 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Aprobar solicitud</h3>
          <p className="text-xs text-muted-foreground">
            Recibida el {formatearFecha(request.created_at)} · vence el{" "}
            {formatearFecha(request.expires_at)}
          </p>
        </div>
        <Badge variant="outline">Pendiente</Badge>
      </div>

      {existingAccount && (
        <div className="mb-4 rounded-xl border border-brand-blue/40 bg-brand-blue/5 px-3 py-2 text-xs">
          Este teléfono ya existe como <strong>{existingAccount.display_label}</strong> (
          {existingAccount.status === "blocked" ? "bloqueado" : "activo"}). Al aprobar se reutiliza
          su historial; no se crea otra cuenta.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="telefono-nombre">Nombre del teléfono</Label>
          <Input
            id="telefono-nombre"
            value={nombreTelefono}
            onChange={(e) => setNombreTelefono(e.target.value)}
            placeholder="Ej.: Teléfono de la farmacia"
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono-sucursal">Sucursal (opcional)</Label>
          <Input
            id="telefono-sucursal"
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value)}
            placeholder="Ej.: Parque Lantaño"
            maxLength={120}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="telefono-modo">Tipo de teléfono</Label>
          <select
            id="telefono-modo"
            className={inputClass}
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoTelefono)}
          >
            <option value="shared_device">Compartido: lo usan varias personas</option>
            <option value="personal">Personal: lo usa una sola persona</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {modo === "shared_device"
              ? "Cada persona elige quién reporta al escribir al bot. Habilita aquí a quienes pueden usarlo."
              : "La identidad queda fijada a una persona; no se usan auxiliares."}
          </p>
        </div>

        {modo === "personal" ? (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="telefono-persona">Persona</Label>
            <select
              id="telefono-persona"
              className={inputClass}
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
            >
              <option value="">Selecciona una persona</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.can_report}>
                  {p.display_name} — {describirPersona(p)}
                </option>
              ))}
            </select>
            {candidatos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay personas activas con rol de auxiliar. Créala primero en la sección
                Auxiliares.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 md:col-span-2">
            <Label>Auxiliares habilitados</Label>
            {candidatos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay personas activas con rol de auxiliar. Créala primero en la sección
                Auxiliares.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {candidatos.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[#17845F]"
                        checked={auxiliares.includes(p.id)}
                        disabled={!p.can_report || guardando}
                        onChange={(e) => alternarAuxiliar(p.id, e.target.checked)}
                      />
                      <span>
                        <span className="font-medium">{p.display_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {describirPersona(p)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Se habilitan en el mismo paso, sin aprobar el teléfono dos veces.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {guardando ? "Aprobando…" : "Aprobar teléfono"}
        </Button>
      </div>
    </form>
  );
}

export function SolicitudesSection({
  staff,
  onCuentasCambiadas,
}: {
  staff: PersonaStaff[];
  onCuentasCambiadas: () => Promise<void>;
}) {
  const [solicitudes, setSolicitudes] = useState<SolicitudAcceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [rechazo, setRechazo] = useState<SolicitudAcceso | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setSolicitudes(await listarSolicitudes("pending"));
    } catch (err) {
      setError(mensajeDeErrorTelegram(err, "No pudimos cargar las solicitudes de acceso."));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = codigo.trim();
    if (!limpio) {
      toast.error("Escribe el código que te compartió la persona.");
      return;
    }
    setBuscando(true);
    try {
      const resultado = await buscarSolicitudPorCodigo(limpio);
      setSeleccion({
        request: resultado.request,
        existingAccount: resultado.existing_account,
      });
      if (!resultado.can_approve) {
        toast.error("Esa solicitud ya no está pendiente. Pide una nueva desde el bot.");
      }
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos buscar el código."));
    } finally {
      setBuscando(false);
    }
  }

  function abrirRechazo(solicitud: SolicitudAcceso) {
    setMotivoRechazo("");
    setRechazo(solicitud);
  }

  async function confirmarRechazo() {
    if (!rechazo) return;
    setRechazando(true);
    try {
      await rechazarSolicitud(rechazo.id, motivoRechazo);
      toast.success("La solicitud quedó rechazada.");
      setRechazo(null);
      if (seleccion?.request.id === rechazo.id) setSeleccion(null);
      await cargar();
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos rechazar la solicitud."));
    } finally {
      setRechazando(false);
    }
  }

  async function alAprobar(cuenta: CuentaTelegram) {
    toast.success(`✅ Teléfono aprobado: ${cuenta.display_label}.`);
    setSeleccion(null);
    setCodigo("");
    await cargar();
    await onCuentasCambiadas();
  }

  return (
    <Tarjeta>
      <TituloSeccion
        titulo="Solicitudes de acceso"
        descripcion="Personas que pidieron usar el bot y esperan aprobación. El código se comparte por Telegram; no otorga acceso por sí solo."
        acciones={<BotonActualizar onClick={() => void cargar()} cargando={cargando} />}
      />

      <form onSubmit={buscar} className="mb-5 space-y-2">
        <Label htmlFor="codigo-solicitud">Buscar por código</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="codigo-solicitud"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código que te compartió la persona"
            className="sm:max-w-sm"
            autoComplete="off"
          />
          <Button type="submit" variant="outline" disabled={buscando || !codigo.trim()}>
            <Search className="h-4 w-4" aria-hidden />
            {buscando ? "Buscando…" : "Buscar código"}
          </Button>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <KeyRound className="h-3 w-3" aria-hidden />
          El código no aparece en esta pantalla ni queda guardado.
        </p>
      </form>

      {seleccion && (
        <div className="mb-5">
          <FormularioAprobacion
            key={seleccion.request.id}
            seleccion={seleccion}
            staff={staff}
            onAprobada={alAprobar}
            onCancelar={() => setSeleccion(null)}
          />
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold">Pendientes ({solicitudes.length})</h3>
      {error ? (
        <BloqueError mensaje={error} onReintentar={() => void cargar()} />
      ) : cargando && solicitudes.length === 0 ? (
        <BloqueCargando texto="Cargando solicitudes…" />
      ) : solicitudes.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No hay solicitudes pendientes. Cuando alguien pida acceso desde Telegram, aparecerá aquí.
        </p>
      ) : (
        <ul className="space-y-2">
          {solicitudes.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">Solicitud recibida el {formatearFecha(s.created_at)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ID de Telegram: {s.external_user_id} · vence el {formatearFecha(s.expires_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSeleccion({ request: s, existingAccount: null })}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Revisar y aprobar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => abrirRechazo(s)}
                >
                  <ShieldX className="h-4 w-4" aria-hidden />
                  Rechazar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={rechazo !== null} onOpenChange={(abierto) => !abierto && setRechazo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Rechazar esta solicitud?</DialogTitle>
            <DialogDescription>
              La persona no podrá usar el bot con esta solicitud. La solicitud se conserva con el
              motivo para futuras revisiones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-rechazo">Motivo (opcional)</Label>
            <Textarea
              id="motivo-rechazo"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              maxLength={200}
              placeholder="Ej.: no trabaja en la farmacia"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRechazo(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmarRechazo()}
              disabled={rechazando}
            >
              {rechazando ? "Rechazando…" : "Sí, rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tarjeta>
  );
}
