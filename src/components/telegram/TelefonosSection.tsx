import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, History, Pencil, RotateCcw, UserPlus, Users, UserX } from "lucide-react";

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
import {
  asociarAuxiliar,
  bloquearCuenta,
  desasociarAuxiliar,
  editarCuenta,
  historialCuenta,
  listarAuxiliaresDeCuenta,
  reactivarCuenta,
  type AuxiliarDeCuenta,
  type AuxiliaresDeCuenta,
  type CuentaTelegram,
  type EntradaHistorial,
  type PersonaStaff,
} from "@/lib/telegram-api";
import {
  auxiliaresSeleccionables,
  describirPersona,
  etiquetaEstadoCuenta,
  etiquetaHistorial,
  etiquetaModo,
  formatearFecha,
  mensajeDeErrorTelegram,
  resumenCuenta,
} from "@/lib/telegram";
import {
  BloqueCargando,
  BloqueError,
  BotonActualizar,
  Tarjeta,
  TituloSeccion,
  inputClass,
} from "./Comunes";

const ORIGEN: Record<CuentaTelegram["origin"], string> = {
  backfill: "Autorizado antes de esta pantalla",
  access_request: "Aprobado desde una solicitud",
  manual: "Creado manualmente",
};

type Dialogo = "editar" | "bloquear" | "reactivar" | "historial" | "auxiliares";

