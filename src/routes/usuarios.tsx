import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import {
  BloqueCargando,
  BloqueError,
  BotonActualizar,
  Tarjeta,
} from "@/components/telegram/Comunes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/session";
import {
  eliminarAccesoWeb,
  listarUsuariosWeb,
  mensajeDeErrorSolicitud,
  puedeAdministrarAccesoWeb,
  type UsuarioWeb,
} from "@/lib/web-access-api";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Gestión de usuarios · Cotizador para farmacia" },
      {
        name: "description",
        content: "Personas con acceso web vigente y eliminación de autorizaciones.",
      },
    ],
  }),
  component: Usuarios,
});

const ROLES: Record<string, string> = {
  admin: "Administradora",
  purchasing: "Compras",
  auxiliary: "Auxiliar",
  approver: "Aprobador",
};

function rolLabel(rol: string): string {
  return ROLES[rol] ?? rol;
}

function fecha(iso: string): string {
  const valor = new Date(iso);
  if (Number.isNaN(valor.getTime())) return "fecha no informada";
  return valor.toLocaleDateString("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" });
}

/**
 * «Gestión de usuarios»: solo personas con autorización web vigente de la organización.
 *
 * El listado, las protecciones (superadministradora, cuenta propia, última administradora) y la
 * eliminación real de la autorización los valida el backend; esta pantalla no los imita.
 */
export function Usuarios() {
  const { profile } = useSession();
  const autorizado = puedeAdministrarAccesoWeb(profile?.roles);
  const [usuarios, setUsuarios] = useState<UsuarioWeb[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<UsuarioWeb | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const enCurso = useRef(false);
  // Reflejo defensivo de la regla del backend; él sigue siendo la autoridad final.
  const adminsWeb = usuarios.filter((u) => u.roles.includes("admin")).length;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarUsuariosWeb();
      setUsuarios(data.items);
    } catch (fallo) {
      setError(mensajeDeErrorSolicitud(fallo));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!autorizado) return;
    void cargar();
  }, [autorizado, cargar]);

  const cerrarModal = useCallback(() => {
    if (eliminando) return;
    setObjetivo(null);
    setErrorModal(null);
  }, [eliminando]);

  const confirmarEliminacion = useCallback(async () => {
    if (!objetivo || enCurso.current) return;
    enCurso.current = true;
    setEliminando(true);
    setErrorModal(null);
    try {
      const resultado = await eliminarAccesoWeb(objetivo.user_id);
      setObjetivo(null);
      toast.success(
        resultado.removed
          ? `Acceso web eliminado para ${resultado.display_name}.`
          : `${resultado.display_name} ya no tenía una autorización vigente.`,
      );
      await cargar();
    } catch (fallo) {
      setErrorModal(mensajeDeErrorSolicitud(fallo));
    } finally {
      enCurso.current = false;
      setEliminando(false);
    }
  }, [cargar, objetivo]);

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-6 pb-24">
        <EncabezadoPagina
          titulo="Gestión de usuarios"
          bajada="Personas con acceso web vigente en tu farmacia. Eliminar el acceso conserva su identidad, su historial y su acceso a Telegram."
        />

        {!autorizado ? (
          <Tarjeta>
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-brand-blue" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold">Solo para administradoras</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Esta gestión la realiza una persona con perfil de administración de la farmacia.
                </p>
              </div>
            </div>
          </Tarjeta>
        ) : (
          <Tarjeta>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Accesos web vigentes ({usuarios.length})</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  La persona eliminada podrá volver a solicitar acceso y necesitará una nueva
                  aprobación.
                </p>
              </div>
              <BotonActualizar onClick={() => void cargar()} cargando={cargando} />
            </div>

            {error && usuarios.length === 0 ? (
              <BloqueError mensaje={error} onReintentar={() => void cargar()} />
            ) : cargando && usuarios.length === 0 ? (
              <BloqueCargando texto="Cargando accesos web…" />
            ) : usuarios.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No hay personas con acceso web vigente.
              </p>
            ) : (
              <ul className="divide-y">
                {usuarios.map((u) => (
                  <li
                    key={u.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UserRound className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="truncate">{u.display_name}</span>
                          {u.is_superadmin && (
                            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                              Superadministradora
                            </span>
                          )}
                          {u.is_self && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Tu cuenta
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email ?? "Sin correo registrado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.roles.map(rolLabel).join(" · ")}
                          {u.web_access_expires_at
                            ? ` · Vence el ${fecha(u.web_access_expires_at)}`
                            : " · Sin vencimiento automático"}
                        </p>
                      </div>
                    </div>

                    {u.is_superadmin ||
                    u.is_self ||
                    (u.roles.includes("admin") && adminsWeb <= 1) ? (
                      <p className="text-xs text-muted-foreground">
                        {u.is_superadmin
                          ? "Protegida"
                          : u.is_self
                            ? "No puedes eliminar tu propio acceso"
                            : "Última administradora web"}
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() => {
                          setErrorModal(null);
                          setObjetivo(u);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Eliminar acceso
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {error && usuarios.length > 0 && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}
          </Tarjeta>
        )}
      </main>

      <Dialog open={objetivo !== null} onOpenChange={(abierto) => !abierto && cerrarModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás segura de eliminar este usuario?</DialogTitle>
            <DialogDescription>
              {objetivo
                ? `Se eliminará la autorización web de ${objetivo.display_name}. Su identidad, su historial y su acceso a Telegram se conservan. Podrá volver a solicitar acceso y necesitará una nueva aprobación.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {errorModal && (
            <p role="alert" className="text-sm text-destructive">
              {errorModal}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrarModal} disabled={eliminando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmarEliminacion()}
              disabled={eliminando}
            >
              {eliminando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {eliminando ? "Eliminando…" : "Confirmar eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
