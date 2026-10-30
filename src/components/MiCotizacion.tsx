import { useState } from "react";
import { ShoppingCart, ChevronDown, ChevronsRight, ChevronsLeft, Minus, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { clp } from "@/data/demo";
import {
  agrupar, buscarOferta, evaluarLinea, proveedoresCon, resumen, subtotalProveedor, type Linea,
} from "@/lib/cotizacion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface CotizacionAcciones {
  lineas: Linea[];
  onCantidad: (productoId: string, proveedor: string, cantidad: number) => void;
  onQuitar: (productoId: string, proveedor: string) => void;
  onVaciar: (proveedor: string) => void;
  onMover: (productoId: string, desde: string, hacia: string) => void;
}

const iniciales = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");

function Contenido(props: CotizacionAcciones) {
  const { lineas } = props;
  const grupos = agrupar(lineas);
  const r = resumen(lineas);
  const [cerrados, setCerrados] = useState<string[]>([]);
  const [vaciarProv, setVaciarProv] = useState<string | null>(null);

  if (lineas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <ShoppingCart className="h-8 w-8" />
        Aún no hay productos. Usa «Agregar a cotización» en la sección Proveedores.
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {grupos.map((g) => {
          const abierto = !cerrados.includes(g.proveedor);
          const sub = subtotalProveedor(lineas, g.proveedor);
          return (
            <div key={g.proveedor} className="rounded-xl border bg-card">
              <button
                onClick={() => setCerrados(abierto ? [...cerrados, g.proveedor] : cerrados.filter((c) => c !== g.proveedor))}
                className="flex w-full items-center gap-3 p-3 text-left"
                aria-expanded={abierto}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-brand-blue">{iniciales(g.proveedor)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.proveedor}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.lineas.length} {g.lineas.length === 1 ? "producto" : "productos"} ·{" "}
                    {sub !== null ? <span className="font-medium text-brand-green">{clp(sub)}</span> : "Subtotal pendiente"}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
              </button>
              {abierto && (
                <div className="border-t">
                  <ul className="divide-y">
                    {g.lineas.map((l) => <LineaItem key={l.productoId} l={l} {...props} />)}
                  </ul>
                  <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                    <button onClick={() => setVaciarProv(g.proveedor)} className="text-muted-foreground hover:text-destructive">Vaciar carrito</button>
                    {sub !== null ? <span>Subtotal: <span className="font-semibold text-foreground">{clp(sub)}</span></span> : <span className="text-muted-foreground">Subtotal pendiente</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1 border-t p-4 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>Productos</span><span>{r.productos}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Proveedores</span><span>{r.proveedores}</span></div>
        {r.total !== null ? (
          <div className="flex justify-between pt-1 font-semibold"><span>Total referencial</span><span className="text-brand-green">{clp(r.total)}</span></div>
        ) : (
          <>
            {r.confirmado > 0 && <div className="flex justify-between"><span>Subtotales completos</span><span className="font-medium">{clp(r.confirmado)}</span></div>}
            <p className="pt-1 text-xs text-muted-foreground">
              Total general pendiente: {r.pendientes} {r.pendientes === 1 ? "carrito tiene" : "carritos tienen"} información incompleta.
            </p>
          </>
        )}
        <p className="pt-1 text-[11px] text-muted-foreground">Cotización en preparación · datos de demostración</p>
      </div>

      <AlertDialog open={vaciarProv !== null} onOpenChange={(o) => !o && setVaciarProv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar el carrito de {vaciarProv}?</AlertDialogTitle>
            <AlertDialogDescription>Se quitarán todos sus productos de la cotización. Los demás proveedores no cambian.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (vaciarProv) props.onVaciar(vaciarProv); setVaciarProv(null); }}>Vaciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LineaItem({ l, onCantidad, onQuitar, onMover }: { l: Linea } & CotizacionAcciones) {
  const r = buscarOferta(l.productoId, l.proveedor);
  if (!r) return null;
  const e = evaluarLinea(l);
  const otros = proveedoresCon(l.productoId).filter((p) => p !== l.proveedor);
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{r.producto.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {r.oferta.precioUnitario !== null ? `${clp(r.oferta.precioUnitario)} c/u` : "Sin precio informado"} · {r.oferta.presentacion}
          </p>
        </div>
        <button onClick={() => onQuitar(l.productoId, l.proveedor)} aria-label={`Quitar ${r.producto.nombre}`} className="p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center rounded-full border">
          <button aria-label="Disminuir" onClick={() => onCantidad(l.productoId, l.proveedor, l.cantidad - 1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus className="h-3 w-3" /></button>
          <input
            type="number" min={1} value={l.cantidad} aria-label="Cantidad"
            onChange={(ev) => onCantidad(l.productoId, l.proveedor, parseInt(ev.target.value) || 1)}
            className="w-10 bg-transparent text-center text-xs font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button aria-label="Aumentar" onClick={() => onCantidad(l.productoId, l.proveedor, l.cantidad + 1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
        </div>
        <span className="text-xs">{e.ok ? <span className="font-medium">{clp(e.subtotal)}</span> : <span className="text-muted-foreground">Subtotal pendiente</span>}</span>
      </div>
      {!e.ok && (
        <p className={`flex items-center gap-1 text-xs ${e.motivo === "bajo-minimo" ? "text-destructive" : "text-muted-foreground"}`}>
          {e.motivo === "bajo-minimo" ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
          {e.texto}
        </p>
      )}
      {otros.length > 0 && (
        <select
          value=""
          onChange={(ev) => ev.target.value && onMover(l.productoId, l.proveedor, ev.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground"
          aria-label="Cambiar proveedor"
        >
          <option value="">Cambiar a otro proveedor…</option>
          {otros.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
    </li>
  );
}

function Contador({ n }: { n: number }) {
  return <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-green px-1.5 text-[11px] font-semibold text-primary-foreground">{n}</span>;
}

/** Panel lateral en escritorio; ocupa su propio espacio para no tapar los resultados. */
export function PanelCotizacion(props: CotizacionAcciones) {
  const [abierto, setAbierto] = useState(true);
  const n = props.lineas.length;
  if (!abierto) {
    return (
      <aside className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center gap-3 border-l bg-card py-5 lg:flex">
        <button onClick={() => setAbierto(true)} aria-label="Expandir Mi cotización" className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground">
          <ChevronsLeft className="h-4 w-4" />
          <ShoppingCart className="h-5 w-5 text-brand-blue" />
          <Contador n={n} />
        </button>
      </aside>
    );
  }
  return (
    <aside className="sticky top-0 hidden h-screen w-[340px] shrink-0 flex-col border-l bg-background lg:flex">
      <div className="flex items-center justify-between border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-brand-blue" />
          <h2 className="font-semibold">Mi cotización</h2>
          <Contador n={n} />
        </div>
        <button onClick={() => setAbierto(false)} aria-label="Contraer Mi cotización" className="p-1 text-muted-foreground hover:text-foreground">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
      <Contenido {...props} />
    </aside>
  );
}

/** Botón flotante y panel deslizable en pantallas pequeñas. */
export function CotizacionMovil(props: CotizacionAcciones) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label="Abrir Mi cotización"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-soft lg:hidden"
      >
        <ShoppingCart className="h-5 w-5" />
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1.5 text-[11px] font-semibold text-primary">{props.lineas.length}</span>
      </button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Mi cotización</SheetTitle>
            <SheetDescription>{props.lineas.length} productos agrupados por proveedor</SheetDescription>
          </SheetHeader>
          <Contenido {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}
