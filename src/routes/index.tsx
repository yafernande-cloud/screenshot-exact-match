import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Search,
  Store,
  Truck,
  Minus,
  Plus,
  ChevronDown,
  ShoppingCart,
  Check,
  ClipboardList,
  Trash2,
  WifiOff,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { clp, cadenasInfo, faltantesDemo, type CadenaId, type ReporteFaltante } from "@/data/demo";
import {
  buscarOferta,
  cambiarCantidad,
  evaluarLinea,
  mover,
  quitar,
  totalCarrito,
  vaciar,
  type Linea,
} from "@/lib/cotizacion";
import { ajustarCantidad, eliminarReporte } from "@/lib/faltantes";
import {
  buscarCatalogo,
  describirCantidad,
  describirDescuentos,
  describirIva,
  etiquetaUnidad,
  faltantesDeOferta,
  formatearDinero,
  mensajeDeError,
  obtenerArticulo,
  obtenerBusqueda,
  resumenPresentacion,
  type Article,
  type ArticleDetail,
  type Offer,
  type SearchResult,
} from "@/lib/catalogo";
import { SeccionCotizaciones, type CotizacionAcciones } from "@/components/MiCotizacion";
import { MenuPrincipal } from "@/components/MenuPrincipal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cotizador Inteligente Farmacia" },
      {
        name: "description",
        content: "Busca productos de farmacia, revisa faltantes y compara ofertas de proveedores.",
      },
      { property: "og:title", content: "Cotizador Inteligente Farmacia" },
      {
        property: "og:description",
        content: "Busca productos de farmacia, revisa faltantes y compara ofertas de proveedores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");
const CLAVE_CARRITO = "carrito-demo";

