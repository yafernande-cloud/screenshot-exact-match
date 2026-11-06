import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, CheckCircle2, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";

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
  cambiarActividadPersona,
  cambiarDisponibilidadPersona,
  crearAuxiliar,
  renombrarPersona,
  type MotivoAusencia,
  type PersonaStaff,
} from "@/lib/telegram-api";
import {
  describirPersona,
  mensajeDeErrorTelegram,
  MOTIVOS_AUSENCIA,
  personalOperativo,
  personaConNombre,
} from "@/lib/telegram";
import {
  BloqueCargando,
  BloqueError,
  BotonActualizar,
  Tarjeta,
  TituloSeccion,
  inputClass,
} from "./Comunes";

const ROLES: Record<string, string> = {
  auxiliary: "Auxiliar",
  purchasing: "Compras",
  admin: "Administradora",
  approver: "Aprobador",
};

type Dialogo = "renombrar" | "desactivar" | "ausencia";

function FilaAuxiliar({
  persona,
  onCambio,
}: {
  persona: PersonaStaff;
  onCambio: () => Promise<void>;
}) {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState(persona.display_name);
  const [motivo, setMotivo] = useState<MotivoAusencia>("vacation");
  const [nota, setNota] = useState("");

  async function ejecutar(accion: () => Promise<unknown>, mensajeExito: string) {
    setOcupado(true);
    try {
      await accion();
      toast.success(mensajeExito);
      setDialogo(null);
      await onCambio();
    } catch (error) {
      toast.error(mensajeDeErrorTelegram(error, "No pudimos guardar el cambio."));
    } finally {
      setOcupado(false);
    }
  }

  function abrirRenombrar() {
    setNombre(persona.display_name);
    setDialogo("renombrar");
  }

  function abrirAusencia() {
    setMotivo("vacation");
    setNota("");
    setDialogo("ausencia");
  }

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe el nombre.");
      return;
    }
    if (limpio === persona.display_name) {
      setDialogo(null);
      return;
    }
    void ejecutar(() => renombrarPersona(persona.id, limpio), `Se cambió el nombre a «${limpio}».`);
  }

  function marcarNoDisponible() {
    void ejecutar(
      () => cambiarDisponibilidadPersona(persona.id, false, motivo, nota.trim() || null),
      `${persona.display_name} quedó como no disponible.`,
    );
  }

  const roles = persona.roles.map((r) => ROLES[r] ?? r).join(" · ");

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{persona.display_name}</p>
          <Badge variant={persona.member_active ? "secondary" : "outline"}>
            {persona.member_active ? "Activo" : "Desactivado"}
          </Badge>
          {persona.member_active && (
            <Badge variant={persona.available ? "secondary" : "outline"}>
              {describirPersona(persona)}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {roles} · {persona.observations_authored} aviso
          {persona.observations_authored === 1 ? "" : "s"} registrado
          {persona.observations_authored === 1 ? "" : "s"}
          {persona.absence_note ? ` · Nota: ${persona.absence_note}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={abrirRenombrar}
          disabled={ocupado}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Cambiar nombre
        </Button>

        {persona.member_active &&
          (persona.available ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={abrirAusencia}
              disabled={ocupado}
            >
              <CalendarOff className="h-4 w-4" aria-hidden />
              No disponible
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() =>
                void ejecutar(
                  () => cambiarDisponibilidadPersona(persona.id, true),
                  `${persona.display_name} vuelve a estar disponible.`,
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Marcar disponible
            </Button>
          ))}

        {persona.member_active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDialogo("desactivar")}
            disabled={ocupado}
          >
            <UserX className="h-4 w-4" aria-hidden />
            Desactivar
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocupado}
            onClick={() =>
              void ejecutar(
                () => cambiarActividadPersona(persona.id, true),
                `${persona.display_name} quedó activa otra vez.`,
              )
            }
          >
            <UserCheck className="h-4 w-4" aria-hidden />
            Activar
          </Button>
        )}
      </div>

      <Dialog open={dialogo !== null} onOpenChange={(abierto) => !abierto && setDialogo(null)}>
        <DialogContent>
          {dialogo === "renombrar" && (
            <>
              <DialogHeader>
                <DialogTitle>Cambiar nombre</DialogTitle>
                <DialogDescription>
                  El nuevo nombre se usará en los reportes y en los teléfonos donde participe.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`nombre-${persona.id}`}>Nombre</Label>
                <Input
                  id={`nombre-${persona.id}`}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={guardarNombre} disabled={ocupado}>
                  Guardar nombre
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogo === "desactivar" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Desactivar a {persona.display_name}?</DialogTitle>
                <DialogDescription>
                  Dejará de poder reportar faltantes. No se borra nada: sus reportes, sesiones e
                  historial se conservan y puedes activarla otra vez cuando quieras.
                </DialogDescription>
              </DialogHeader>
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
                      () => cambiarActividadPersona(persona.id, false),
                      `${persona.display_name} quedó desactivada. Su historial se conserva.`,
                    )
                  }
                >
                  Sí, desactivar
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogo === "ausencia" && (
            <>
              <DialogHeader>
                <DialogTitle>Marcar como no disponible</DialogTitle>
                <DialogDescription>
                  Mientras no esté disponible, {persona.display_name} no podrá reportar faltantes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`motivo-${persona.id}`}>Motivo</Label>
                  <select
                    id={`motivo-${persona.id}`}
                    className={inputClass}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value as MotivoAusencia)}
                  >
                    {MOTIVOS_AUSENCIA.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`nota-${persona.id}`}>Nota (opcional)</Label>
                  <Input
                    id={`nota-${persona.id}`}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    maxLength={200}
                    placeholder="Ej.: vuelve el lunes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={marcarNoDisponible} disabled={ocupado}>
                  Guardar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function AuxiliaresSection({
  staff,
  cargando,
  error,
  recargar,
}: {
  staff: PersonaStaff[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const personas = useMemo(
    () =>
      personalOperativo(staff).sort((a, b) => {
        if (a.member_active !== b.member_active) return a.member_active ? -1 : 1;
        return a.display_name.localeCompare(b.display_name, "es");
      }),
    [staff],
  );

  const coincidencia = personaConNombre(staff, nombre);
  const bloqueado = Boolean(coincidencia?.member_active);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe el nombre del auxiliar.");
      return;
    }
    setCreando(true);
    try {
      const creada = await crearAuxiliar(limpio);
      toast.success(`✅ ${creada.display_name} quedó creada como auxiliar.`);
      setNombre("");
      await recargar();
    } catch (err) {
      toast.error(mensajeDeErrorTelegram(err, "No pudimos crear el auxiliar."));
    } finally {
      setCreando(false);
    }
  }

  return (
    <Tarjeta>
      <TituloSeccion
        titulo="Auxiliares"
        descripcion="Personas que pueden reportar faltantes por Telegram. Desactivar no borra su historial."
        acciones={<BotonActualizar onClick={() => void recargar()} cargando={cargando} />}
      />

      <form onSubmit={crear} className="mb-5 space-y-2">
        <Label htmlFor="nuevo-auxiliar">Agregar una persona</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="nuevo-auxiliar"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            maxLength={100}
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={creando || !nombre.trim() || bloqueado}>
            <UserPlus className="h-4 w-4" aria-hidden />
            {creando ? "Creando…" : "Agregar auxiliar"}
          </Button>
        </div>
        {coincidencia && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            {coincidencia.member_active ? (
              <>
                Ya existe <strong>{coincidencia.display_name}</strong> y está activa. Revisa su
                estado en la lista antes de crear otra persona.
              </>
            ) : (
              <>
                Ya existe <strong>{coincidencia.display_name}</strong>, pero está desactivada.
                Puedes activarla en la lista en vez de crear una nueva.
              </>
            )}
          </div>
        )}
      </form>

      {error ? (
        <BloqueError mensaje={error} onReintentar={() => void recargar()} />
      ) : cargando && personas.length === 0 ? (
        <BloqueCargando texto="Cargando auxiliares…" />
      ) : personas.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          Todavía no hay auxiliares. Agrega a la primera persona con el formulario de arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {personas.map((p) => (
            <FilaAuxiliar key={p.id} persona={p} onCambio={recargar} />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
