import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  Loader2,
  AlertCircle,
} from "lucide-react";
import { OfertasPorProveedor } from "@/components/OfertasPorProveedor";
import { EnsenarALaIa } from "@/components/EnsenarALaIa";
import { clp, cadenasInfo, type CadenaId } from "@/data/demo";
import {
  agregarLinea,
  cambiarCantidadLinea,
  cantidadParaCotizar,
  carritosConLineas,
  crearCotizacion,
  finalizarCotizacion,
  lineasActivas,
  mensajeDeErrorCotizacion,
  nuevaClaveIdempotencia,
  obtenerCotizacion,
  quitarLinea,
  resultadoDesconocido,
  totalesDeCotizacion,
  ultimaCotizacionEnPreparacion,
  yaFinalizada,
  type DetalleCotizacion,
  type InformeCotizacion as Informe,
  type LineaCotizacion,
  type OfertaParaCotizar,
} from "@/lib/cotizacion-api";
import {
  aplicarCambioCantidad,
  consultaDeBusqueda,
  etiquetaEstadoFaltante,
  fusionarFaltantes,
  partesDelFaltante,
  siguienteCantidad,
  unidadDeAjuste,
  unidadParaAsociar,
  visiblesEnBandeja,
} from "@/lib/faltantes";
import {
  cancelarFaltante,
  cargarFotografia,
  esConflictoDeVersion,
  fijarCantidad,
  limpiarCantidad,
  listarFaltantes,
  mensajeDeErrorFaltantes,
  type Faltante,
} from "@/lib/faltantes-api";
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
  type Offer,
  type SearchResponse,
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
import { SeccionCotizaciones, type AccionesCotizacion } from "@/components/MiCotizacion";
import { InformeCotizacion } from "@/components/InformeCotizacion";
import {
  buscarProveedorEnVivo,
  descubrirProveedoresEnVivo,
  mensajeDeErrorProveedor,
  type EstadoFuenteEnVivo,
  type FuenteEnVivo,
  type ItemEnVivo,
} from "@/lib/proveedores-en-vivo";
import {
  buscarPreciosDeListas,
  descubrirFuentesDeLista,
  refrescarPreciosDeListas,
  type FuenteDeLista,
  type GrupoPreciosLista,
} from "@/lib/ofertas-listas";
import { reemplazarOfertasDeArticulo } from "@/lib/ofertas-preferencias";
import type { OfertaImportada } from "@/lib/proveedores-api";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

/** Fecha real del backend (ISO 8601, UTC): se presenta en la zona local de la persona. */
const fechaDeReporte = (iso: string | null) => {
  if (!iso) return "fecha no informada";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "fecha no informada" : d.toLocaleDateString("es-CL");
};
const INTERVALO_FALTANTES_MS = 10_000;

/** Una oferta siempre va acompañada del artículo al que pertenece; nunca se mezclan artículos. */
interface OfertaConArticulo {
  oferta: Offer;
  articulo: Article;
}

