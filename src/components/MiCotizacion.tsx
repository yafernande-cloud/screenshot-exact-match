import { useState } from "react";
import { ShoppingCart, ChevronDown, Minus, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { clp } from "@/data/demo";
import {
  agrupar, buscarOferta, evaluarLinea, proveedoresCon, resumen, subtotalProveedor, type Linea,
} from "@/lib/cotizacion";
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

/** Sección «Mis cotizaciones»: un contenedor independiente por proveedor, al final de la página. */
export function SeccionCotizaciones(props: CotizacionAcciones) {
  const { lineas } = props;
  const grupos = agrupar(lineas);
  const r = resumen(lineas);
  const [cerrados, setCerrados] = useState<string[]>([]);
  const [vaciarProv, setVaciarProv] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border bg-card p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-brand-blue" />
        <h3 className="text-lg font-semibold">Mis cotizaciones</h3>
        {lineas.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {r.productos} {r.productos === 1 ? "producto" : "productos"} · {r.proveedores} {r.proveedores === 1 ? "proveedor" : "proveedores"}
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">Cotización en preparación, separada por proveedor (datos de demostración). Los subtotales solo se muestran cuando la información está completa.</p>

      {lineas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8" />
          Aún no has agregado productos. Busca un producto y usa «Agregar a cotización» en la ficha de un proveedor.
        </div>
      ) : (
        <>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map((g) => {
              const abierto = !cerrados.includes(g.proveedor);
              const sub = subtotalProveedor(lineas, g.proveedor);
              return (
                <div key={g.proveedor} className="rounded-2xl border bg-card">
                  <button
                    onClick={() => setCerrados(abierto ? [...cerrados, g.proveedor] : cerrados.filter((c) => c !== g.proveedor))}
                    className="flex w-full items-center gap-3 p-4 text-left"
                    aria-expanded={abierto}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue">{iniciales(g.proveedor)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{g.proveedor} <span className="text-xs font-normal text-muted-foreground">(demo)</span></p>
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
                      <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                        <button onClick={() => setVaciarProv(g.proveedor)} className="text-xs text-muted-foreground hover:text-destructive">Vaciar carrito</button>
                        {sub !== null ? <span>Subtotal: <span className="font-semibold text-brand-green">{clp(sub)}</span></span> : <span className="text-muted-foreground">Subtotal pendiente</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
            {r.total !== null ? (
              <span className="font-semibold">Total referencial: <span className="text-brand-green">{clp(r.total)}</span></span>
            ) : (
              <span className="text-muted-foreground">
                Total general pendiente: {r.pendientes} {r.pendientes === 1 ? "carrito tiene" : "carritos tienen"} información incompleta.
              </span>
            )}
            {r.total === null && r.confirmado > 0 && <span>Subtotales completos: <span className="font-medium">{clp(r.confirmado)}</span></span>}
          </div>
        </>
      )}

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
    </section>
  );
}

function LineaItem({ l, onCantidad, onQuitar, onMover }: { l: Linea } & CotizacionAcciones) {
  const r = buscarOferta(l.productoId, l.proveedor);
  if (!r) return null;
  const e = evaluarLinea(l);
  const otros = proveedoresCon(l.productoId).filter((p) => p !== l.proveedor);
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{r.producto.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {r.oferta.precioUnitario !== null ? `${clp(r.oferta.precioUnitario)} c/u` : "Sin precio informado"} · {r.oferta.presentacion}
          </p>
          <p className="text-xs text-muted-foreground">Condiciones: {r.oferta.condiciones}</p>
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
