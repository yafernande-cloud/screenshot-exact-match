import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search, Store, Truck, Minus, Plus, ChevronDown, ShoppingCart, Check, ClipboardList, Trash2, WifiOff, ExternalLink,
  Sparkles,
} from "lucide-react";
import {
  productos, clp, cadenasInfo, totalProveedor, adminDemo, faltantesDemo,
  type CadenaId, type Producto, type Estado, type Proveedor, type ReporteFaltante,
} from "@/data/demo";
import {
  agregar, buscarOferta, buscarProducto, cambiarCantidad, evaluarLinea, mover, quitar, totalCarrito, vaciar, type Linea,
} from "@/lib/cotizacion";
import { ajustarCantidad, eliminarReporte } from "@/lib/faltantes";
import { SeccionCotizaciones, type CotizacionAcciones } from "@/components/MiCotizacion";
import { MenuPrincipal } from "@/components/MenuPrincipal";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cotizador Inteligente Farmacia" },
      { name: "description", content: "Busca productos de farmacia, revisa faltantes y compara ofertas de proveedores." },
      { property: "og:title", content: "Cotizador Inteligente Farmacia" },
      { property: "og:description", content: "Busca productos de farmacia, revisa faltantes y compara ofertas de proveedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

/** Observación comercial libre, asociada a la oferta y al administrador, para que la IA del backend la use después. */
interface Observacion {
  observacionId: string; productoId: string; ofertaId: string; proveedor: string; laboratorio: string | null;
  adminId: string; adminNombre: string; texto: string; fecha: string;
}

const estadoStyle: Record<Estado, string> = {
  completa: "bg-brand-green/10 text-brand-green",
  parcial: "bg-brand-blue/10 text-brand-blue",
  pendiente: "bg-muted text-muted-foreground",
};
const estadoLabel: Record<Estado, string> = { completa: "Completa", parcial: "Parcial", pendiente: "Pendiente de revisión" };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");
const CLAVE_CARRITO = "carrito-demo";

function Index() {
  const inicial = productos[0] ?? null;
  const [q, setQ] = useState(inicial?.nombre ?? "");
  const [consulta, setConsulta] = useState(inicial?.nombre ?? "");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Producto | null>(inicial);
  const [reportes, setReportes] = useState<ReporteFaltante[]>(faltantesDemo);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_CARRITO);
      if (guardado) setLineas(JSON.parse(guardado));
    } catch { /* datos de demo: si falla, el carrito parte vacío */ }
    setCargado(true);
  }, []);
  useEffect(() => {
    if (cargado) sessionStorage.setItem(CLAVE_CARRITO, JSON.stringify(lineas));
  }, [lineas, cargado]);

  const buscar = (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    setQ(t);
    setConsulta(t);
    setSel(buscarProducto(t));
    setOpen(false);
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
  const agregarACotizacion = (p: Producto, prov: string, cantidad: number) => {
    const existia = lineas.some((l) => l.productoId === p.id && l.proveedor === prov);
    setLineas((ls) => agregar(ls, p.id, prov, cantidad));
    toast.success(existia ? `Cantidad actualizada: ${cantidad} u. en ${prov}` : `${p.nombre} agregado al carrito (${prov})`);
  };

  const sugerencias = q.trim() && q !== consulta
    ? productos.filter((p) => norm(`${p.nombre} ${p.presentacion} ${p.categoria}`).includes(norm(q.trim())))
    : productos;

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />

      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-10 pb-24">
        {/* 1. Buscar producto */}
        <section className="flex flex-col items-center pt-10">
          <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight text-primary-foreground md:text-4xl">Buscar producto</h1>
          <form
            className="relative w-full max-w-5xl"
            onSubmit={(e) => { e.preventDefault(); buscar(q); }}
          >
            <div className="flex items-center gap-2 rounded-full bg-card py-2 pl-5 pr-2 shadow-soft">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Buscar medicamentos, cremas, shampoo, perfumes y más..."
                aria-label="Buscar producto"
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
              />
              <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-green px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-brand-green/90">
                <Search className="h-4 w-4" /> Buscar
              </button>
            </div>
            {open && sugerencias.length > 0 && (
              <ul className="absolute z-10 mt-2 max-h-80 w-full overflow-auto rounded-2xl border bg-card py-2 shadow-soft">
                {sugerencias.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={() => buscar(p.nombre)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted"
                    >
                      <span><span className="font-medium">{p.nombre}</span> <span className="text-sm text-muted-foreground">· {p.presentacion}</span></span>
                      <span className="text-xs text-muted-foreground">{p.categoria}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          <p className="mt-4 text-xs text-primary-foreground/80">Prototipo con datos de demostración</p>
        </section>

        {/* 2. Grandes farmacias: sin integración real, no se muestran precios */}
        <section id="grandes-farmacias" className="scroll-mt-4 rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Store className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold">Grandes farmacias</h2>
            <span className="text-sm text-muted-foreground">· {consulta}</span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Aún no hay conexión con las cadenas, por eso no se muestran precios, productos ni disponibilidad.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(cadenasInfo) as CadenaId[]).map((id) => <TarjetaCadena key={id} id={id} />)}
          </div>
        </section>

        {/* 3. Faltantes por cotizar */}
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand-green" />
            <h2 className="text-lg font-semibold">Faltantes por cotizar</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{reportes.length} {reportes.length === 1 ? "reporte" : "reportes"} · demo</span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Reportes enviados por los auxiliares por Telegram. Cada reporte se ajusta por separado.</p>
          {reportes.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay faltantes pendientes.</p>
          ) : (
            <ul className="space-y-3">
              {reportes.map((r) => (
                <FilaFaltante
                  key={r.reporteId}
                  r={r}
                  onAjustar={(d) => setReportes((rs) => ajustarCantidad(rs, r.reporteId, d))}
                  onEliminar={() => { setReportes((rs) => eliminarReporte(rs, r.reporteId)); toast("Reporte retirado de la bandeja (demo)"); }}
                  onBuscar={() => {
                    buscar(r.medicamento);
                    document.getElementById("grandes-farmacias")?.scrollIntoView({ behavior: "smooth" });
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
            <span className="text-sm text-muted-foreground">· {sel?.nombre ?? consulta}</span>
          </div>
          {!sel ? (
            <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay ofertas de proveedores de demostración para «{consulta}».
            </p>
          ) : (
            <>
              <p className="mb-5 text-sm text-muted-foreground">
                Ofertas informadas por cada proveedor (datos de demostración). El total solo se muestra cuando la información está completa.
                {sel.proveedores.some((p) => p.estado !== "completa") && " Hay información incompleta: no es posible determinar cuál es el más conveniente."}
              </p>
              <div className="space-y-4">
                {sel.proveedores.map((p) => (
                  <ProveedorFicha
                    key={`${sel.id}-${p.nombre}`}
                    producto={sel}
                    p={p}
                    enCarrito={lineas.find((l) => l.productoId === sel.id && l.proveedor === p.nombre)?.cantidad}
                    observaciones={observaciones.filter((o) => o.productoId === sel.id && o.proveedor === p.nombre)}
                    onAgregar={(c) => agregarACotizacion(sel, p.nombre, c)}
                    onObservar={(texto) => {
                      setObservaciones((os) => [...os, {
                        observacionId: `obs-${Date.now()}`, productoId: sel.id, ofertaId: `${sel.id}:${p.nombre}`, proveedor: p.nombre,
                        laboratorio: p.laboratorio ?? null, adminId: adminDemo.usuarioId, adminNombre: adminDemo.nombre, texto, fecha: new Date().toISOString(),
                      }]);
                      toast.success("Observación guardada en esta sesión (demo, no se envía al servidor)");
                    }}
                  />
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
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted px-1 text-center text-[11px] text-muted-foreground">Sin imagen</div>
        <dl className="min-w-0 space-y-0.5 text-xs">
          {campos.map((c) => (
            <div key={c}><span className="text-muted-foreground">{c}: </span><span className="text-muted-foreground">—</span></div>
          ))}
        </dl>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Precio publicado</p>
          <p className="text-xl font-semibold text-muted-foreground">—</p>
        </div>
        <button disabled className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-60">
          Ver publicación <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function FilaFaltante({ r, onAjustar, onEliminar, onBuscar }: {
  r: ReporteFaltante; onAjustar: (delta: number) => void; onEliminar: () => void; onBuscar: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{r.medicamento}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pendiente</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {r.presentacion ? `${r.presentacion} · ` : ""}Reportado por <span className="text-foreground">{r.auxiliar}</span> · {fecha(r.fecha)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border">
          <button aria-label={`Disminuir cantidad de ${r.auxiliar}`} onClick={() => onAjustar(-1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus className="h-3.5 w-3.5" /></button>
          <span className="min-w-16 text-center text-sm font-medium">{r.cantidad} {r.unidad}</span>
          <button aria-label={`Aumentar cantidad de ${r.auxiliar}`} onClick={() => onAjustar(1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <button aria-label={`Eliminar reporte de ${r.auxiliar}`} onClick={() => setConfirmar(true)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
        <button onClick={onBuscar} className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90">
          <Search className="h-3.5 w-3.5" /> Buscar
        </button>
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar este reporte?</AlertDialogTitle>
            <AlertDialogDescription>
              {r.medicamento} · {r.cantidad} {r.unidad} · reportado por {r.auxiliar}. Los demás reportes no cambian. Retirarlo no equivale a una compra confirmada.
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
          {lineas.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{lineas.length} {lineas.length === 1 ? "producto" : "productos"}</span>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Agregar al carrito no confirma una compra ni cierra los faltantes reportados.</p>

        {lineas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8" />
            Tu carrito está vacío
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[2fr_1.5fr_0.7fr_1fr_1fr_auto] gap-3 border-b px-3 pb-2 text-xs text-muted-foreground md:grid">
              <span>Producto</span><span>Proveedor</span><span>Cantidad</span><span>Precio unitario</span><span>Subtotal</span><span className="w-8" />
            </div>
            <ul className="divide-y">
              {lineas.map((l) => {
                const r = buscarOferta(l.productoId, l.proveedor);
                if (!r) return null;
                const e = evaluarLinea(l);
                return (
                  <li key={`${l.productoId}:${l.proveedor}`} className="grid grid-cols-2 items-center gap-x-3 gap-y-1 px-3 py-3 text-sm md:grid-cols-[2fr_1.5fr_0.7fr_1fr_1fr_auto]">
                    <span className="col-span-2 font-medium md:col-span-1">{r.producto.nombre}</span>
                    <span className="text-muted-foreground">{l.proveedor} <span className="text-xs">(demo)</span></span>
                    <span><span className="text-xs text-muted-foreground md:hidden">Cantidad: </span>{l.cantidad} u.</span>
                    <span><span className="text-xs text-muted-foreground md:hidden">Precio: </span>{r.oferta.precioUnitario !== null ? clp(r.oferta.precioUnitario) : "Sin precio"}</span>
                    <span>
                      {e.ok ? <span className="font-medium">{clp(e.subtotal)}</span> : <span className="text-xs text-muted-foreground">Pendiente: {e.texto}</span>}
                    </span>
                    <button aria-label={`Quitar ${r.producto.nombre} de ${l.proveedor}`} onClick={() => onQuitar(l.productoId, l.proveedor)} className="col-start-2 justify-self-end rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive md:col-start-auto">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
              <div>
                <span className="font-semibold">Total: <span className="text-brand-green">{clp(t.total)}</span></span>
                {t.pendientes > 0 && <span className="ml-2 text-xs text-muted-foreground">({t.pendientes} {t.pendientes === 1 ? "línea pendiente no incluida" : "líneas pendientes no incluidas"})</span>}
              </div>
              <button onClick={() => setRevisar(!revisar)} className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-background">
                Revisar cotización por proveedor <ChevronDown className={`h-3 w-3 transition-transform ${revisar ? "rotate-180" : ""}`} />
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

function ProveedorFicha({ producto, p, enCarrito, observaciones, onAgregar, onObservar }: {
  producto: Producto; p: Proveedor; enCarrito?: number | undefined; observaciones: Observacion[];
  onAgregar: (cantidad: number) => void; onObservar: (texto: string) => void;
}) {
  const [cantidad, setCantidad] = useState(enCarrito ?? 1);
  const [verFaltantes, setVerFaltantes] = useState(false);
  const [modal, setModal] = useState(false);
  const [texto, setTexto] = useState("");
  const t = totalProveedor(p, cantidad);

  const datos: [string, React.ReactNode][] = [
    ["Producto", p.producto ?? producto.nombre],
    ...(producto.categoria === "Medicamento" || p.laboratorio
      ? [["Laboratorio", p.laboratorio ?? <NoInformado />] as [string, React.ReactNode]]
      : []),
    ["Presentación", p.presentacion],
    ["IVA", p.iva ? (p.iva === "incluido" ? "Precio con IVA incluido" : "Precio sin IVA") : <NoInformado />],
    ["Stock", p.disponibilidad ?? <NoInformado />],
    ["Descuentos y promociones", p.descuento ?? <NoInformado />],
    ["Despacho", p.despacho ?? <NoInformado />],
    ["Mínimo de compra", p.minimo !== null ? `${p.minimo} unidades` : <NoInformado />],
    ["Condiciones de pago", p.pago ?? <NoInformado />],
  ];
  if (p.otros) datos.push(["Otros datos", p.otros]);

  return (
    <article className="@container rounded-2xl border p-4">
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          {p.logo ? (
            <img src={p.logo} alt={p.nombre} className="h-10 w-10 object-contain" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue">
              {p.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{p.nombre} <span className="text-xs font-normal text-muted-foreground">(demo)</span></h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${estadoStyle[p.estado]}`}>{estadoLabel[p.estado]}</span>
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm @md:grid-cols-2 @5xl:grid-cols-3">
              {datos.map(([k, v]) => (
                <div key={k}><span className="text-muted-foreground">{k}: </span><span className="text-foreground">{v}</span></div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          {p.precioUnitario !== null ? (
            <div>
              <p className="text-2xl font-semibold text-brand-green">{clp(p.precioUnitario)}</p>
              <p className="text-xs text-muted-foreground">precio unitario{p.iva ? (p.iva === "incluido" ? " · con IVA" : " · sin IVA") : " · IVA no informado"}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin precio informado</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Cantidad</span>
            <div className="flex items-center rounded-full border">
              <button aria-label={`Menos unidades de ${p.nombre}`} onClick={() => setCantidad(Math.max(1, cantidad - 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus className="h-3.5 w-3.5" /></button>
              <input
                type="number" min={1} value={cantidad} aria-label={`Cantidad a cotizar con ${p.nombre}`}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button aria-label={`Más unidades de ${p.nombre}`} onClick={() => setCantidad(cantidad + 1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {"total" in t ? <>Total {cantidad} u.: <span className="font-medium text-foreground">{clp(t.total)}</span></> : t.pendiente}
          </p>
          <div className="flex flex-wrap gap-2 @2xl:justify-end">
            <button
              onClick={() => setModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Enseñar a la IA
            </button>
            <button
              onClick={() => onAgregar(cantidad)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-green/90"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {enCarrito === undefined ? "Agregar a cotización" : enCarrito === cantidad ? "En cotización" : "Actualizar cantidad"}
            </button>
          </div>
          {enCarrito !== undefined && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3 text-brand-green" /> {enCarrito} u. en el carrito</p>
          )}
        </div>
      </div>

      {observaciones.length > 0 && (
        <ul className="mt-3 space-y-1 lg:pl-14">
          {observaciones.map((o) => (
            <li key={o.observacionId} className="rounded-lg bg-muted px-3 py-1.5 text-xs"><span className="text-muted-foreground">Observación de {o.adminNombre}: </span>{o.texto}</li>
          ))}
        </ul>
      )}

      {p.faltantes.length > 0 && (
        <div className="mt-3 lg:pl-14">
          <button onClick={() => setVerFaltantes(!verFaltantes)} className="flex items-center gap-1 text-xs text-brand-blue hover:underline">
            ¿Qué falta para calcular el costo completo? <ChevronDown className={`h-3 w-3 transition-transform ${verFaltantes ? "rotate-180" : ""}`} />
          </button>
          {verFaltantes && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {p.faltantes.map((f) => <li key={f} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{f}</li>)}
            </ul>
          )}
        </div>
      )}

      <Dialog open={modal} onOpenChange={(o) => { setModal(o); if (!o) setTexto(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-brand-blue"><Sparkles className="h-4 w-4" /> Enseñar a la IA</DialogTitle>
            <DialogDescription>
              {producto.nombre} · {p.laboratorio ?? "Laboratorio no informado"} · {p.nombre}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cuéntale a la IA tus preferencias sobre este producto, laboratorio o proveedor para que pueda considerarlas en futuras recomendaciones.</p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej: Prefiero Laboratorio Chile aunque sea un poco más caro"
            aria-label="Texto de la observación"
            rows={4}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <button onClick={() => { setModal(false); setTexto(""); }} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button
              disabled={!texto.trim()}
              onClick={() => { onObservar(texto.trim()); setModal(false); setTexto(""); }}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              Guardar observación
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
