import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { History, Search } from "lucide-react";
import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { clp, historialDemo } from "@/data/demo";

export const Route = createFileRoute("/historial")({
  head: () => ({
    meta: [
      { title: "Historial de cotizaciones · Cotizador para farmacia" },
      { name: "description", content: "Revisa las cotizaciones enviadas a proveedores y su estado." },
      { property: "og:title", content: "Historial de cotizaciones · Cotizador para farmacia" },
      { property: "og:description", content: "Revisa las cotizaciones enviadas a proveedores y su estado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historial,
});

const estilo = {
  Respondida: "bg-brand-green/10 text-brand-green",
  Enviada: "bg-brand-blue/10 text-brand-blue",
  Borrador: "bg-muted text-muted-foreground",
} as const;

function Historial() {
  const [q, setQ] = useState("");
  const filas = historialDemo.filter((h) => (h.id + " " + h.proveedor).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto max-w-5xl px-4 pb-24">
        <EncabezadoPagina titulo="Historial de cotizaciones" bajada="Cotizaciones anteriores con datos ficticios de demostración." />
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-brand-blue" />
              <h2 className="text-lg font-semibold">Cotizaciones anteriores</h2>
            </div>
            <label className="flex items-center gap-2 rounded-full border px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o proveedor" className="bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">Código</th>
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Proveedor</th>
                  <th className="py-2 pr-4 font-medium">Productos</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 pr-4 font-medium">{h.id}</td>
                    <td className="py-3 pr-4">{new Date(h.fecha + "T12:00").toLocaleDateString("es-CL")}</td>
                    <td className="py-3 pr-4">{h.proveedor} <span className="text-xs text-muted-foreground">(demo)</span></td>
                    <td className="py-3 pr-4">{h.productos}</td>
                    <td className="py-3 pr-4">{h.total !== null ? clp(h.total) : <span className="text-muted-foreground">Pendiente</span>}</td>
                    <td className="py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${estilo[h.estado]}`}>{h.estado}</span></td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sin cotizaciones que coincidan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