function Index() {
  const [q, setQ] = useState("");
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [estadoBusqueda, setEstadoBusqueda] = useState<"inicial" | "buscando" | "listo" | "error">(
    "inicial",
  );
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [avisoBusqueda, setAvisoBusqueda] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [articulo, setArticulo] = useState<ArticleDetail | null>(null);
  const [estadoOfertas, setEstadoOfertas] = useState<"inicial" | "cargando" | "listo" | "error">(
    "inicial",
  );
  const [errorOfertas, setErrorOfertas] = useState<string | null>(null);
  const [reportes, setReportes] = useState<ReporteFaltante[]>(faltantesDemo);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargado, setCargado] = useState(false);

  // Cada búsqueda y cada selección llevan un número: una respuesta vieja nunca pisa a la nueva.
  const busquedaSeq = useRef(0);
  const ofertaSeq = useRef(0);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_CARRITO);
      if (guardado) setLineas(JSON.parse(guardado));
    } catch {
      /* datos de demo: si falla, el carrito parte vacío */
    }
    setCargado(true);
  }, []);
  useEffect(() => {
    if (cargado) sessionStorage.setItem(CLAVE_CARRITO, JSON.stringify(lineas));
  }, [lineas, cargado]);

  const ejecutarBusqueda = async (texto: string) => {
    const t = texto.trim();
    const seq = ++busquedaSeq.current;
    ofertaSeq.current++;
    setQ(t);
    setConsulta(t);
    setResultados([]);
    setSearchId(null);
    setNextCursor(null);
    setAvisoBusqueda(null);
    setCargandoMas(false);
    setSeleccionado(null);
    setArticulo(null);
    setEstadoOfertas("inicial");
    setErrorOfertas(null);

    if (t.length < 3) {
      setEstadoBusqueda(t === "" ? "inicial" : "listo");
      setErrorBusqueda(t === "" ? null : "Escribe al menos 3 caracteres para buscar.");
      return;
    }

    setEstadoBusqueda("buscando");
    setErrorBusqueda(null);
    try {
      const data = await buscarCatalogo(t);
      if (seq !== busquedaSeq.current) return;
      setResultados(data.results);
      setSearchId(data.search_id);
      setNextCursor(data.next_cursor);
      setEstadoBusqueda("listo");
      if (data.status === "failed") {
        setErrorBusqueda("No pudimos completar la búsqueda en el catálogo. Inténtalo otra vez.");
      } else if (data.status === "partial") {
        setAvisoBusqueda(
          "Algunas fuentes no respondieron. Los resultados pueden estar incompletos.",
        );
      }
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      setEstadoBusqueda("error");
      setErrorBusqueda(mensajeDeError(error));
    }
  };

  const seleccionarArticulo = async (resultado: SearchResult) => {
    const seq = ++ofertaSeq.current;
    setSeleccionado(resultado.article_id);
    setArticulo(null);
    setEstadoOfertas("cargando");
    setErrorOfertas(null);
    try {
      const data = await obtenerArticulo(resultado.article_id);
      if (seq !== ofertaSeq.current) return;
      setArticulo(data);
      setEstadoOfertas("listo");
    } catch (error) {
      if (seq !== ofertaSeq.current) return;
      setEstadoOfertas("error");
      setErrorOfertas(mensajeDeError(error));
    }
  };

  const cargarMas = async () => {
    if (!searchId || !nextCursor || cargandoMas) return;
    const seq = busquedaSeq.current;
    setCargandoMas(true);
    try {
      const data = await obtenerBusqueda(searchId, nextCursor);
      if (seq !== busquedaSeq.current) return;
      setResultados((previos) => {
        const vistos = new Set(previos.map((r) => r.article_id));
        return [...previos, ...data.results.filter((r) => !vistos.has(r.article_id))];
      });
      setNextCursor(data.next_cursor);
    } catch (error) {
      if (seq === busquedaSeq.current) toast.error(mensajeDeError(error));
    } finally {
      setCargandoMas(false);
    }
  };

  const acciones: CotizacionAcciones = {
    lineas,
    onCantidad: (id, prov, c) => setLineas((ls) => cambiarCantidad(ls, id, prov, c)),
    onQuitar: (id, prov) => setLineas((ls) => quitar(ls, id, prov)),
    onVaciar: (prov) => setLineas((ls) => vaciar(ls, prov)),
    onMover: (id, desde, hacia) => {
      setLineas((ls) => mover(ls, id, desde, hacia));
      toast(`Producto movido a ${hacia}`);
    },
  };

  const resultadoSeleccionado = resultados.find((r) => r.article_id === seleccionado) ?? null;
  const nombreArticulo =
    articulo?.article.display_name ?? resultadoSeleccionado?.display_name ?? null;
  const buscando = estadoBusqueda === "buscando";

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />

      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-10 pb-24">
        {/* 1. Buscar producto */}
        <section className="flex flex-col items-center pt-10">
          <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight text-primary-foreground md:text-4xl">
            Buscar producto
          </h1>
          <form
            className="relative w-full max-w-5xl"
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutarBusqueda(q);
            }}
          >
            <div className="flex items-center gap-2 rounded-full bg-card py-2 pl-5 pr-2 shadow-soft">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Buscar medicamentos, cremas, shampoo, perfumes y más..."
                aria-label="Buscar producto"
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={buscando}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-green px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-brand-green/90 disabled:opacity-60"
              >
                {buscando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </button>
            </div>
          </form>
          <p className="mt-4 text-xs text-primary-foreground/80">
            Catálogo de demostración: los datos del servidor son simulados
          </p>

          {estadoBusqueda !== "inicial" && (
            <div className="mt-5 w-full max-w-5xl">
              {buscando && (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 rounded-2xl border bg-card px-4 py-6 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando en el catálogo…
                </p>
              )}

              {estadoBusqueda === "error" && errorBusqueda && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {errorBusqueda}
                </p>
              )}

              {estadoBusqueda === "listo" && (
                <div className="space-y-4 rounded-3xl border bg-card p-5">
                  {errorBusqueda && (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{" "}
                      {errorBusqueda}
                    </p>
                  )}
                  {!errorBusqueda && avisoBusqueda && (
                    <p
                      role="status"
                      className="rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
                    >
                      {avisoBusqueda}
                    </p>
                  )}

                  {resultados.length === 0 && !errorBusqueda ? (
                    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      No encontramos coincidencias para «{consulta}». Prueba con otro nombre o
                      principio activo.
                    </p>
                  ) : resultados.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-base font-semibold">Resultados para «{consulta}»</h2>
                        <span className="text-xs text-muted-foreground">
                          {resultados.length} {resultados.length === 1 ? "artículo" : "artículos"} ·
                          datos simulados
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {resultados.map((r) => {
                          const activo = seleccionado === r.article_id;
                          const presentacion = resumenPresentacion(r.presentation);
                          const precio = formatearDinero(r.lowest_verified_price);
                          return (
                            <li key={r.article_id}>
                              <button
                                type="button"
                                onClick={() => void seleccionarArticulo(r)}
                                aria-pressed={activo}
                                className={`flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between ${activo ? "border-brand-green bg-brand-green/5" : ""}`}
                              >
                                <span className="min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="font-medium">{r.display_name}</span>
                                    {activo && (
                                      <Check
                                        className="h-4 w-4 shrink-0 text-brand-green"
                                        aria-hidden
                                      />
                                    )}
                                  </span>
                                  <span className="mt-0.5 block text-sm text-muted-foreground">
                                    {r.identity_summary}
                                    {presentacion ? ` · ${presentacion}` : ""}
                                  </span>
                                </span>
                                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="rounded-full bg-muted px-2 py-0.5">
                                    {r.offer_count} {r.offer_count === 1 ? "oferta" : "ofertas"} ·{" "}
                                    {r.supplier_count}{" "}
                                    {r.supplier_count === 1 ? "proveedor" : "proveedores"}
                                  </span>
                                  {precio && (
                                    <span className="font-medium text-brand-green">
                                      Desde {precio}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {nextCursor && (
                        <button
                          type="button"
                          onClick={() => void cargarMas()}
                          disabled={cargandoMas}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-60"
                        >
                          {cargandoMas && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                          Ver más resultados
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. Grandes farmacias: sin integración real, no se muestran precios */}
        <section id="grandes-farmacias" className="scroll-mt-4 rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Store className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold">Grandes farmacias</h2>
            {consulta && <span className="text-sm text-muted-foreground">· {consulta}</span>}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Aún no hay conexión con las cadenas, por eso no se muestran precios, productos ni
            disponibilidad.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(cadenasInfo) as CadenaId[]).map((id) => (
              <TarjetaCadena key={id} id={id} />
            ))}
          </div>
        </section>

        {/* 3. Faltantes por cotizar */}
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand-green" />
            <h2 className="text-lg font-semibold">Faltantes por cotizar</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {reportes.length} {reportes.length === 1 ? "reporte" : "reportes"} · demo
            </span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Reportes enviados por los auxiliares por Telegram. Cada reporte se ajusta por separado.
          </p>
          {reportes.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay faltantes pendientes.
            </p>
          ) : (
            <ul className="space-y-3">
              {reportes.map((r) => (
                <FilaFaltante
                  key={r.reporteId}
                  r={r}
                  onAjustar={(d) => setReportes((rs) => ajustarCantidad(rs, r.reporteId, d))}
                  onEliminar={() => {
                    setReportes((rs) => eliminarReporte(rs, r.reporteId));
                    toast("Reporte retirado de la bandeja (demo)");
                  }}
                  onBuscar={() => {
                    void ejecutarBusqueda(r.medicamento);
                    document
                      .getElementById("grandes-farmacias")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        {/* 4. Proveedores */}
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Truck className="h-5 w-5 text-brand-green" />
            <h2 className="text-lg font-semibold">Proveedores</h2>
            {nombreArticulo && (
              <span className="text-sm text-muted-foreground">· {nombreArticulo}</span>
            )}
          </div>

          {estadoOfertas === "inicial" && (
            <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {consulta
                ? "Selecciona un artículo de los resultados para ver sus ofertas."
                : "Busca un producto para ver las ofertas de proveedores."}
            </p>
          )}

          {estadoOfertas === "cargando" && (
            <p
              role="status"
              className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando ofertas…
            </p>
          )}

          {estadoOfertas === "error" && errorOfertas && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {errorOfertas}
            </p>
          )}

          {estadoOfertas === "listo" &&
            articulo &&
            (articulo.offers.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Este artículo no tiene ofertas de proveedores informadas.
              </p>
            ) : (
              <>
                <p className="mb-5 text-sm text-muted-foreground">
                  Ofertas informadas por cada proveedor en el catálogo del servidor (datos de
                  demostración). Los campos que el proveedor no informa se muestran como «No
                  informado».
                </p>
                <div className="space-y-4">
                  {articulo.offers.map((oferta) => (
                    <ProveedorFicha
                      key={oferta.offer_id}
                      oferta={oferta}
                      articulo={articulo.article}
                    />
                  ))}
                </div>
              </>
            ))}
        </section>

        {/* 5. Carrito: siempre al final */}
        <Carrito acciones={acciones} />
      </main>
    </div>
  );
}

function TarjetaCadena({ id }: { id: CadenaId }) {
  const info = cadenasInfo[id];
  const campos = ["Producto", "Laboratorio", "Presentación", "Descripción", "Disponibilidad"];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <img
          src={info.logo}
          alt={`Logo ${info.nombre}`}
          className={
            id === "ahumada"
              ? "h-12 min-w-0 max-w-[180px] object-contain object-left sm:h-14 sm:max-w-[200px]"
              : "h-16 min-w-0 max-w-[240px] object-contain object-left sm:h-20 sm:max-w-[280px]"
          }
        />
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <WifiOff className="h-3 w-3" /> Sin conexión
        </span>
      </div>
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted px-1 text-center text-[11px] text-muted-foreground">
          Sin imagen
        </div>
        <dl className="min-w-0 space-y-0.5 text-xs">
          {campos.map((c) => (
            <div key={c}>
              <span className="text-muted-foreground">{c}: </span>
              <span className="text-muted-foreground">—</span>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Precio publicado</p>
          <p className="text-xl font-semibold text-muted-foreground">—</p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-60"
        >
          Ver publicación <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function FilaFaltante({
  r,
  onAjustar,
  onEliminar,
  onBuscar,
}: {
  r: ReporteFaltante;
  onAjustar: (delta: number) => void;
  onEliminar: () => void;
  onBuscar: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{r.medicamento}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Pendiente
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {r.presentacion ? `${r.presentacion} · ` : ""}Reportado por{" "}
          <span className="text-foreground">{r.auxiliar}</span> · {fecha(r.fecha)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border">
          <button
            aria-label={`Disminuir cantidad de ${r.auxiliar}`}
            onClick={() => onAjustar(-1)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-16 text-center text-sm font-medium">
            {r.cantidad} {r.unidad}
          </span>
          <button
            aria-label={`Aumentar cantidad de ${r.auxiliar}`}
            onClick={() => onAjustar(1)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          aria-label={`Eliminar reporte de ${r.auxiliar}`}
          onClick={() => setConfirmar(true)}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          onClick={onBuscar}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90"
        >
          <Search className="h-3.5 w-3.5" /> Buscar
        </button>
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar este reporte?</AlertDialogTitle>
            <AlertDialogDescription>
              {r.medicamento} · {r.cantidad} {r.unidad} · reportado por {r.auxiliar}. Los demás
              reportes no cambian. Retirarlo no equivale a una compra confirmada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEliminar}>Retirar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Carrito({ acciones }: { acciones: CotizacionAcciones }) {
  const { lineas, onQuitar } = acciones;
  const [revisar, setRevisar] = useState(false);
  const t = totalCarrito(lineas);

  return (
    <>
      <section className="rounded-3xl border bg-card p-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-brand-green" />
          <h2 className="text-lg font-semibold">Carrito</h2>
          {lineas.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {lineas.length} {lineas.length === 1 ? "producto" : "productos"}
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Agregar al carrito no confirma una compra ni cierra los faltantes reportados.
        </p>

        {lineas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8" />
            Tu carrito está vacío
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[2fr_1.5fr_0.7fr_1fr_1fr_auto] gap-3 border-b px-3 pb-2 text-xs text-muted-foreground md:grid">
              <span>Producto</span>
              <span>Proveedor</span>
              <span>Cantidad</span>
              <span>Precio unitario</span>
              <span>Subtotal</span>
              <span className="w-8" />
            </div>
            <ul className="divide-y">
              {lineas.map((l) => {
                const r = buscarOferta(l.productoId, l.proveedor);
                if (!r) return null;
                const e = evaluarLinea(l);
                return (
                  <li
                    key={`${l.productoId}:${l.proveedor}`}
                    className="grid grid-cols-2 items-center gap-x-3 gap-y-1 px-3 py-3 text-sm md:grid-cols-[2fr_1.5fr_0.7fr_1fr_1fr_auto]"
                  >
                    <span className="col-span-2 font-medium md:col-span-1">
                      {r.producto.nombre}
                    </span>
                    <span className="text-muted-foreground">
                      {l.proveedor} <span className="text-xs">(demo)</span>
                    </span>
                    <span>
                      <span className="text-xs text-muted-foreground md:hidden">Cantidad: </span>
                      {l.cantidad} u.
                    </span>
                    <span>
                      <span className="text-xs text-muted-foreground md:hidden">Precio: </span>
                      {r.oferta.precioUnitario !== null
                        ? clp(r.oferta.precioUnitario)
                        : "Sin precio"}
                    </span>
                    <span>
                      {e.ok ? (
                        <span className="font-medium">{clp(e.subtotal)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendiente: {e.texto}</span>
                      )}
                    </span>
                    <button
                      aria-label={`Quitar ${r.producto.nombre} de ${l.proveedor}`}
                      onClick={() => onQuitar(l.productoId, l.proveedor)}
                      className="col-start-2 justify-self-end rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive md:col-start-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
              <div>
                <span className="font-semibold">
                  Total: <span className="text-brand-green">{clp(t.total)}</span>
                </span>
                {t.pendientes > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({t.pendientes}{" "}
                    {t.pendientes === 1
                      ? "línea pendiente no incluida"
                      : "líneas pendientes no incluidas"}
                    )
                  </span>
                )}
              </div>
              <button
                onClick={() => setRevisar(!revisar)}
                className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-background"
              >
                Revisar cotización por proveedor{" "}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${revisar ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </>
        )}
      </section>
      {revisar && lineas.length > 0 && <SeccionCotizaciones {...acciones} />}
    </>
  );
}

const NoInformado = () => <span className="text-muted-foreground italic">No informado</span>;

function ProveedorFicha({ oferta, articulo }: { oferta: Offer; articulo: Article }) {
  const [cantidad, setCantidad] = useState(1);
  const [verFaltantes, setVerFaltantes] = useState(false);

  const nombre = oferta.supplier.name;
  const laboratorio = articulo.identity.laboratory;
  const presentacion = resumenPresentacion(articulo.presentation);
  const precio = formatearDinero(oferta.price.money);
  const iva = describirIva(oferta);
  const ivaCorto =
    oferta.price.tax_included === true
      ? "con IVA"
      : oferta.price.tax_included === false
        ? "sin IVA"
        : "IVA no informado";
  const stock =
    oferta.stock.status === "known"
      ? describirCantidad(oferta.stock.quantity, oferta.stock.unit)
      : null;
  const minimo = oferta.minimum.known
    ? describirCantidad(oferta.minimum.quantity, oferta.minimum.unit)
    : null;
  const descuentos = describirDescuentos(oferta);
  const faltantes = faltantesDeOferta(oferta);
  const simulada = oferta.provenance.data_origin === "simulated";
  const unidad = etiquetaUnidad(oferta.sale_unit.code, String(cantidad));

  const datos: [string, ReactNode][] = [
    ["Producto", articulo.display_name],
    ["Laboratorio", laboratorio ?? <NoInformado />],
    ["Presentación", presentacion ?? <NoInformado />],
    ["IVA", iva ?? <NoInformado />],
    ["Stock", stock ?? <NoInformado />],
    ["Descuentos y promociones", descuentos],
    ["Despacho", <NoInformado />],
    ["Mínimo de compra", minimo ?? <NoInformado />],
    ["Condiciones de pago", <NoInformado />],
  ];
  if (oferta.notes) datos.push(["Notas", oferta.notes]);

  return (
    <article className="@container rounded-2xl border p-4">
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue">
            {nombre
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{nombre}</h3>
              {simulada && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Datos simulados
                </span>
              )}
              {!oferta.validity.is_current && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Vigencia vencida
                </span>
              )}
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm @md:grid-cols-2 @5xl:grid-cols-3">
              {datos.map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground">{k}: </span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          {precio ? (
            <div>
              <p className="text-2xl font-semibold text-brand-green">{precio}</p>
              <p className="text-xs text-muted-foreground">
                {oferta.price.basis === "per_base_unit"
                  ? "precio por unidad base"
                  : "precio unitario"}{" "}
                · {ivaCorto}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin precio informado</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Cantidad</span>
            <div className="flex items-center rounded-full border">
              <button
                aria-label={`Menos unidades de ${nombre}`}
                onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                className="p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={1}
                value={cantidad}
                aria-label={`Cantidad a cotizar con ${nombre}`}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                aria-label={`Más unidades de ${nombre}`}
                onClick={() => setCantidad(cantidad + 1)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Total {cantidad}
            {unidad ? ` ${unidad}` : " u."}: se calculará al cotizar
          </p>
          <div className="flex flex-wrap gap-2 @2xl:justify-end">
            <button
              type="button"
              disabled
              title="Disponible próximamente"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Enseñar a la IA
            </button>
            <button
              type="button"
              disabled
              title="Disponible próximamente"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-50"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Agregar a cotización estará disponible próximamente.
          </p>
        </div>
      </div>

      {faltantes.length > 0 && (
        <div className="mt-3 lg:pl-14">
          <button
            onClick={() => setVerFaltantes(!verFaltantes)}
            className="flex items-center gap-1 text-xs text-brand-blue hover:underline"
          >
            ¿Qué falta para calcular el costo completo?{" "}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${verFaltantes ? "rotate-180" : ""}`}
            />
          </button>
          {verFaltantes && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {faltantes.map((f) => (
                <li key={f} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
