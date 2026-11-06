import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Send, ShieldAlert } from "lucide-react";

import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuxiliaresSection } from "@/components/telegram/AuxiliaresSection";
import { SolicitudesSection } from "@/components/telegram/SolicitudesSection";
import { TelefonosSection } from "@/components/telegram/TelefonosSection";
import { Tarjeta } from "@/components/telegram/Comunes";
import { useSession } from "@/lib/session";
import { listarCuentasTelegram, listarPersonal } from "@/lib/telegram-api";
import type { CuentaTelegram, PersonaStaff } from "@/lib/telegram-api";
import {
  mensajeDeErrorTelegram,
  personalOperativo,
  puedeAdministrarTelegram,
} from "@/lib/telegram";

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: "Configuración de Telegram · Cotizador para farmacia" },
      {
        name: "description",
        content: "Administra auxiliares, solicitudes de acceso y teléfonos autorizados del bot.",
      },
      { property: "og:title", content: "Configuración de Telegram · Cotizador para farmacia" },
      {
        property: "og:description",
        content: "Administra auxiliares, solicitudes de acceso y teléfonos autorizados del bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Telegram,
});

function Telegram() {
  const { profile } = useSession();
  const autorizado = puedeAdministrarTelegram(profile?.roles);

  const [staff, setStaff] = useState<PersonaStaff[]>([]);
  const [cuentas, setCuentas] = useState<CuentaTelegram[]>([]);
  const [cargandoPersonal, setCargandoPersonal] = useState(false);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [errorPersonal, setErrorPersonal] = useState<string | null>(null);
  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);

  const cargarPersonal = useCallback(async () => {
    setCargandoPersonal(true);
    setErrorPersonal(null);
    try {
      setStaff(await listarPersonal(true));
    } catch (error) {
      setErrorPersonal(
        mensajeDeErrorTelegram(error, "No pudimos cargar el personal. Inténtalo otra vez."),
      );
    } finally {
      setCargandoPersonal(false);
    }
  }, []);

  const cargarCuentas = useCallback(async () => {
    setCargandoCuentas(true);
    setErrorCuentas(null);
    try {
      setCuentas(await listarCuentasTelegram());
    } catch (error) {
      setErrorCuentas(
        mensajeDeErrorTelegram(
          error,
          "No pudimos cargar los teléfonos autorizados. Inténtalo otra vez.",
        ),
      );
    } finally {
      setCargandoCuentas(false);
    }
  }, []);

  useEffect(() => {
    if (!autorizado) return;
    void Promise.all([cargarPersonal(), cargarCuentas()]);
  }, [autorizado, cargarPersonal, cargarCuentas]);

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-6 pb-24">
        <EncabezadoPagina
          titulo="Configuración de Telegram"
          bajada="Administra los auxiliares, las solicitudes de acceso y los teléfonos autorizados del bot. Los cambios se guardan en el sistema."
        />

        {!autorizado ? (
          <Tarjeta>
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-brand-blue" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold">Solo para administradoras</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Esta configuración la administra una persona con perfil de administración. Si
                  necesitas cambiar un auxiliar o un teléfono, pídeselo a una administradora de la
                  farmacia.
                </p>
              </div>
            </div>
          </Tarjeta>
        ) : (
          <Tabs defaultValue="auxiliares" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="auxiliares" className="px-4 py-2">
                Auxiliares ({personalOperativo(staff).length})
              </TabsTrigger>
              <TabsTrigger value="solicitudes" className="px-4 py-2">
                Solicitudes de acceso
              </TabsTrigger>
              <TabsTrigger value="telefonos" className="px-4 py-2">
                Teléfonos ({cuentas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="auxiliares">
              <AuxiliaresSection
                staff={staff}
                cargando={cargandoPersonal}
                error={errorPersonal}
                recargar={cargarPersonal}
              />
            </TabsContent>

            <TabsContent value="solicitudes">
              <SolicitudesSection staff={staff} onCuentasCambiadas={cargarCuentas} />
            </TabsContent>

            <TabsContent value="telefonos">
              <TelefonosSection
                cuentas={cuentas}
                staff={staff}
                cargando={cargandoCuentas}
                error={errorCuentas}
                recargar={cargarCuentas}
              />
            </TabsContent>
          </Tabs>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-primary-foreground/80">
          <Send className="h-3 w-3" aria-hidden />
          El código de acceso se comparte solo por Telegram. Esta pantalla nunca lo muestra.
        </p>
      </main>
    </div>
  );
}
