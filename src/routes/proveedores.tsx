import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Truck, Plus, Trash2 } from "lucide-react";
import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { Switch } from "@/components/ui/switch";
import { proveedoresAdminDemo, type ProveedorAdmin } from "@/data/demo";

export const Route = createFileRoute("/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores · Cotizador para farmacia" },
      { name: "description", content: "Agrega y administra los proveedores a los que cotizas." },
      { property: "og:title", content: "Proveedores · Cotizador para farmacia" },
      { property: "og:description", content: "Agrega y administra los proveedores a los que cotizas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Proveedores,
});

function Proveedores() {
  const [lista, setLista] = useState<ProveedorAdmin[]>(proveedoresAdminDemo);
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return;
    if (lista.some((p) => p.nombre.toLowerCase() === n.toLowerCase())) { toast.error("Ese proveedor ya existe"); return; }
    setLista([...lista, { nombre: n, contacto: contacto.trim() || "Sin correo", telefono: telefono.trim() || "Sin teléfono", activo: true }]);
    setNombre(""); setContacto(""); setTelefono("");
    toast.success(`${n} agregado`);
  };
  const input = "rounded-lg border bg-background px-3 py-2 text-sm outline-none";

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-24">
        <EncabezadoPagina titulo="Proveedores" bajada="Agrega y administra proveedores. Datos de demostración: los cambios no se guardan al recargar." />
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Agregar proveedor</h2>
          <form onSubmit={agregar} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del proveedor" className={input} aria-label="Nombre del proveedor" />
            <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Correo de contacto" className={input} aria-label="Correo de contacto" />
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" className={input} aria-label="Teléfono" />
            <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" /> Agregar</button>
          </form>
        </section>
        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-2 flex items-center gap-2">
            <Truck className="h-5 w-5 text-brand-green" />
            <h2 className="text-lg font-semibold">Proveedores registrados</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{lista.filter((p) => p.activo).length} activos de {lista.length}</span>
          </div>
          <ul className="divide-y">
            {lista.map((p) => (
              <li key={p.nombre} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{p.nombre} <span className="text-xs font-normal text-muted-foreground">(demo)</span></p>
                  <p className="text-sm text-muted-foreground">{p.contacto} · {p.telefono}</p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={p.activo} onCheckedChange={(v) => setLista(lista.map((x) => x.nombre === p.nombre ? { ...x, activo: v } : x))} aria-label={`Activar ${p.nombre}`} />
                    {p.activo ? "Activo" : "Inactivo"}
                  </label>
                  <button onClick={() => setLista(lista.filter((x) => x.nombre !== p.nombre))} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${p.nombre}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
