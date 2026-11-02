import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, ArrowRight } from "lucide-react";
import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { clp, cotizacionesGuardadasDemo } from "@/data/demo";

export const Route = createFileRoute("/mis-cotizaciones")({
  head: () => ({
    meta: [
      { title: "Mis cotizaciones · Cotizador para farmacia" },
      { name: "description", content: "Accede a tus cotizaciones guardadas, separadas por proveedor." },
      { property: "og:title", content: "Mis cotizaciones · Cotizador para farmacia" },
      { property: "og:description", content: "Accede a tus cotizaciones guardadas, separadas por proveedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MisCotizaciones,
});

function MisCotizaciones() {
  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-6 pb-24">
        <EncabezadoPagina titulo="Mis cotizaciones" bajada="Cotizaciones guardadas con datos ficticios de demostración." />
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-brand-green" />
              <h2 className="text-lg font-semibold">Cotizaciones guardadas</h2>
            </div>
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-brand-green hover:underline">
              Ir a la cotización activa <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {cotizacionesGuardadasDemo.map((c) => (
              <li key={c.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground">{c.id} · guardada el {new Date(c.fecha + "T12:00").toLocaleDateString("es-CL")} · demo</p>
                  </div>
                </div>
                <ul className="mt-3 divide-y text-sm">
                  {c.carritos.map((k) => (
                    <li key={k.proveedor} className="flex items-center justify-between gap-3 py-2">
                      <span>{k.proveedor} <span className="text-xs text-muted-foreground">· {k.productos} {k.productos === 1 ? "producto" : "productos"}</span></span>
                      {k.subtotal !== null ? <span className="font-medium text-brand-green">{clp(k.subtotal)}</span> : <span className="text-xs text-muted-foreground">Subtotal pendiente</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
