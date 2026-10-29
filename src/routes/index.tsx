import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Store, Truck, MessageSquarePlus, X, Minus, Plus, ChevronDown } from "lucide-react";
import { productos, clp, cadenasInfo, totalProveedor, type Producto, type Estado, type Proveedor } from "@/data/demo";

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

const estadoStyle: Record<Estado, string> = {
  completa: "bg-brand-green/10 text-brand-green",
  parcial: "bg-brand-blue/10 text-brand-blue",
  pendiente: "bg-muted text-muted-foreground",
};
const estadoLabel: Record<Estado, string> = { completa: "Completa", parcial: "Parcial", pendiente: "Pendiente de revisión" };
const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Index() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [notes, setNotes] = useState<{ target: string; text: string }[]>([]);

  const sugerencias = useMemo(
    () => (q.trim() ? productos.filter((p) => norm(p.nombre + " " + p.categoria).includes(norm(q.trim()))) : productos),
    [q],
  );

  return (
    <div className="min-h-screen bg-hero">
      <header className="px-6 py-5 text-sm font-medium text-primary-foreground/90">Cotizador inteligente para farmacia</header>

      <main className="mx-auto max-w-5xl px-4 pb-24">
        <section className="flex flex-col items-center pt-16 pb-12">
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
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              {q && <button onClick={() => { setQ(""); setSel(null); }} aria-label="Limpiar"><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
            {open && (
              <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border bg-card py-2 shadow-soft">
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
            <div className="rounded-2xl border bg-card p-6 shadow-soft">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Comparando</p>
              <h2 className="text-2xl font-semibold">{sel.nombre}</h2>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <p className="text-muted-foreground">{sel.presentacion} · {sel.categoria}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Cantidad a cotizar</span>
                  <div className="flex items-center rounded-full border">
                    <button aria-label="Menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))} className="p-2 text-muted-foreground hover:text-foreground"><Minus className="h-4 w-4" /></button>
                    <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    <button aria-label="Más" onClick={() => setCantidad(cantidad + 1)} className="p-2 text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <Store className="h-5 w-5 text-brand-blue" />
                <h3 className="text-lg font-semibold">Precios en cadenas de farmacias</h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">Precios ficticios de demostración, referenciales de venta al público. No son costos de abastecimiento.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sel.cadenas.map((c) => {
                  const info = cadenasInfo[c.id];
                  return (
                    <div key={c.id} className="rounded-2xl border bg-card p-5">
                      <div className="flex h-12 items-center">
                        <img src={info.logo} alt={`Logo ${info.nombre}`} className="max-h-12 max-w-[140px] object-contain" />
                      </div>
                      <p className="mt-3 font-medium">{info.nombre}</p>
                      <p className="mt-1 text-3xl font-semibold text-brand-blue">{clp(c.precio)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{c.presentacion}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Ref. {fecha(c.fecha)} · demo</span>
                        <span className="rounded-full bg-muted px-2 py-0.5">Precio público</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-6">
              <div className="mb-1 flex items-center gap-2">
                <Truck className="h-5 w-5 text-brand-green" />
                <h3 className="text-lg font-semibold">Proveedores</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                Precio unitario informado por cada proveedor (datos de demostración). El total solo se muestra cuando la información está completa.
                {sel.proveedores.some((p) => p.estado !== "completa") && " Hay información incompleta: no es posible determinar cuál es el más conveniente."}
              </p>
              <div className="divide-y">
                {sel.proveedores.map((p) => <ProveedorFila key={p.nombre} p={p} cantidad={cantidad} />)}
              </div>
            </section>

            <Observaciones sel={sel} notes={notes} onAdd={(n) => setNotes([...notes, n])} />
          </div>
        )}
      </main>
    </div>
  );
}

function ProveedorFila({ p, cantidad }: { p: Proveedor; cantidad: number }) {
  const [open, setOpen] = useState(false);
  const t = totalProveedor(p, cantidad);
  return (
    <div className="py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          {p.logo ? (
            <img src={p.logo} alt={p.nombre} className="h-10 w-10 object-contain" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue">
              {p.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{p.nombre} <span className="text-xs font-normal text-muted-foreground">(demo)</span></p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${estadoStyle[p.estado]}`}>{estadoLabel[p.estado]}</span>
            </div>
            <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-2">
              <div>Presentación: <span className="text-foreground">{p.presentacion}</span></div>
              <div>Mínimo de compra: <span className="text-foreground">{p.minimo !== null ? `${p.minimo} unidades` : "Desconocido"}</span></div>
              <div>Disponibilidad: <span className="text-foreground">{p.disponibilidad ?? "Desconocida"}</span></div>
              <div>Condiciones: <span className="text-foreground">{p.condiciones}</span></div>
            </dl>
          </div>
        </div>
        <div className="text-left md:text-right">
          {p.precioUnitario !== null ? (
            <>
              <p className="text-2xl font-semibold text-brand-green">{clp(p.precioUnitario)}</p>
              <p className="text-xs text-muted-foreground">precio unitario</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sin precio informado</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {"total" in t ? <>Total {cantidad} u.: <span className="font-medium text-foreground">{clp(t.total)}</span></> : t.pendiente}
          </p>
        </div>
      </div>
      {p.faltantes.length > 0 && (
        <div className="mt-3 md:pl-14">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-brand-blue hover:underline">
            ¿Qué falta para calcular el costo completo? <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {p.faltantes.map((f) => <li key={f} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{f}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Observaciones({ sel, notes, onAdd }: { sel: Producto; notes: { target: string; text: string }[]; onAdd: (n: { target: string; text: string }) => void }) {
  const [show, setShow] = useState(false);
  const [target, setTarget] = useState(sel.nombre);
  const [text, setText] = useState("");
  const targets = [sel.nombre, ...sel.proveedores.map((p) => p.nombre)];
  const visibles = notes.filter((n) => targets.includes(n.target));

  return (
    <section className="rounded-2xl border border-dashed p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Observaciones comerciales</h3>
        <button onClick={() => setShow(!show)} className="flex items-center gap-1 text-sm text-brand-blue hover:underline">
          <MessageSquarePlus className="h-4 w-4" /> Agregar
        </button>
      </div>
      {show && (
        <form
          className="mt-4 flex flex-col gap-2 md:flex-row"
          onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onAdd({ target, text: text.trim() }); setText(""); setShow(false); }}
        >
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
            {targets.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: Este proveedor suele atrasarse con las entregas" className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none" />
          <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Guardar</button>
        </form>
      )}
      {visibles.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {visibles.map((n, i) => (
            <li key={i} className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-medium">{n.target}:</span> {n.text}</li>
          ))}
        </ul>
      ) : !show && <p className="mt-2 text-xs text-muted-foreground">Sin observaciones. No afectan los precios.</p>}
    </section>
  );
}
