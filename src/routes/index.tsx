import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Store, Truck, MessageSquarePlus, X, Minus, Plus, ChevronDown, ShoppingCart, Check } from "lucide-react";
import { productos, clp, cadenasInfo, totalProveedor, type Producto, type Estado, type Proveedor } from "@/data/demo";
import { agregar, cambiarCantidad, carritoInicial, mover, quitar, vaciar, type Linea } from "@/lib/cotizacion";
import { SeccionCotizaciones, type CotizacionAcciones } from "@/components/MiCotizacion";
import { MenuPrincipal } from "@/components/MenuPrincipal";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cotizador inteligente para farmacia" },
      { name: "description", content: "Busca productos y compara precios de cadenas y proveedores." },
      { property: "og:title", content: "Cotizador inteligente para farmacia" },
      { property: "og:description", content: "Busca productos y compara precios de cadenas y proveedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

/** Observación libre, ligada al producto, laboratorio y proveedor para interpretarla después con IA. */
interface Observacion { productoId: string; producto: string; laboratorio: string | null; proveedor: string; texto: string; fecha: string }

const estadoStyle: Record<Estado, string> = {
  completa: "bg-brand-green/10 text-brand-green",
  parcial: "bg-brand-blue/10 text-brand-blue",
  pendiente: "bg-muted text-muted-foreground",
};
const estadoLabel: Record<Estado, string> = { completa: "Completa", parcial: "Parcial", pendiente: "Pendiente de revisión" };
const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Index() {
  const inicial = productos[0] ?? null;
  const [q, setQ] = useState(inicial?.nombre ?? "");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Producto | null>(inicial);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [lineas, setLineas] = useState<Linea[]>(carritoInicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem("cotizacion-demo");
      if (guardado) setLineas(JSON.parse(guardado));
    } catch { /* datos de demo: si falla, se usa el carrito inicial */ }
    setCargado(true);
  }, []);
  useEffect(() => {
    if (cargado) sessionStorage.setItem("cotizacion-demo", JSON.stringify(lineas));
  }, [lineas, cargado]);

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
    toast.success(existia ? `Cantidad actualizada: ${cantidad} u. en ${prov}` : `${p.nombre} agregado a ${prov}`);
  };

  // Si el buscador muestra el producto ya elegido, la lista ofrece todos los productos.
  const sugerencias = useMemo(
    () => (q.trim() && q !== sel?.nombre ? productos.filter((p) => norm(p.nombre + " " + p.categoria).includes(norm(q.trim()))) : productos),
    [q, sel],
  );

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />

      <main className="mx-auto max-w-5xl px-4 pb-24">
        <section className="flex flex-col items-center pt-12 pb-12">
          <h1 className="mb-8 text-center text-4xl font-semibold tracking-tight text-primary-foreground md:text-5xl">¿Qué estás buscando?</h1>
          <div className="relative w-full max-w-2xl">
            <div className="flex items-center gap-3 rounded-full bg-card px-5 py-4 shadow-soft">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Busca un producto..."
                aria-label="Buscar producto"
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              {q && <button onClick={() => { setQ(""); setSel(null); }} aria-label="Limpiar"><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
            {open && (
              <ul className="absolute z-10 mt-2 max-h-80 w-full overflow-auto rounded-2xl border bg-card py-2 shadow-soft">
                {sugerencias.length === 0 && <li className="px-5 py-3 text-sm text-muted-foreground">Sin resultados en los datos de demostración</li>}
                {sugerencias.map((p) => (
                  <li key={p.id}>
                    <button
                      onMouseDown={() => { setSel(p); setQ(p.nombre); setOpen(false); }}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted"
                    >
                      <span><span className="font-medium">{p.nombre}</span> <span className="text-sm text-muted-foreground">· {p.presentacion}</span></span>
                      <span className="text-xs text-muted-foreground">{p.categoria}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-4 text-xs text-primary-foreground/80">Prototipo con datos ficticios de demostración</p>
        </section>

        {sel && (
          <div className="space-y-10">
            {/* 1. Precios públicos de cadenas: solo referencia, sin acciones de compra */}
            <section className="rounded-3xl border bg-card p-6">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Store className="h-5 w-5 text-brand-blue" />
                <h2 className="text-lg font-semibold">Precios públicos de cadenas farmacéuticas</h2>
                <span className="text-sm text-muted-foreground">· {sel.nombre}</span>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">Precios ficticios de demostración, referenciales de venta al público. No son ofertas de abastecimiento.</p>
              {sel.cadenas.length === 0 && <p className="rounded-2xl border p-4 text-sm text-muted-foreground">Sin precios de cadenas para este producto en los datos de demostración.</p>}
              <div className="grid gap-4 lg:grid-cols-2">
                {sel.cadenas.map((c) => {
                  const info = cadenasInfo[c.id];
                  return (
                    <div key={c.id} className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row">
                      <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted sm:h-auto sm:w-32">
                        {c.imagen ? (
                          <img src={c.imagen} alt={c.nombreComercial} className="h-full w-full object-contain" />
                        ) : (
                          <span className="px-2 text-center text-xs text-muted-foreground">Imagen no disponible</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <img src={info.logo} alt={`Logo ${info.nombre}`} className="h-7 max-w-[110px] object-contain object-left" />
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Precio público</span>
                        </div>
                        <p className="mt-2 font-medium leading-snug">{c.nombreComercial}</p>
                        {c.fabricante && <p className="text-xs text-muted-foreground">{c.fabricante}</p>}
                        <p className="mt-1 text-sm text-muted-foreground">{c.descripcion}</p>
                        <dl className="mt-2 grid gap-y-0.5 text-xs">
                          {c.atributos.map(([k, v]) => (
                            <div key={k}><span className="text-muted-foreground">{k}: </span>{v}</div>
                          ))}
                        </dl>
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3">
                          <p className="text-2xl font-semibold text-brand-blue">{clp(c.precio)}</p>
                          <span className="text-xs text-muted-foreground">{info.nombre} · Ref. {fecha(c.fecha)} · demo</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 2. Ofertas por proveedor */}
            <section className="rounded-3xl border bg-card p-6">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Truck className="h-5 w-5 text-brand-green" />
                <h2 className="text-lg font-semibold">Comparación de ofertas por proveedor</h2>
                <span className="text-sm text-muted-foreground">· {sel.nombre}</span>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                Información comercial informada por cada proveedor (datos de demostración). El total solo se muestra cuando la información está completa.
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
                      setObservaciones((os) => [...os, { productoId: sel.id, producto: sel.nombre, laboratorio: p.laboratorio ?? null, proveedor: p.nombre, texto, fecha: new Date().toISOString() }]);
                      toast.success("Observación guardada");
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* 3. Mis cotizaciones: siempre al final */}
        <div className={sel ? "mt-10" : ""}>
          <SeccionCotizaciones {...acciones} />
        </div>
      </main>
    </div>
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
    ["Laboratorio", p.laboratorio ?? <NoInformado />],
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
    <article className="rounded-2xl border p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
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
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {datos.map(([k, v]) => (
                <div key={k}><span className="text-muted-foreground">{k}: </span><span className="text-foreground">{v}</span></div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end md:text-right">
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
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              onClick={() => setModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Observación
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
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3 text-brand-green" /> {enCarrito} u. en tu cotización</p>
          )}
        </div>
      </div>

      {observaciones.length > 0 && (
        <ul className="mt-3 space-y-1 md:pl-14">
          {observaciones.map((o, i) => (
            <li key={i} className="rounded-lg bg-muted px-3 py-1.5 text-xs"><span className="text-muted-foreground">Observación: </span>{o.texto}</li>
          ))}
        </ul>
      )}

      {p.faltantes.length > 0 && (
        <div className="mt-3 md:pl-14">
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
            <DialogTitle>Observación</DialogTitle>
            <DialogDescription>
              {producto.nombre} · {p.laboratorio ?? "Laboratorio no informado"} · {p.nombre}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej: Este laboratorio no es bueno"
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
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
