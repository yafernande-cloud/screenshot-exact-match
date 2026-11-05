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
  ClipboardList,
  Trash2,
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
  resumenPresentacion,
  type Article,
  type Offer,
  type SearchResult,
} from "@/lib/catalogo";
import {
  buscarCadenasAhumada,
  buscarCadenasCruzVerde,
  buscarCadenasSalcobrand,
  estadoFuenteAhumada,
  estadoFuenteCruzVerde,
  estadoFuenteSalcobrand,
  mensajeDeErrorCadena,
  type ChainSource,
  type EstadoFuenteAhumada,
  type EstadoFuenteCruzVerde,
  type EstadoFuenteSalcobrand,
} from "@/lib/cadenas";
import { TarjetaAhumada } from "@/components/TarjetaAhumada";
import { TarjetaCruzVerde } from "@/components/TarjetaCruzVerde";
import { TarjetaSalcobrand } from "@/components/TarjetaSalcobrand";
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

/** Una oferta siempre va acompañada del artículo al que pertenece; nunca se mezclan artículos. */
interface OfertaConArticulo {
  oferta: Offer;
  articulo: Article;
}

function Index() {
  const [q, setQ] = useState("");
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [ofertas, setOfertas] = useState<OfertaConArticulo[]>([]);
  const [estadoBusqueda, setEstadoBusqueda] = useState<"inicial" | "buscando" | "listo" | "error">(
    "inicial",
  );
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [avisoBusqueda, setAvisoBusqueda] = useState<string | null>(null);
  const [estadoOfertas, setEstadoOfertas] = useState<"inicial" | "cargando" | "listo" | "error">(
    "inicial",
  );
  // E15: cada tarjeta tiene su propio estado para no bloquear la búsqueda de proveedores ni a la
  // otra cadena.
  const [fuenteAhumada, setFuenteAhumada] = useState<ChainSource | null>(null);
  const [estadoCadenas, setEstadoCadenas] = useState<"inicial" | "cargando" | "listo" | "error">(
    "inicial",
  );
  const [errorCadenas, setErrorCadenas] = useState<string | null>(null);
  const [fuenteSalcobrand, setFuenteSalcobrand] = useState<ChainSource | null>(null);
  const [estadoCadenasSalcobrand, setEstadoCadenasSalcobrand] = useState<
    "inicial" | "cargando" | "listo" | "error"
  >("inicial");
  const [errorSalcobrand, setErrorSalcobrand] = useState<string | null>(null);
  const [fuenteCruzVerde, setFuenteCruzVerde] = useState<ChainSource | null>(null);
  const [estadoCadenasCruzVerde, setEstadoCadenasCruzVerde] = useState<
    "inicial" | "cargando" | "listo" | "error"
  >("inicial");
  const [errorCruzVerde, setErrorCruzVerde] = useState<string | null>(null);
  const [reportes, setReportes] = useState<ReporteFaltante[]>(faltantesDemo);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargado, setCargado] = useState(false);

  // Cada búsqueda lleva un número: una respuesta vieja nunca pisa a la nueva.
  const busquedaSeq = useRef(0);

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

  // E15 corre en paralelo con la búsqueda de proveedores: si una cadena falla, las demás siguen.
  // Cada cadena usa su propia solicitud E15 para que un fallo o una demora de Salcobrand no
  // retrase ni altere el resultado de Ahumada.
  const ejecutarAhumada = async (texto: string, seq: number) => {
    try {
      const fuente = await buscarCadenasAhumada(texto);
      if (seq !== busquedaSeq.current) return;
      setFuenteAhumada(fuente);
      setEstadoCadenas("listo");
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      setFuenteAhumada(null);
      setEstadoCadenas("error");
      setErrorCadenas(mensajeDeErrorCadena(error));
    }
  };

  const ejecutarSalcobrand = async (texto: string, seq: number) => {
    try {
      const fuente = await buscarCadenasSalcobrand(texto);
      if (seq !== busquedaSeq.current) return;
      setFuenteSalcobrand(fuente);
      setEstadoCadenasSalcobrand("listo");
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      setFuenteSalcobrand(null);
      setEstadoCadenasSalcobrand("error");
      setErrorSalcobrand(mensajeDeErrorCadena(error));
    }
  };

  const ejecutarCruzVerde = async (texto: string, seq: number) => {
    try {
      const fuente = await buscarCadenasCruzVerde(texto);
      if (seq !== busquedaSeq.current) return;
      setFuenteCruzVerde(fuente);
      setEstadoCadenasCruzVerde("listo");
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      setFuenteCruzVerde(null);
      setEstadoCadenasCruzVerde("error");
      setErrorCruzVerde(mensajeDeErrorCadena(error));
    }
  };

  const ejecutarBusqueda = async (texto: string) => {
    const t = texto.trim();
    const seq = ++busquedaSeq.current;
    setQ(t);
    setConsulta(t);
    setResultados([]);
    setOfertas([]);
    setAvisoBusqueda(null);
    setErrorBusqueda(null);
    setFuenteAhumada(null);
    setErrorCadenas(null);
    setFuenteSalcobrand(null);
    setErrorSalcobrand(null);
    setFuenteCruzVerde(null);
    setErrorCruzVerde(null);

    if (t.length < 3) {
      const corto = t !== "";
      setEstadoBusqueda(corto ? "error" : "inicial");
      setEstadoOfertas(corto ? "error" : "inicial");
      setEstadoCadenas("inicial");
      setEstadoCadenasSalcobrand("inicial");
      setEstadoCadenasCruzVerde("inicial");
      setErrorBusqueda(corto ? "Escribe al menos 3 caracteres para buscar." : null);
      return;
    }

    setEstadoBusqueda("buscando");
    setEstadoOfertas("cargando");
    setEstadoCadenas("cargando");
    setEstadoCadenasSalcobrand("cargando");
    setEstadoCadenasCruzVerde("cargando");
    // Las cadenas arrancan cuando el catálogo ya respondió: así no hay dos solicitudes autenticadas
    // compitiendo por la misma renovación de sesión al mismo tiempo.
    let cadenaIniciada = false;
    const iniciarCadena = () => {
      if (cadenaIniciada) return;
      cadenaIniciada = true;
      void ejecutarAhumada(t, seq);
      void ejecutarSalcobrand(t, seq);
      void ejecutarCruzVerde(t, seq);
    };
    try {
      const data = await buscarCatalogo(t);
      iniciarCadena();
      if (seq !== busquedaSeq.current) return;
      setResultados(data.results);

      if (data.status === "failed") {
        setEstadoBusqueda("error");
        setEstadoOfertas("error");
        setErrorBusqueda("No pudimos completar la búsqueda en el catálogo. Inténtalo otra vez.");
        return;
      }

      // Solo se piden las ofertas de los artículos que el backend informa con ofertas. Cada
      // oferta queda ligada a su propio artículo para no mezclar presentaciones ni precios.
      // Se piden en serie: una sola renovación de sesión sirve para todas las consultas.
      const conOfertas = data.results.filter((r) => r.offer_count > 0);
      const vistas = new Set<string>();
      const encontradas: OfertaConArticulo[] = [];
      let fallidas = 0;
      let primerError: unknown = null;
      for (const resultado of conOfertas) {
        try {
          const detalle = await obtenerArticulo(resultado.article_id);
          if (seq !== busquedaSeq.current) return;
          for (const oferta of detalle.offers) {
            if (vistas.has(oferta.offer_id)) continue;
            vistas.add(oferta.offer_id);
            encontradas.push({ oferta, articulo: detalle.article });
          }
        } catch (error) {
          if (seq !== busquedaSeq.current) return;
          fallidas += 1;
          primerError ??= error;
        }
      }
      setOfertas(encontradas);

      if (fallidas > 0 && encontradas.length === 0 && conOfertas.length > 0) {
        setEstadoBusqueda("error");
        setEstadoOfertas("error");
        setErrorBusqueda(mensajeDeError(primerError));
        return;
      }

      const avisos: string[] = [];
      if (data.status === "partial") {
        avisos.push("Algunas fuentes no respondieron. Los resultados pueden estar incompletos.");
      }
      if (fallidas > 0) {
        avisos.push("No pudimos cargar las ofertas de algunos artículos.");
      }
      setAvisoBusqueda(avisos.length > 0 ? avisos.join(" ") : null);
      setEstadoBusqueda("listo");
      setEstadoOfertas("listo");
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      iniciarCadena();
      setEstadoBusqueda("error");
      setEstadoOfertas("error");
      setErrorBusqueda(mensajeDeError(error));
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

  const buscando = estadoBusqueda === "buscando";
  const estadoAhumada = estadoFuenteAhumada(estadoCadenas, fuenteAhumada, errorCadenas);
  const estadoSalcobrand = estadoFuenteSalcobrand(
    estadoCadenasSalcobrand,
    fuenteSalcobrand,
    errorSalcobrand,
  );
  const estadoCruzVerde = estadoFuenteCruzVerde(
    estadoCadenasCruzVerde,
    fuenteCruzVerde,
    errorCruzVerde,
  );

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
            Prototipo con datos de demostración
          </p>
        </section>

        {/* 2. Grandes farmacias: referencia publicada; nunca alimenta el carrito */}
        <section id="grandes-farmacias" className="scroll-mt-4 rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Store className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold">Grandes farmacias</h2>
            {consulta && <span className="text-sm text-muted-foreground">· {consulta}</span>}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Precios e información publicados por cada cadena. Cuando una cadena no tiene conexión
            autorizada, no se muestran precios, productos ni disponibilidad.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(cadenasInfo) as CadenaId[]).map((id) => (
              <TarjetaCadena
                key={id}
                id={id}
                ahumada={id === "ahumada" ? estadoAhumada : null}
                salcobrand={id === "salcobrand" ? estadoSalcobrand : null}
                cruzverde={id === "cruzverde" ? estadoCruzVerde : null}
              />
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
            {consulta && <span className="text-sm text-muted-foreground">· {consulta}</span>}
          </div>

          {estadoOfertas === "inicial" && (
            <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Busca un producto para ver las ofertas de proveedores.
            </p>
          )}

          {estadoOfertas === "cargando" && (
            <p
              role="status"
              className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando en el catálogo…
            </p>
          )}

          {estadoOfertas === "error" && errorBusqueda && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {errorBusqueda}
            </p>
          )}

          {estadoOfertas === "listo" && resultados.length === 0 && (
            <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No encontramos coincidencias para «{consulta}». Prueba con otro nombre o principio
              activo.
            </p>
          )}

          {estadoOfertas === "listo" && resultados.length > 0 && ofertas.length === 0 && (
            <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No encontramos ofertas de proveedores para «{consulta}».
            </p>
          )}

          {estadoOfertas === "listo" && ofertas.length > 0 && (
            <>
              {avisoBusqueda && (
                <p
                  role="status"
                  className="mb-3 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
                >
                  {avisoBusqueda}
                </p>
              )}
              <p className="mb-5 text-sm text-muted-foreground">
                Ofertas informadas por cada proveedor en el catálogo del servidor (datos de
                demostración). Cada tarjeta indica el artículo al que corresponde; los campos que el
                proveedor no informa se muestran como «No informado».
              </p>
              <div className="space-y-4">
                {ofertas.map(({ oferta, articulo }) => (
                  <ProveedorFicha key={oferta.offer_id} oferta={oferta} articulo={articulo} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 5. Carrito: siempre al final */}
        <Carrito acciones={acciones} />
      </main>
    </div>
  );
}

function TarjetaCadena({
  id,
  ahumada,
  salcobrand,
  cruzverde,
}: {
  id: CadenaId;
  ahumada: EstadoFuenteAhumada | null;
  salcobrand: EstadoFuenteSalcobrand | null;
  cruzverde: EstadoFuenteCruzVerde | null;
}) {
  // Las tres cadenas conservan su posición en la grilla y su propio estado independiente.
  if (id === "ahumada") return <TarjetaAhumada estado={ahumada ?? { tipo: "inicial" }} />;
  if (id === "salcobrand") {
    return <TarjetaSalcobrand estado={salcobrand ?? { tipo: "inicial" }} />;
  }
  return <TarjetaCruzVerde estado={cruzverde ?? { tipo: "inicial" }} />;
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
