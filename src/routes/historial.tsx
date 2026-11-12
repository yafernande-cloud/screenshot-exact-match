import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, FileText, History, Loader2, Search } from "lucide-react";
import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { InformeCotizacion } from "@/components/InformeCotizacion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listarCotizaciones,
  mensajeDeErrorCotizacion,
  obtenerInforme,
  type InformeCotizacion as Informe,
  type ResumenCotizacion,
} from "@/lib/cotizacion-api";

/**
 * Historial: solo cotizaciones finalizadas.
 *
 * El carrito en preparación no aparece aquí (vive en «Cotizador»). El detalle es el informe
 * congelado que generó el backend al finalizar; esta pantalla no recalcula precios ni consulta
 * proveedores.
 */
export const Route = createFileRoute("/historial")({
  head: () => ({
    meta: [
      { title: "Historial de cotizaciones · Cotizador para farmacia" },
      {
        name: "description",
        content: "Consulta las cotizaciones finalizadas y recupera el informe que se generó.",
      },
      { property: "og:title", content: "Historial de cotizaciones · Cotizador para farmacia" },
      {
        property: "og:description",
        content: "Consulta las cotizaciones finalizadas y recupera el informe que se generó.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historial,
});

function fechaDeFinalizacion(iso: string | null): string {
  if (!iso) return "fecha no informada";
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime())
    ? "fecha no informada"
    : valor.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

function Historial() {
  const [q, setQ] = useState("");
  const [cotizaciones, setCotizaciones] = useState<ResumenCotizacion[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [cargandoInforme, setCargandoInforme] = useState<string | null>(null);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado("cargando");
    try {
      // `finalized=true` excluye el borrador: el historial nunca muestra el carrito activo.
      setCotizaciones(await listarCotizaciones({ finalized: true, limit: 50 }));
      setEstado("listo");
      setError(null);
    } catch (err) {
      setError(mensajeDeErrorCotizacion(err));
      setEstado("error");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirInforme = async (cotizacion: ResumenCotizacion) => {
    if (cargandoInforme) return;
    setCargandoInforme(cotizacion.quote_id);
    setErrorInforme(null);
    try {
      const recuperado = await obtenerInforme(cotizacion.quote_id);
      setInforme(recuperado.report);
    } catch (err) {
      setErrorInforme(mensajeDeErrorCotizacion(err));
    } finally {
      setCargandoInforme(null);
    }
  };

  const texto = q.trim().toLowerCase();
  const filas = texto
    ? cotizaciones.filter((c) =>
        [c.report_label, c.title].filter(Boolean).join(" ").toLowerCase().includes(texto),
      )
    : cotizaciones;

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 pb-24">
        <EncabezadoPagina
          titulo="Historial de cotizaciones"
          bajada="Solo cotizaciones finalizadas. Cada una conserva el informe con los precios que se eligieron."
        />
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-brand-blue" />
              <h2 className="text-lg font-semibold">Cotizaciones finalizadas</h2>
              {estado === "listo" && cotizaciones.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {cotizaciones.length} {cotizaciones.length === 1 ? "cotización" : "cotizaciones"}
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 rounded-full border px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por número de informe"
                aria-label="Buscar cotizaciones finalizadas"
                className="bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              <button
                onClick={() => void cargar()}
                className="ml-auto rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-background"
              >
                Reintentar
              </button>
            </p>
          )}

          {estado === "cargando" ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando el historial…
            </p>
          ) : estado === "listo" && cotizaciones.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Todavía no hay cotizaciones finalizadas. Cuando generes un informe desde «Cotizador»,
              aparecerá aquí con sus precios guardados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Informe</th>
                    <th className="py-2 pr-4 font-medium">Finalizada</th>
                    <th className="py-2 pr-4 font-medium">Proveedores</th>
                    <th className="py-2 pr-4 font-medium">Productos</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filas.map((c) => (
                    <tr key={c.quote_id}>
                      <td className="py-3 pr-4 font-medium">
                        {c.report_label ?? "Sin número"}
                        {c.title && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {c.title}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">{fechaDeFinalizacion(c.finalized_at)}</td>
                      <td className="py-3 pr-4">{c.supplier_count}</td>
                      <td className="py-3 pr-4">{c.line_count}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs text-brand-green">
                          Finalizada
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => void abrirInforme(c)}
                          disabled={cargandoInforme === c.quote_id}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-background disabled:opacity-60"
                        >
                          {cargandoInforme === c.quote_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Ver informe
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        Ninguna cotización finalizada coincide con «{q}».
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {errorInforme && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {errorInforme}
            </p>
          )}
        </section>
      </main>

      <Dialog
        open={informe !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setInforme(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Informe de cotización</DialogTitle>
            <DialogDescription>
              Copia guardada al finalizar: no cambia aunque los proveedores actualicen sus precios.
            </DialogDescription>
          </DialogHeader>
          {informe && <InformeCotizacion informe={informe} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
