import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Store, Truck, MessageSquarePlus, X } from "lucide-react";
import { productos, clp, type Producto, type Estado } from "@/data/demo";

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
  verificada: "bg-brand-green/10 text-brand-green",
  parcial: "bg-brand-blue/10 text-brand-blue",
  pendiente: "bg-muted text-muted-foreground",
};
const estadoLabel: Record<Estado, string> = { verificada: "Verificada", parcial: "Parcial", pendiente: "Pendiente de revisión" };
const fecha = (s: string) => new Date(s + "T12:00").toLocaleDateString("es-CL");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Index() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Producto | null>(null);
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
              <p className="text-muted-foreground">{sel.presentacion} · {sel.categoria}</p>
            </div>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <Store className="h-5 w-5 text-brand-blue" />
                <h3 className="text-lg font-semibold">Precios en cadenas de farmacias</h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">Precios referenciales de venta al público. No son costos de abastecimiento.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sel.cadenas.map((c) => (
                  <div key={c.nombre} className="rounded-2xl border bg-card p-5">
                    <p className="font-medium">{c.nombre}</p>
                    <p className="mt-2 text-3xl font-semibold text-brand-blue">{clp(c.precio)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{c.presentacion}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Ref. {fecha(c.fecha)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5">Precio público</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-6">
              <div className="mb-1 flex items-center gap-2">
                <Truck className="h-5 w-5 text-brand-green" />
                <h3 className="text-lg font-semibold">Proveedores</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                Precios de adquisición. {sel.proveedores.some((p) => p.precio === null || p.estado !== "verificada") && "Hay información incompleta: no es posible afirmar cuál es el más conveniente."}
              </p>
              <div className="divide-y">
                {sel.proveedores.map((p) => (
                  <div key={p.nombre} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{p.nombre}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${estadoStyle[p.estado]}`}>{estadoLabel[p.estado]}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.presentacion} · {p.disponibilidad ?? "Disponibilidad desconocida"}</p>
                      <p className="text-sm text-muted-foreground">{p.condiciones}</p>
                    </div>
                    <p className="text-2xl font-semibold text-brand-green">{p.precio !== null ? clp(p.precio) : <span className="text-base text-muted-foreground">Sin precio</span>}</p>
                  </div>
                ))}
              </div>
            </section>

            <Observaciones sel={sel} notes={notes} onAdd={(n) => setNotes([...notes, n])} />
          </div>
        )}
      </main>
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