function Index() {
  const navigate = useNavigate();
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
  // Proveedores en vivo: cada fuente conserva su propio estado y nunca bloquea al catálogo ni a
  // las cadenas. Antes de la primera búsqueda no se muestra nada.
  const [estadosVivo, setEstadosVivo] = useState<EstadoFuenteEnVivo[]>([]);
  const [descubriendoVivo, setDescubriendoVivo] = useState(false);
  const [errorVivo, setErrorVivo] = useState<string | null>(null);
  // Precios de listas cargadas (Excel/CSV): sección independiente de los proveedores en vivo.
  // `clavesListas` evita mostrar dos veces la misma oferta de una fuente manual.
  const [gruposListas, setGruposListas] = useState<GrupoPreciosLista[]>([]);
  const [clavesListas, setClavesListas] = useState<Set<string>>(new Set());
  const [estadoListas, setEstadoListas] = useState<"inicial" | "cargando" | "listo" | "error">(
    "inicial",
  );
  const [erroresListas, setErroresListas] = useState<string[]>([]);
  const [desactualizadasListas, setDesactualizadasListas] = useState(0);
  const [paginasRestantesListas, setPaginasRestantesListas] = useState(false);
  const [hayFuentesLista, setHayFuentesLista] = useState(false);
  // Proveedores con fuente de lista habilitada: su contenedor sigue visible aunque la búsqueda no
  // les encuentre precios (no se confunde una lista sin coincidencias con un proveedor inexistente).
  const [fuentesListas, setFuentesListas] = useState<FuenteDeLista[]>([]);
  // Bandeja real: el backend es la única fuente; nunca se vuelve a los datos de demostración.
  const [faltantes, setFaltantes] = useState<Faltante[]>([]);
  const [estadoFaltantes, setEstadoFaltantes] = useState<"cargando" | "listo" | "error">(
    "cargando",
  );
  const [errorFaltantes, setErrorFaltantes] = useState<string | null>(null);
  const [mutandoFaltantes, setMutandoFaltantes] = useState<Set<string>>(new Set());
  const [faltanteBuscado, setFaltanteBuscado] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  // Carrito persistente: la única fuente es el backend. `detalle` es la cotización en borrador
  // más reciente y se recupera al recargar o al volver a iniciar sesión.
  const [detalle, setDetalle] = useState<DetalleCotizacion | null>(null);
  const [estadoCotizacion, setEstadoCotizacion] = useState<"cargando" | "listo" | "error">(
    "cargando",
  );
  const [errorCotizacion, setErrorCotizacion] = useState<string | null>(null);
  const [lineasOcupadas, setLineasOcupadas] = useState<Set<string>>(new Set());
  const [agregando, setAgregando] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [informe, setInforme] = useState<Informe | null>(null);
  // Clave de idempotencia del cierre: se conserva mientras el resultado es desconocido.
  const claveFinalizacion = useRef<string | null>(null);
  const cotizacionEnVuelo = useRef(false);

  // Cada búsqueda lleva un número: una respuesta vieja nunca pisa a la nueva.
  const busquedaSeq = useRef(0);
  // Fuentes de lista ya descubiertas: al enseñar una preferencia se releen sus precios sin repetir
  // el descubrimiento ni la búsqueda de catálogo.
  const fuentesListasRef = useRef<FuenteDeLista[]>([]);
  // Sondeo de faltantes: una sola solicitud a la vez y una respuesta vieja nunca pisa a la nueva.
  const faltantesSeq = useRef(0);
  const faltantesEnVuelo = useRef(0);
  const mutandoRef = useRef<Set<string>>(new Set());

  const marcarMutando = useCallback((id: string, activo: boolean) => {
    const siguiente = new Set(mutandoRef.current);
    if (activo) siguiente.add(id);
    else siguiente.delete(id);
    mutandoRef.current = siguiente;
    setMutandoFaltantes(new Set(siguiente));
  }, []);

  const cargarFaltantes = useCallback(async (silencioso: boolean, forzar = false) => {
    // Evita solicitudes duplicadas (sondeo + reintento + cambio de pestaña). Una actualización
    // forzada tras agregar, retirar o finalizar sí se envía aunque haya un sondeo en curso: cada
    // respuesta lleva su número y solo la última pinta.
    if (faltantesEnVuelo.current > 0 && !forzar) return;
    faltantesEnVuelo.current += 1;
    const seq = ++faltantesSeq.current;
    if (!silencioso) setEstadoFaltantes("cargando");
    try {
      const lista = await listarFaltantes();
      if (seq !== faltantesSeq.current) return;
      setFaltantes((previos) => fusionarFaltantes(previos, lista, mutandoRef.current));
      setEstadoFaltantes("listo");
      setErrorFaltantes(null);
    } catch (error) {
      if (seq !== faltantesSeq.current) return;
      setErrorFaltantes(mensajeDeErrorFaltantes(error));
      // Un fallo de actualización no borra lo que ya se está mostrando.
      setEstadoFaltantes((previo) => (previo === "listo" ? "listo" : "error"));
    } finally {
      faltantesEnVuelo.current = Math.max(0, faltantesEnVuelo.current - 1);
    }
  }, []);

  useEffect(() => {
    void cargarFaltantes(false);
    const intervalo = window.setInterval(() => {
      if (!document.hidden) void cargarFaltantes(true);
    }, INTERVALO_FALTANTES_MS);
    const alVolverALaPestana = () => {
      if (!document.hidden) void cargarFaltantes(true);
    };
    document.addEventListener("visibilitychange", alVolverALaPestana);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolverALaPestana);
    };
  }, [cargarFaltantes]);

  const ajustarCantidadReal = async (faltante: Faltante, delta: number) => {
    const unidad = unidadDeAjuste(faltante);
    const cantidad = siguienteCantidad(faltante, delta);
    if (unidad === null || cantidad === null) {
      toast("Este faltante todavía no tiene una unidad definida; no se puede ajustar.");
      return;
    }
    if (faltante.target_quantity !== null && Number(faltante.target_quantity) === cantidad) return;

    marcarMutando(faltante.id, true);
    try {
      const resultado = await fijarCantidad(faltante, cantidad, unidad);
      setFaltantes((previos) =>
        previos.map((f) => (f.id === faltante.id ? aplicarCambioCantidad(f, resultado.item) : f)),
      );
      toast("Cantidad guardada.");
    } catch (error) {
      if (esConflictoDeVersion(error)) {
        toast("La lista cambió mientras ajustabas. Actualizamos los datos.");
        await cargarFaltantes(true);
      } else {
        toast(mensajeDeErrorFaltantes(error));
      }
    } finally {
      marcarMutando(faltante.id, false);
    }
  };

  const retirarFaltante = async (faltante: Faltante) => {
    marcarMutando(faltante.id, true);
    try {
      await cancelarFaltante(faltante);
      setFaltantes((previos) => previos.filter((f) => f.id !== faltante.id));
      toast("Reporte retirado de la bandeja. Su historial se conserva.");
    } catch (error) {
      if (esConflictoDeVersion(error)) {
        toast("La lista cambió. Actualizamos los datos antes de reintentar.");
        await cargarFaltantes(true);
      } else {
        toast(mensajeDeErrorFaltantes(error));
      }
    } finally {
      marcarMutando(faltante.id, false);
    }
  };

  const cargarCotizacion = useCallback(async (silencioso: boolean) => {
    if (cotizacionEnVuelo.current) return;
    cotizacionEnVuelo.current = true;
    if (!silencioso) setEstadoCotizacion("cargando");
    try {
      const ultima = await ultimaCotizacionEnPreparacion();
      setDetalle(ultima ? await obtenerCotizacion(ultima.quote_id) : null);
      setEstadoCotizacion("listo");
      setErrorCotizacion(null);
    } catch (error) {
      setErrorCotizacion(mensajeDeErrorCotizacion(error));
      // Un fallo de actualización no borra lo que ya se está mostrando.
      setEstadoCotizacion((previo) => (previo === "listo" ? "listo" : "error"));
    } finally {
      cotizacionEnVuelo.current = false;
    }
  }, []);

  useEffect(() => {
    void cargarCotizacion(false);
  }, [cargarCotizacion]);

  /** El borrador se crea recién al agregar la primera oferta; antes no existe. */
  const asegurarCotizacion = async (): Promise<DetalleCotizacion> => {
    if (detalle) return detalle;
    const creada = await crearCotizacion();
    setDetalle(creada);
    return creada;
  };

  const refrescarDetalle = async (quoteId: string) => {
    setDetalle(await obtenerCotizacion(quoteId));
    setEstadoCotizacion("listo");
    setErrorCotizacion(null);
  };

  const marcarLineaOcupada = (lineId: string, activo: boolean) => {
    setLineasOcupadas((previas) => {
      const siguiente = new Set(previas);
      if (activo) siguiente.add(lineId);
      else siguiente.delete(lineId);
      return siguiente;
    });
  };

  /** Faltante seleccionado explícitamente: el vínculo siempre lo decide el backend, no el nombre. */
  const faltanteParaVincular = faltanteBuscado
    ? (faltantes.find((f) => f.id === faltanteBuscado.id) ?? null)
    : null;

  // La bandeja oculta los reportes ya cubiertos por un carrito activo (`in_quote`). El reporte
  // sigue activo y vuelve a mostrarse en cuanto su cobertura deje de existir.
  const faltantesVisibles = visiblesEnBandeja(faltantes);

  /**
   * Asegura la cantidad a cotizar antes de asociar: respeta la definida o fija 1 con el comando
   * SET auditado (D-147). Devuelve la cantidad y, si el SET se ejecutó ahora, la fila actualizada
   * para poder revertirlo si el alta no se confirma.
   */
  const prepararCantidadParaAsociar = async (
    faltante: Faltante,
    unidadOferta: string | null,
  ): Promise<{ cantidad: string; fijada: Faltante | null } | null> => {
    if (faltante.target_quantity !== null) {
      return { cantidad: cantidadParaCotizar(faltante), fijada: null };
    }
    const unidad = unidadParaAsociar(faltante, unidadOferta);
    if (unidad === null) {
      toast(
        "La oferta y el faltante no comparten unidad de venta y la cantidad no está definida. " +
          "Defínela en el faltante antes de asociar: no se supone la equivalencia.",
      );
      return null;
    }
    try {
      const resultado = await fijarCantidad(faltante, 1, unidad);
      setFaltantes((previos) =>
        previos.map((f) => (f.id === faltante.id ? aplicarCambioCantidad(f, resultado.item) : f)),
      );
      toast("A cotizar: 1 (por defecto). Queda registrado en el historial del reporte.");
      return { cantidad: "1", fijada: resultado.item };
    } catch (error) {
      if (esConflictoDeVersion(error)) {
        toast("La lista cambió mientras asociabas. Actualizamos los datos.");
        await cargarFaltantes(true, true);
      } else {
        toast(mensajeDeErrorFaltantes(error));
      }
      return null;
    }
  };

  /**
   * Reversión explícita y acotada: si el alta no se confirmó, se deja la cantidad como estaba
   * (sin definir) con CLEAR. Si la reversión tampoco es posible, el cambio queda visible y
   * auditado; nunca se oculta ni se reintenta a ciegas.
   */
  const revertirCantidadFijada = async (faltante: Faltante) => {
    try {
      const resultado = await limpiarCantidad(faltante);
      setFaltantes((previos) =>
        previos.map((f) => (f.id === faltante.id ? aplicarCambioCantidad(f, resultado.item) : f)),
      );
      toast("La cantidad por cotizar volvió a quedar sin definir.");
    } catch {
      await cargarFaltantes(true, true);
      toast("La cantidad por cotizar quedó fijada en 1; puedes ajustarla o reintentar el alta.");
    }
  };

  /**
   * Alta en la cotización con una sola notificación de error. Devuelve si la API confirmó el alta:
   * la tarjeta que llama solo muestra «Agregado» cuando la operación terminó bien.
   *
   * Cuando hay un faltante seleccionado, la asociación se envía siempre y de forma explícita: el
   * backend decide si la oferta puede cubrirlo (excepción de FarmaLoop incluida) y el error se
   * muestra; aquí no se descarta el vínculo en silencio.
   */
  const altaEnCotizacion = async (
    clave: string,
    alta: Parameters<typeof agregarLinea>[1],
  ): Promise<boolean> => {
    if (agregando === clave) return false;
    setAgregando(clave);
    let fijada: Faltante | null = null;
    try {
      let altaFinal = alta;
      if (faltanteParaVincular) {
        const preparada = await prepararCantidadParaAsociar(faltanteParaVincular, alta.unit);
        if (!preparada) return false;
        fijada = preparada.fijada;
        altaFinal = {
          ...alta,
          quantity: preparada.cantidad,
          demandItemId: faltanteParaVincular.id,
        };
      }
      const cotizacion = await asegurarCotizacion();
      const resultado = await agregarLinea(cotizacion.quote_id, altaFinal);
      await refrescarDetalle(cotizacion.quote_id);
      void cargarFaltantes(true, true);
      toast(
        resultado.deduplicated
          ? "Esa oferta ya estaba en tu cotización."
          : faltanteParaVincular
            ? "Producto agregado y asociado al faltante."
            : "Producto agregado a la cotización.",
      );
      return true;
    } catch (error) {
      if (fijada) await revertirCantidadFijada(fijada);
      toast(mensajeDeErrorCotizacion(error));
      return false;
    } finally {
      setAgregando(null);
    }
  };

  const agregarDesdeOfertaViva = async (item: ItemEnVivo): Promise<boolean> => {
    // El contenedor entrega el ítem tal como salió de la fuente: se busca su origen por identidad.
    let fuente: FuenteEnVivo | null = null;
    for (const estado of estadosVivo) {
      const resultado = estado.resultado;
      if (!resultado) continue;
      if (item.tipo === "oferta" && resultado.offers.includes(item.oferta)) {
        fuente = estado.fuente;
        break;
      }
      if (item.tipo === "publicado" && resultado.published.includes(item.producto)) {
        fuente = estado.fuente;
        break;
      }
    }
    if (!fuente?.supplierId) {
      toast("Esta fuente no tiene un proveedor configurado para cotizar.");
      return false;
    }
    if (item.tipo === "publicado") {
      toast("Este producto no tiene un precio vigente; no se puede cotizar.");
      return false;
    }
    const { oferta } = item;
    // La unidad puede no estar informada: la cantidad se cuenta en ofertas seleccionadas y la
    // línea lo declara. Nunca se completa con «caja» ni «unidad» por suposición.
    const unidad = oferta.sale_unit;
    const ofertaParaCotizar: OfertaParaCotizar = {
      source_id: fuente.sourceId,
      external_id: oferta.external_id,
      name: oferta.name,
      supplier_id: fuente.supplierId,
      laboratory: oferta.laboratory,
      presentation: oferta.presentation,
      price: { amount: oferta.price.amount, currency: oferta.price.currency },
      price_basis: oferta.price_basis,
      sale_unit: unidad,
      stock_status: oferta.stock_status,
      stock_quantity: oferta.stock_quantity,
      stock_unit: oferta.stock_unit,
      ean: oferta.ean,
      product_url: oferta.product_url,
      image_url: oferta.image_url,
    };
    return altaEnCotizacion(`viva:${fuente.sourceId}:${oferta.external_id}`, {
      supplierId: fuente.supplierId,
      offer: ofertaParaCotizar,
      quantity: cantidadParaCotizar(faltanteParaVincular),
      unit: unidad,
    });
  };

  const agregarDesdeLista = async (
    oferta: OfertaImportada,
    proveedorId: string,
  ): Promise<boolean> => {
    return altaEnCotizacion(`lista:${oferta.source_id}:${oferta.external_id}`, {
      supplierId: proveedorId,
      offerSnapshotId: oferta.offer_id,
      quantity: cantidadParaCotizar(faltanteParaVincular),
      unit: oferta.sale_unit,
    });
  };

  const agregarDesdeCatalogo = async (oferta: Offer, cantidad: number) => {
    const unidad = oferta.sale_unit.code;
    await altaEnCotizacion(`catalogo:${oferta.offer_id}`, {
      supplierId: oferta.supplier.supplier_id,
      offerSnapshotId: oferta.offer_id,
      quantity: String(Math.max(1, cantidad)),
      unit: unidad,
    });
  };

  const cambiarCantidadEnCotizacion = async (linea: LineaCotizacion, cantidad: number) => {
    if (!detalle || cantidad < 1) return;
    if (Number(linea.quantity.value) === cantidad) return;
    marcarLineaOcupada(linea.line_id, true);
    try {
      await cambiarCantidadLinea(detalle.quote_id, linea.line_id, {
        quantity: String(cantidad),
        unit: linea.quantity.unit,
        version: linea.version,
      });
      await refrescarDetalle(detalle.quote_id);
    } catch (error) {
      toast(mensajeDeErrorCotizacion(error));
      await cargarCotizacion(true);
    } finally {
      marcarLineaOcupada(linea.line_id, false);
    }
  };

  const quitarDeCotizacion = async (linea: LineaCotizacion) => {
    if (!detalle) return;
    marcarLineaOcupada(linea.line_id, true);
    try {
      await quitarLinea(detalle.quote_id, linea.line_id);
      await refrescarDetalle(detalle.quote_id);
      void cargarFaltantes(true, true);
      toast("Producto quitado de la cotización. Los faltantes no se liberan hasta finalizar.");
    } catch (error) {
      toast(mensajeDeErrorCotizacion(error));
      await cargarCotizacion(true);
    } finally {
      marcarLineaOcupada(linea.line_id, false);
    }
  };

  const vaciarCarrito = async (carrito: { supplier_id: string }) => {
    if (!detalle) return;
    const propias = lineasActivas(detalle).filter(
      (linea) => linea.supplier_id === carrito.supplier_id,
    );
    try {
      for (const linea of propias) {
        await quitarLinea(detalle.quote_id, linea.line_id);
      }
      await refrescarDetalle(detalle.quote_id);
      void cargarFaltantes(true, true);
      toast("Carrito vaciado. Los demás proveedores no cambian.");
    } catch (error) {
      toast(mensajeDeErrorCotizacion(error));
      await cargarCotizacion(true);
    }
  };

  const finalizarCotizacionActual = async () => {
    if (!detalle || finalizando) return;
    const clave = claveFinalizacion.current ?? nuevaClaveIdempotencia();
    claveFinalizacion.current = clave;
    setFinalizando(true);
    try {
      const resultado = await finalizarCotizacion(detalle.quote_id, {
        version: detalle.version,
        clave,
      });
      claveFinalizacion.current = null;
      setInforme(resultado.report);
      setDetalle(null);
      setEstadoCotizacion("listo");
      toast(`Informe ${resultado.report.label} generado y guardado.`);
      if (resultado.pending.length > 0) {
        toast(
          `${resultado.pending.length} ${
            resultado.pending.length === 1 ? "faltante sigue" : "faltantes siguen"
          } pendiente${resultado.pending.length === 1 ? "" : "s"} de cobertura.`,
        );
      }
      void cargarCotizacion(true);
      void cargarFaltantes(true, true);
      // La cotización ya está en el historial: se abre el informe recién generado.
      void navigate({
        to: "/historial",
        search: { informe: resultado.quote.quote_id },
      });
    } catch (error) {
      if (yaFinalizada(error)) {
        claveFinalizacion.current = null;
        toast("La cotización ya tiene su informe guardado.");
        await cargarCotizacion(true);
      } else {
        // Un fallo de red conserva la clave: el reintento no genera un segundo informe.
        if (!resultadoDesconocido(error)) claveFinalizacion.current = null;
        toast(mensajeDeErrorCotizacion(error));
      }
    } finally {
      setFinalizando(false);
    }
  };

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

  const ejecutarProveedoresEnVivo = async (texto: string, seq: number) => {
    setDescubriendoVivo(true);
    setEstadosVivo([]);
    setErrorVivo(null);
    try {
      const fuentes = await descubrirProveedoresEnVivo();
      if (seq !== busquedaSeq.current) return;
      setEstadosVivo(
        fuentes.map((fuente) => ({
          fuente,
          cargando: fuente.consultable,
          resultado: null,
          error: fuente.error,
        })),
      );
      setDescubriendoVivo(false);

      await Promise.all(
        fuentes
          .filter((fuente) => fuente.consultable)
          .map(async (fuente) => {
            const actualizar = (cambio: Partial<EstadoFuenteEnVivo>) => {
              setEstadosVivo((previos) =>
                previos.map((estado) =>
                  estado.fuente.sourceId === fuente.sourceId
                    ? { ...estado, ...cambio, cargando: false }
                    : estado,
                ),
              );
            };
            try {
              const resultado = await buscarProveedorEnVivo(fuente.sourceId, texto);
              if (seq !== busquedaSeq.current) return;
              actualizar({ resultado, error: null });
            } catch (error) {
              if (seq !== busquedaSeq.current) return;
              actualizar({ error: mensajeDeErrorProveedor(error) });
            }
          }),
      );
    } catch (error) {
      if (seq !== busquedaSeq.current) return;
      setErrorVivo(mensajeDeErrorProveedor(error));
      setDescubriendoVivo(false);
    }
  };

  const ejecutarPreciosDeListas = async (seq: number, data: SearchResponse) => {
    setEstadoListas("cargando");
    setGruposListas([]);
    setClavesListas(new Set());
    setErroresListas([]);
    setDesactualizadasListas(0);
    setPaginasRestantesListas(false);
    try {
      const fuentes: FuenteDeLista[] = await descubrirFuentesDeLista();
      if (seq !== busquedaSeq.current) return;
      fuentesListasRef.current = fuentes;
      setFuentesListas(fuentes);
      setHayFuentesLista(fuentes.length > 0);
      if (fuentes.length === 0) {
        setEstadoListas("listo");
        return;
      }

      const resultado = await buscarPreciosDeListas({
        fuentes,
        resultadosIniciales: data.results,
        nextCursor: data.next_cursor,
        cargarPagina: (cursor, limit) => obtenerBusqueda(data.search_id, cursor, limit),
        alAvanzar: (grupos, desactualizadas, claves) => {
          if (seq !== busquedaSeq.current) return;
          setGruposListas(grupos);
          setDesactualizadasListas(desactualizadas);
          setClavesListas(claves);
        },
      });
      if (seq !== busquedaSeq.current) return;
      setGruposListas(resultado.grupos);
      setClavesListas(resultado.claves);
      setDesactualizadasListas(resultado.desactualizadas);
      setErroresListas(resultado.errores);
      setPaginasRestantesListas(resultado.paginasRestantes);
      setEstadoListas("listo");
    } catch {
      if (seq !== busquedaSeq.current) return;
      setErroresListas(["No pudimos cargar los precios de las listas cargadas."]);
      setEstadoListas("error");
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
    setEstadosVivo([]);
    setDescubriendoVivo(false);
    setErrorVivo(null);
    setGruposListas([]);
    setClavesListas(new Set());
    setEstadoListas("inicial");
    setErroresListas([]);
    setDesactualizadasListas(0);
    setPaginasRestantesListas(false);
    fuentesListasRef.current = [];
    setFuentesListas([]);

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
    // Las fuentes externas arrancan cuando el catálogo ya respondió: así no hay solicitudes
    // autenticadas compitiendo por la misma renovación de sesión al mismo tiempo. Cada cadena y
    // cada proveedor conserva su estado: un fallo de uno no altera a los demás.
    let cadenaIniciada = false;
    const iniciarCadena = () => {
      if (cadenaIniciada) return;
      cadenaIniciada = true;
      void ejecutarAhumada(t, seq);
      void ejecutarSalcobrand(t, seq);
      void ejecutarCruzVerde(t, seq);
      void ejecutarProveedoresEnVivo(t, seq);
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

      // Los precios de listas cargadas se leen en paralelo con las ofertas de E3. Se recorren
      // páginas adicionales de E2 (con tope) porque los artículos importados no tienen ofertas
      // verificadas y el catálogo los ordena al final.
      void ejecutarPreciosDeListas(seq, data);

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

  // Tras aplicar una preferencia se vuelve a leer E3 de ese artículo para mostrar el orden que
  // decidió el backend. Aquí no se ordena nada: se reemplaza el bloque del artículo por lo que
  // devolvió el servidor.
  const actualizarOfertasDeArticulo = async (articuloId: string) => {
    try {
      const detalle = await obtenerArticulo(articuloId);
      setOfertas((previas) =>
        reemplazarOfertasDeArticulo(
          previas,
          articuloId,
          detalle.offers.map((oferta) => ({ oferta, articulo: detalle.article })),
        ),
      );
    } catch {
      toast(
        "Preferencia guardada. No pudimos actualizar el orden de las ofertas; vuelve a buscar para verla.",
      );
    }
  };

  // Al enseñar una preferencia se releen las fuentes para que se vea el orden que decidió el
  // backend. No se ordena nada en el navegador y, si una fuente falla, conserva lo que ya mostró.
  const refrescarOfertasEnVivo = async (texto: string) => {
    const objetivos = estadosVivo.filter((estado) => estado.fuente.consultable);
    await Promise.all(
      objetivos.map(async ({ fuente }) => {
        try {
          const resultado = await buscarProveedorEnVivo(fuente.sourceId, texto);
          setEstadosVivo((previos) =>
            previos.map((previo) =>
              previo.fuente.sourceId === fuente.sourceId
                ? { ...previo, resultado, error: null }
                : previo,
            ),
          );
        } catch {
          // Se conserva la respuesta anterior; su aviso sigue visible.
        }
      }),
    );
  };

  const refrescarPreciosListas = async () => {
    const fuentes = fuentesListasRef.current;
    if (fuentes.length === 0) return;
    const articulos = new Set(
      [...clavesListas].map((clave) => clave.split("::")[0]).filter((id): id is string => !!id),
    );
    if (articulos.size === 0) return;
    try {
      const resultado = await refrescarPreciosDeListas({ fuentes, articleIds: articulos });
      setGruposListas(resultado.grupos);
      setClavesListas(resultado.claves);
      setDesactualizadasListas(resultado.desactualizadas);
      setErroresListas(resultado.errores);
    } catch {
      // El orden anterior se conserva: la preferencia ya quedó guardada.
    }
  };

  const actualizarTrasEnsenar = async (articuloId: string) => {
    await actualizarOfertasDeArticulo(articuloId);
    await Promise.all([
      consulta ? refrescarOfertasEnVivo(consulta) : Promise.resolve(),
      refrescarPreciosListas(),
    ]);
  };

  const accionesCotizacion: AccionesCotizacion = {
    onCantidad: (linea, cantidad) => void cambiarCantidadEnCotizacion(linea, cantidad),
    onQuitar: (linea) => void quitarDeCotizacion(linea),
    onVaciar: (carrito) => void vaciarCarrito(carrito),
    onFinalizar: () => void finalizarCotizacionActual(),
    ocupadas: lineasOcupadas,
    finalizando,
  };

  const buscando = estadoBusqueda === "buscando";
  // Una oferta de una lista cargada se muestra una sola vez, en su sección con su estado de
  // revisión; su tarjeta equivalente de E3 no se repite (podría no traer esa advertencia).
  const ofertasCatalogo = ofertas.filter(
    ({ oferta }) =>
      !clavesListas.has(`${oferta.article_id}::${oferta.provenance.source.source_id}`),
  );
  const hayOfertas = ofertasCatalogo.length > 0 || gruposListas.length > 0;
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
            Faltantes conectados a Telegram · ofertas de proveedores en vivo y de catálogo
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
              {faltantesVisibles.length} {faltantesVisibles.length === 1 ? "reporte" : "reportes"}
            </span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Reportes enviados por los auxiliares por Telegram. Cada reporte se ajusta por separado.
          </p>

          {estadoFaltantes === "cargando" && faltantesVisibles.length === 0 && (
            <p
              role="status"
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando faltantes…
            </p>
          )}

          {estadoFaltantes === "error" && faltantesVisibles.length === 0 && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <p className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {errorFaltantes ?? "No pudimos cargar los faltantes."}
              </p>
              <button
                onClick={() => void cargarFaltantes(false)}
                className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium hover:bg-destructive/10"
              >
                Reintentar
              </button>
            </div>
          )}

          {estadoFaltantes === "listo" && errorFaltantes && (
            <p
              role="status"
              className="mb-3 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              No pudimos actualizar la lista. Mostramos la última información disponible.
            </p>
          )}

          {estadoFaltantes === "listo" && faltantesVisibles.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay faltantes pendientes. Los reportes enviados por Telegram aparecerán aquí
              automáticamente.
            </p>
          )}

          {faltantesVisibles.length > 0 && (
            <ul className="space-y-3">
              {faltantesVisibles.map((f) => (
                <FilaFaltante
                  key={f.id}
                  faltante={f}
                  ocupado={mutandoFaltantes.has(f.id)}
                  onAjustar={(d) => void ajustarCantidadReal(f, d)}
                  onEliminar={() => void retirarFaltante(f)}
                  onBuscar={() => {
                    // Nombre comercial corto si el backend lo identificó («Predual»); nunca la
                    // descripción farmacológica larga cuando existe uno.
                    const consulta = consultaDeBusqueda(f);
                    setFaltanteBuscado({ id: f.id, nombre: consulta });
                    void ejecutarBusqueda(consulta);
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
          {faltanteBuscado && (
            <p className="mb-3 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Búsqueda iniciada desde el faltante{" "}
              <span className="font-medium text-foreground">«{faltanteBuscado.nombre}»</span>. La
              referencia se conserva para asociarlo a la cotización.
            </p>
          )}

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

          <OfertasPorProveedor
            estados={estadosVivo}
            grupos={gruposListas}
            fuentesListas={fuentesListas}
            consulta={consulta || null}
            descubriendo={descubriendoVivo}
            error={errorVivo}
            cargandoListas={estadoListas === "cargando"}
            erroresListas={erroresListas}
            desactualizadas={desactualizadasListas}
            paginasRestantes={paginasRestantesListas}
            hayFuentesLista={hayFuentesLista}
            onActualizar={actualizarTrasEnsenar}
            onAgregarViva={(item) => agregarDesdeOfertaViva(item)}
            onAgregarLista={(oferta, proveedorId) => agregarDesdeLista(oferta, proveedorId)}
            agregando={agregando}
          />

          {estadoOfertas === "listo" &&
            resultados.length > 0 &&
            !hayOfertas &&
            estadoListas !== "cargando" && (
              <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No encontramos ofertas de proveedores para «{consulta}».
              </p>
            )}

          {estadoOfertas === "listo" && avisoBusqueda && (
            <p
              role="status"
              className="mb-3 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              {avisoBusqueda}
            </p>
          )}

          {estadoOfertas === "listo" && ofertasCatalogo.length > 0 && (
            <>
              <p className="mb-5 text-sm text-muted-foreground">
                Ofertas guardadas en el catálogo del servidor. Cada tarjeta indica el artículo al
                que corresponde y su origen; los campos que el proveedor no informa se muestran como
                «No informado».
              </p>
              <div className="space-y-4">
                {ofertasCatalogo.map(({ oferta, articulo }) => (
                  <ProveedorFicha
                    key={oferta.offer_id}
                    oferta={oferta}
                    articulo={articulo}
                    onActualizar={actualizarOfertasDeArticulo}
                    onAgregar={(oferta, cantidad) => void agregarDesdeCatalogo(oferta, cantidad)}
                    agregando={agregando === `catalogo:${oferta.offer_id}`}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 5. Carrito: siempre al final */}
        <Carrito
          detalle={detalle}
          estado={estadoCotizacion}
          error={errorCotizacion}
          acciones={accionesCotizacion}
          onReintentar={() => void cargarCotizacion(false)}
        />
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
  faltante,
  ocupado,
  onAjustar,
  onEliminar,
  onBuscar,
}: {
  faltante: Faltante;
  ocupado: boolean;
  onAjustar: (delta: number) => void;
  onEliminar: () => void;
  onBuscar: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [verFoto, setVerFoto] = useState(false);
  const autor = faltante.reported_by_name?.trim() || "Sin identificar";
  // Nombres largos: título y detalles del backend; si faltan, el nombre completo como respaldo.
  const partes = partesDelFaltante(faltante);
  const solicitado = describirCantidad(
    faltante.requested_quantity ?? faltante.declared_quantity,
    faltante.requested_unit ?? faltante.declared_unit,
  );
  const objetivo = describirCantidad(faltante.target_quantity, faltante.quantity_unit);
  const puedeAjustar = unidadDeAjuste(faltante) !== null;
  const porDefecto = faltante.requested_quantity_origin === "default";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
      {/*
        Texto y miniatura forman un solo conjunto: el `flex-1` vive aquí y el espacio flexible
        queda entre este conjunto y los controles, nunca entre el texto y la fotografía.
      */}
      <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{partes.titulo}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {etiquetaEstadoFaltante(faltante.status)}
            </span>
            {faltante.observation_count > 1 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {faltante.observation_count} avisos
              </span>
            )}
          </div>
          {partes.detalles.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{partes.detalles.join(" · ")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Reportado por <span className="text-foreground">{autor}</span> ·{" "}
            {fechaDeReporte(faltante.reported_at ?? faltante.created_at)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Solicitado: {solicitado ?? "sin cantidad informada"}
            {porDefecto ? " (1 por defecto)" : ""} · A cotizar: {objetivo ?? "sin definir"}
          </p>
        </div>
        {faltante.photo_url && (
          <MiniaturaFotografia
            photoUrl={faltante.photo_url}
            descripcion={faltante.display_name}
            onAbrir={() => setVerFoto(true)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border">
          <button
            aria-label={`Disminuir cantidad de ${faltante.display_name}`}
            onClick={() => onAjustar(-1)}
            disabled={ocupado || !puedeAjustar}
            title={puedeAjustar ? undefined : "Este faltante no tiene una unidad definida"}
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-20 text-center text-sm font-medium" aria-live="polite">
            {ocupado ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Guardando" />
            ) : (
              (objetivo ?? "Sin definir")
            )}
          </span>
          <button
            aria-label={`Aumentar cantidad de ${faltante.display_name}`}
            onClick={() => onAjustar(1)}
            disabled={ocupado || !puedeAjustar}
            title={puedeAjustar ? undefined : "Este faltante no tiene una unidad definida"}
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          aria-label={`Eliminar reporte de ${faltante.display_name}`}
          onClick={() => setConfirmar(true)}
          disabled={ocupado}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
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
              {faltante.display_name} · {objetivo ?? "cantidad sin definir"} · reportado por {autor}
              . Los demás reportes no cambian. Se conserva el historial; retirarlo no equivale a una
              compra confirmada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEliminar}>Retirar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {faltante.photo_url && (
        <VisorFotografia
          abierto={verFoto}
          photoUrl={faltante.photo_url}
          descripcion={faltante.display_name}
          onCerrar={() => setVerFoto(false)}
        />
      )}
    </li>
  );
}

/**
 * Miniatura real de la fotografía que envió el auxiliar.
 *
 * Usa la misma carga autenticada que el visor ampliado y libera la URL de objeto al desmontar.
 * Si tarda muestra un indicador discreto; si falla deja un estado neutro dentro del mismo
 * cuadrado, sin afectar el resto de la tarjeta.
 */
function MiniaturaFotografia({
  photoUrl,
  descripcion,
  onAbrir,
}: {
  photoUrl: string;
  descripcion: string;
  onAbrir: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(false);

    cargarFotografia(photoUrl)
      .then((blob) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });

    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl]);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Ver fotografía de ${descripcion}`}
      title="Ver fotografía original"
      className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-muted text-muted-foreground transition hover:border-brand-green focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      {url ? (
        <img
          src={url}
          alt={`Fotografía del reporte: ${descripcion}`}
          className="h-full w-full object-cover"
        />
      ) : error ? (
        <span
          className="flex h-full w-full items-center justify-center"
          title="Fotografía no disponible"
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          <span className="sr-only">Fotografía no disponible</span>
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="sr-only">Cargando fotografía</span>
        </span>
      )}
    </button>
  );
}

/**
 * Vista ampliada de la fotografía original.
 *
 * La ruta es privada, así que se descarga con la misma identidad que el resto de la API y se
 * muestra con una URL de objeto temporal, revocada al cerrar o desmontar para liberar memoria.
 */
function VisorFotografia({
  abierto,
  photoUrl,
  descripcion,
  onCerrar,
}: {
  abierto: boolean;
  photoUrl: string;
  descripcion: string;
  onCerrar: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);

    cargarFotografia(photoUrl)
      .then((blob) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((causa) => {
        if (!cancelado) setError(mensajeDeErrorFaltantes(causa));
      });

    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [abierto, photoUrl]);

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => !siguiente && onCerrar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fotografía original</DialogTitle>
          <DialogDescription className="break-words">{descripcion}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : url ? (
          <img
            src={url}
            alt={`Fotografía del reporte: ${descripcion}`}
            className="max-h-[70vh] w-full rounded-xl border object-contain"
          />
        ) : (
          <p
            role="status"
            className="flex items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando fotografía…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Carrito({
  detalle,
  estado,
  error,
  acciones,
  onReintentar,
}: {
  detalle: DetalleCotizacion | null;
  estado: "cargando" | "listo" | "error";
  error: string | null;
  acciones: AccionesCotizacion;
  onReintentar: () => void;
}) {
  const activas = lineasActivas(detalle);
  const proveedores = carritosConLineas(detalle).length;
  const cargando = estado === "cargando" && detalle === null;

  return (
    <section className="rounded-3xl border bg-card p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-brand-green" />
        <h2 className="text-lg font-semibold">Carrito</h2>
        {activas.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {activas.length} {activas.length === 1 ? "producto" : "productos"} · {proveedores}{" "}
            {proveedores === 1 ? "proveedor" : "proveedores"}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        La cotización se guarda en el servidor y se recupera al recargar. Cada oferta conserva el
        precio con que la elegiste. Agregar o quitar productos no libera faltantes: eso ocurre solo
        al finalizar el informe, y finalizar no registra una compra.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          <button
            onClick={onReintentar}
            className="ml-auto rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-background"
          >
            Reintentar
          </button>
        </p>
      )}

      {cargando ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando tu cotización…
        </p>
      ) : (
        <SeccionCotizaciones detalle={detalle} acciones={acciones} />
      )}
    </section>
  );
}

const NoInformado = () => <span className="text-muted-foreground italic">No informado</span>;

function ProveedorFicha({
  oferta,
  articulo,
  onActualizar,
  onAgregar,
  agregando,
}: {
  oferta: Offer;
  articulo: Article;
  onActualizar: (articuloId: string) => void | Promise<void>;
  onAgregar: (oferta: Offer, cantidad: number) => void;
  agregando?: boolean;
}) {
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
            <EnsenarALaIa
              articuloId={articulo.article_id}
              ofertaId={oferta.offer_id}
              proveedorId={oferta.supplier.supplier_id}
              nombreArticulo={articulo.display_name}
              nombreProveedor={nombre}
              onPreferenciaAplicada={() => onActualizar(articulo.article_id)}
            />
            <button
              type="button"
              disabled={agregando}
              onClick={() => onAgregar(oferta, cantidad)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90 disabled:opacity-60"
            >
              {agregando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" />
              )}{" "}
              Agregar a cotización
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            El precio se guarda como lo publicó el proveedor en este momento.
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