function ContenidoHistorial({ cuentaId }: { cuentaId: string }) {
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    historialCuenta(cuentaId)
      .then((datos) => {
        if (vigente) setEntradas(datos);
      })
      .catch((err) => {
        if (vigente) setError(mensajeDeErrorTelegram(err, "No pudimos cargar el historial."));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [cuentaId]);

  if (cargando) return <BloqueCargando texto="Cargando historial…" />;
  if (error) return <BloqueError mensaje={error} />;
  if (entradas.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>;
  }

  return (
    <ol className="space-y-2">
      {entradas
        .slice()
        .reverse()
        .map((e, i) => (
          <li key={`${e.created_at}-${i}`} className="rounded-xl border px-3 py-2 text-sm">
            <p className="font-medium">{etiquetaHistorial(e.action)}</p>
            <p className="text-xs text-muted-foreground">
              {formatearFecha(e.created_at)}
              {e.actor_name ? ` · ${e.actor_name}` : " · Registrado por el sistema"}
            </p>
          </li>
        ))}
    </ol>
  );
}

function ContenidoAuxiliares({
  cuenta,
  staff,
  onCambio,
}: {
  cuenta: CuentaTelegram;
  staff: PersonaStaff[];
  onCambio: () => Promise<void>;
}) {
  const [datos, setDatos] = useState<AuxiliaresDeCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [baja, setBaja] = useState<AuxiliarDeCuenta | null>(null);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [dandoBaja, setDandoBaja] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setDatos(await listarAuxiliaresDeCuenta(cuenta.id));
    } catch (err) {
      setError(mensajeDeErrorTelegram(err, "No pudimos cargar los auxiliares del teléfono."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // Solo depende del teléfono: recargar la lista no debe reiniciar el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id]);

  const activos = useMemo(() => (datos?.auxiliaries ?? []).filter((a) => a.active), [datos]);
  const inactivos = useMemo(() => (datos?.auxiliaries ?? []).filter((a) => !a.active), [datos]);
  const activosIds = new Set(activos.map((a) => a.app_user_id));
  const candidatos = auxiliaresSeleccionables(staff).filter((p) => !activosIds.has(p.id));

  async function agregar() {
    if (!seleccionado) {
      toast.error("Selecciona una persona para habilitar.");
      return;
    }
    setAgregando(true);
    try {
      const cambio = await asociarAuxiliar(cuenta.id, seleccionado);
      const persona = staff.find((p) => p.id === seleccionado);
      toast.success(
        cambio.reactivated
          ? `✅ ${persona?.display_name ?? "La persona"} quedó habilitada otra vez en este teléfono.`
          : `✅ ${persona?.display_name ?? "La persona"} quedó habilitada en este teléfono.`,
      );
      setSeleccionado("");
      await cargar();
      await onCambio();
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos asociar el auxiliar."));
    } finally {
      setAgregando(false);
    }
  }

  async function confirmarBaja() {
    if (!baja) return;
    setDandoBaja(true);
    try {
      await desasociarAuxiliar(cuenta.id, baja.app_user_id, motivoBaja);
      toast.success(
        `${baja.display_name} quedó dado de baja de este teléfono. Su historial se conserva.`,
      );
      setBaja(null);
      setMotivoBaja("");
      await cargar();
      await onCambio();
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos dar de baja al auxiliar."));
    } finally {
      setDandoBaja(false);
    }
  }

  if (cuenta.mode === "personal") {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
        Este teléfono es personal: la identidad está fijada a{" "}
        <strong>{cuenta.app_user_name ?? "una persona"}</strong> y no usa auxiliares. Si necesitas
        que varias personas lo usen, crea o aprueba un teléfono compartido por separado.
      </p>
    );
  }

  if (cargando) return <BloqueCargando texto="Cargando auxiliares del teléfono…" />;
  if (error) return <BloqueError mensaje={error} onReintentar={() => void cargar()} />;
  if (!datos) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Habilitar a una persona en este teléfono</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className={inputClass}
            value={seleccionado}
            onChange={(e) => setSeleccionado(e.target.value)}
            aria-label="Persona para habilitar"
          >
            <option value="">Selecciona una persona disponible</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => void agregar()}
            disabled={agregando || !seleccionado}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {agregando ? "Habilitando…" : "Habilitar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          No vuelve a aprobar el teléfono ni crea una solicitud: solo habilita a la persona aquí.
          Los auxiliares no disponibles o desactivados no aparecen.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Habilitados ahora ({activos.length})</h4>
        {activos.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
            Nadie está habilitado en este teléfono. Agrega al menos una persona para que pueda
            reportar.
          </p>
        ) : (
          <ul className="space-y-2">
            {activos.map((a) => (
              <li
                key={a.app_user_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{a.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.can_report ? "Disponible" : "No disponible para reportar"} · desde el{" "}
                    {formatearFecha(a.created_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setMotivoBaja("");
                    setBaja(a);
                  }}
                >
                  <UserX className="h-4 w-4" aria-hidden />
                  Dar de baja
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {inactivos.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Dados de baja antes ({inactivos.length})</h4>
          <ul className="space-y-1">
            {inactivos.map((a) => (
              <li key={a.app_user_id} className="rounded-xl border border-dashed px-3 py-2 text-sm">
                <span className="font-medium">{a.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · dado de baja el {formatearFecha(a.deactivated_at)}
                  {a.deactivation_reason ? ` · ${a.deactivation_reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            El historial se conserva y puedes volver a habilitarlos con el selector de arriba.
          </p>
        </div>
      )}

      {baja && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium">
            ¿Dar de baja a {baja.display_name} de este teléfono?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo pierde acceso a este teléfono. Sus reportes y su historial se conservan.
          </p>
          <div className="mt-2 space-y-2">
            <Input
              value={motivoBaja}
              onChange={(e) => setMotivoBaja(e.target.value)}
              placeholder="Motivo (opcional)"
              maxLength={200}
              aria-label="Motivo de la baja"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBaja(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void confirmarBaja()}
                disabled={dandoBaja}
              >
                {dandoBaja ? "Dando de baja…" : "Confirmar baja"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaTelefono({
  cuenta,
  staff,
  onCambio,
}: {
  cuenta: CuentaTelegram;
  staff: PersonaStaff[];
  onCambio: () => Promise<void>;
}) {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [nombre, setNombre] = useState(cuenta.display_label);
  const [sucursal, setSucursal] = useState(cuenta.branch_label ?? "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    try {
      await accion();
      toast.success(exito);
      setDialogo(null);
      await onCambio();
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos guardar el cambio."));
    } finally {
      setOcupado(false);
    }
  }

  function abrirEditar() {
    setNombre(cuenta.display_label);
    setSucursal(cuenta.branch_label ?? "");
    setDialogo("editar");
  }

  function guardarDatos() {
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe un nombre para el teléfono.");
      return;
    }
    void ejecutar(
      () =>
        editarCuenta(cuenta.id, {
          display_label: limpio,
          branch_label: sucursal.trim() || null,
        }),
      "Se guardaron los datos del teléfono.",
    );
  }

  const bloqueado = cuenta.status === "blocked";

  return (
    <li className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{cuenta.display_label}</p>
            <Badge variant="outline">{etiquetaModo(cuenta.mode)}</Badge>
            <Badge variant={bloqueado ? "destructive" : "secondary"}>
              {etiquetaEstadoCuenta(cuenta.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{resumenCuenta(cuenta)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ORIGEN[cuenta.origin]}
            {cuenta.created_by_name ? ` · por ${cuenta.created_by_name}` : ""} ·{" "}
            {cuenta.bindings.filter((b) => b.status === "active").length} chat
            {cuenta.bindings.filter((b) => b.status === "active").length === 1 ? "" : "s"} activo
            {cuenta.bindings.filter((b) => b.status === "active").length === 1 ? "" : "s"}
          </p>
          {bloqueado && (
            <p className="mt-1 text-xs text-destructive">
              Bloqueado el {formatearFecha(cuenta.blocked_at)}
              {cuenta.block_reason ? ` · ${cuenta.block_reason}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={abrirEditar}
            disabled={ocupado}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Editar datos
          </Button>
          {cuenta.mode === "shared_device" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogo("auxiliares")}
              disabled={ocupado}
            >
              <Users className="h-4 w-4" aria-hidden />
              Auxiliares
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialogo("historial")}
            disabled={ocupado}
          >
            <History className="h-4 w-4" aria-hidden />
            Historial
          </Button>
          {bloqueado ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMotivo("");
                setDialogo("reactivar");
              }}
              disabled={ocupado}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reactivar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setMotivo("");
                setDialogo("bloquear");
              }}
              disabled={ocupado}
            >
              <Ban className="h-4 w-4" aria-hidden />
              Bloquear
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogo !== null} onOpenChange={(abierto) => !abierto && setDialogo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {dialogo === "editar" && (
            <>
              <DialogHeader>
                <DialogTitle>Editar teléfono</DialogTitle>
                <DialogDescription>
                  Cambia el nombre o la sucursal. No modifica los auxiliares ni el estado del
                  teléfono.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`cuenta-nombre-${cuenta.id}`}>Nombre</Label>
                  <Input
                    id={`cuenta-nombre-${cuenta.id}`}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`cuenta-sucursal-${cuenta.id}`}>Sucursal (opcional)</Label>
                  <Input
                    id={`cuenta-sucursal-${cuenta.id}`}
                    value={sucursal}
                    onChange={(e) => setSucursal(e.target.value)}
                    maxLength={120}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={guardarDatos} disabled={ocupado}>
                  Guardar cambios
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogo === "bloquear" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Bloquear {cuenta.display_label}?</DialogTitle>
                <DialogDescription>
                  Sus chats dejarán de funcionar y se cerrarán las sesiones abiertas. No se borra
                  nada: el historial se conserva y puedes reactivarlo después.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`motivo-bloqueo-${cuenta.id}`}>Motivo (opcional)</Label>
                <Input
                  id={`motivo-bloqueo-${cuenta.id}`}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={200}
                  placeholder="Ej.: teléfono perdido"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={ocupado}
                  onClick={() =>
                    void ejecutar(
                      () => bloquearCuenta(cuenta.id, motivo),
                      "El teléfono quedó bloqueado. Su historial se conserva.",
                    )
                  }
                >
                  Sí, bloquear
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogo === "reactivar" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Reactivar {cuenta.display_label}?</DialogTitle>
                <DialogDescription>
                  Se habilitarán otra vez sus chats privados. Las personas y auxiliares asociados se
                  mantienen como estaban.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`motivo-reactivar-${cuenta.id}`}>Motivo (opcional)</Label>
                <Input
                  id={`motivo-reactivar-${cuenta.id}`}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={200}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    void ejecutar(
                      () => reactivarCuenta(cuenta.id, motivo),
                      "El teléfono quedó activo otra vez.",
                    )
                  }
                >
                  Sí, reactivar
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogo === "historial" && (
            <>
              <DialogHeader>
                <DialogTitle>Historial de {cuenta.display_label}</DialogTitle>
                <DialogDescription>
                  Movimientos registrados del teléfono y de la solicitud que lo aprobó. No muestra
                  códigos.
                </DialogDescription>
              </DialogHeader>
              <ContenidoHistorial cuentaId={cuenta.id} />
            </>
          )}

          {dialogo === "auxiliares" && (
            <>
              <DialogHeader>
                <DialogTitle>Auxiliares de {cuenta.display_label}</DialogTitle>
                <DialogDescription>
                  Personas habilitadas para reportar desde este teléfono compartido.
                </DialogDescription>
              </DialogHeader>
              <ContenidoAuxiliares cuenta={cuenta} staff={staff} onCambio={onCambio} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function TelefonosSection({
  cuentas,
  staff,
  cargando,
  error,
  recargar,
}: {
  cuentas: CuentaTelegram[];
  staff: PersonaStaff[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}) {
  return (
    <Tarjeta>
      <TituloSeccion
        titulo="Teléfonos autorizados"
        descripcion="Teléfonos que pueden usar el bot. Bloquear o dar de baja conserva todo el historial."
        acciones={<BotonActualizar onClick={() => void recargar()} cargando={cargando} />}
      />

      {error ? (
        <BloqueError mensaje={error} onReintentar={() => void recargar()} />
      ) : cargando && cuentas.length === 0 ? (
        <BloqueCargando texto="Cargando teléfonos…" />
      ) : cuentas.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          Todavía no hay teléfonos autorizados. Aprueba una solicitud para habilitar el primero.
        </p>
      ) : (
        <ul className="space-y-2">
          {cuentas.map((c) => (
            <FilaTelefono key={c.id} cuenta={c} staff={staff} onCambio={recargar} />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
