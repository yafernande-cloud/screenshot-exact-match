import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Eye, FileDown, History, Loader2, Search } from "lucide-react";
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
  describirTotalUnidad,
  listarCotizaciones,
  mensajeDeErrorCotizacion,
  obtenerInforme,
  type InformeCotizacion as Informe,
  type ResumenCotizacion,
} from "@/lib/cotizacion-api";
import { descargarInformePdf, generarInformePdf, nombreArchivoInforme } from "@/lib/informe-pdf";

/**
 * Historial: solo cotizaciones finalizadas.
 *
 * El carrito en preparación no aparece aquí (vive en «Cotizador»). El detalle es el informe
 * congelado que generó el backend al finalizar; esta pantalla no recalcula precios ni consulta
 * proveedores.
 */
export const Route = createFileRoute("/historial")({
  // Tras finalizar, el Cotizador redirige aquí con el informe recién generado.
  validateSearch: (search: Record<string, unknown>) => ({
    informe: typeof search["informe"] === "string" ? search["informe"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Historial de cotizaciones · Cotizador para farmacia" },
      {
        name: "description",
        content:
          "Consulta las cotizaciones finalizadas y recupera la orden de compra que se generó.",
      },
      { property: "og:title", content: "Historial de cotizaciones · Cotizador para farmacia" },
      {
        property: "og:description",
        content:
          "Consulta las cotizaciones finalizadas y recupera la orden de compra que se generó.",
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
  const { informe: informeSolicitado } = Route.useSearch();
  const [q, setQ] = useState("");
  const [cotizaciones, setCotizaciones] = useState<ResumenCotizacion[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [cargandoInforme, setCargandoInforme] = useState<string | null>(null);
  const [cargandoPdf, setCargandoPdf] = useState<string | null>(null);
  const [pdfBloqueado, setPdfBloqueado] = useState<{
    url: string;
    nombre: string;
    label: string;
  } | null>(null);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const pdfEnCurso = useRef(false);

  // La URL del PDF de respaldo vive mientras el aviso de descarga esté visible.
  useEffect(() => {
    if (!pdfBloqueado) return;
    const { url } = pdfBloqueado;
    return () => URL.revokeObjectURL(url);
  }, [pdfBloqueado]);

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

  const abrirInformePorId = useCallback(async (quoteId: string) => {
    setCargandoInforme(quoteId);
    setErrorInforme(null);
    try {
      const recuperado = await obtenerInforme(quoteId);
      setInforme(recuperado.report);
    } catch (err) {
      setErrorInforme(mensajeDeErrorCotizacion(err));
    } finally {
      setCargandoInforme(null);
    }
  }, []);

  const abrirVista = async (cotizacion: ResumenCotizacion) => {
    if (cargandoInforme) return;
    await abrirInformePorId(cotizacion.quote_id);
  };

  /**
   * Abre el PDF en una pestaña nueva. La pestaña se crea en el mismo clic (antes de esperar la
   * red) para que el navegador no la bloquee; si aun así la bloquea, se ofrece una descarga
   * explícita y nunca se inicia una descarga inesperada.
   */
  const abrirInformePdf = async (cotizacion: ResumenCotizacion) => {
    if (pdfEnCurso.current) return;
    pdfEnCurso.current = true;
    setCargandoPdf(cotizacion.quote_id);
    setErrorInforme(null);
    setPdfBloqueado(null);

    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;

    try {
      // Solo se usa el informe congelado: el PDF no consulta ofertas ni precios actuales.
      const recuperado = await obtenerInforme(cotizacion.quote_id);
      const archivo = generarInformePdf(recuperado.report);
      const url = URL.createObjectURL(archivo);
      const nombre = nombreArchivoInforme(recuperado.report);

      if (ventana && !ventana.closed) {
        ventana.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        setPdfBloqueado({ url, nombre, label: recuperado.report.label });
      }
    } catch (err) {
      ventana?.close();
      setErrorInforme(mensajeDeErrorCotizacion(err));
    } finally {
      pdfEnCurso.current = false;
      setCargandoPdf(null);
    }
  };

  // El informe indicado en la URL se abre solo: es el que se acaba de generar al finalizar.
  useEffect(() => {
    if (informeSolicitado) void abrirInformePorId(informeSolicitado);
  }, [informeSolicitado, abrirInformePorId]);

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
          bajada="Solo cotizaciones finalizadas. Cada una conserva la orden de compra con los precios que se eligieron."
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
                placeholder="Buscar por número de orden de compra"
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
              Todavía no hay cotizaciones finalizadas. Cuando generes una orden de compra desde
              «Cotizador», aparecerá aquí con sus precios guardados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Orden de compra</th>
                    <th className="py-2 pr-4 font-medium">Finalizada</th>
                    <th className="py-2 pr-4 font-medium">Proveedores</th>
                    <th className="py-2 pr-4 font-medium">Referencias</th>
                    <th className="py-2 pr-4 font-medium">Cantidades</th>
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
                      <td className="py-3 pr-4">
                        {c.line_count}
                        {c.distinct_product_count != null &&
                          c.distinct_product_count !== c.line_count && (
                            <span className="block text-xs text-muted-foreground">
                              {c.distinct_product_count}{" "}
                              {c.distinct_product_count === 1
                                ? "producto distinto"
                                : "productos distintos"}
                            </span>
                          )}
                      </td>
                      <td className="py-3 pr-4">
                        {c.quantity_totals && c.quantity_totals.length > 0 ? (
                          c.quantity_totals.map((total) => describirTotalUnidad(total)).join(" + ")
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs text-brand-green">
                          Finalizada
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => void abrirVista(c)}
                            disabled={cargandoInforme === c.quote_id}
                            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-background disabled:opacity-60"
                          >
                            {cargandoInforme === c.quote_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Ver vista
                          </button>
                          <button
                            onClick={() => void abrirInformePdf(c)}
                            disabled={cargandoPdf === c.quote_id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-brand-blue/90 disabled:opacity-60"
                          >
                            {cargandoPdf === c.quote_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <FileDown className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Ver orden de compra
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
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

          {pdfBloqueado && (
            <div
              role="status"
              className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm"
            >
              <FileDown className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
              <span>
                El navegador bloqueó la pestaña de la orden de compra {pdfBloqueado.label}. Puedes
                descargarla aquí.
              </span>
              <button
                onClick={() => descargarInformePdf(pdfBloqueado.url, pdfBloqueado.nombre)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-blue px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-brand-blue/90"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Descargar PDF
              </button>
              <button
                onClick={() => setPdfBloqueado(null)}
                className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-background"
              >
                Cerrar
              </button>
            </div>
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
            <DialogTitle>Orden de compra</DialogTitle>
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
