import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Send, Plus, Trash2 } from "lucide-react";
import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { Switch } from "@/components/ui/switch";
import { accesosTelegramDemo, type AccesoTelegram } from "@/data/demo";

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: "Configuración de Telegram · Cotizador para farmacia" },
      { name: "description", content: "Habilita el bot de Telegram y administra quién puede usarlo." },
      { property: "og:title", content: "Configuración de Telegram · Cotizador para farmacia" },
      { property: "og:description", content: "Habilita el bot de Telegram y administra quién puede usarlo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Telegram,
});

function Telegram() {
  const [habilitado, setHabilitado] = useState(false);
  const [accesos, setAccesos] = useState<AccesoTelegram[]>(accesosTelegramDemo);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState<AccesoTelegram["rol"]>("Consulta");

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const u = usuario.trim().replace(/^@?/, "@");
    if (!nombre.trim() || u === "@") return;
    if (accesos.some((a) => a.usuario.toLowerCase() === u.toLowerCase())) { toast.error("Ese usuario ya tiene acceso"); return; }
    setAccesos([...accesos, { nombre: nombre.trim(), usuario: u, rol }]);
    setNombre(""); setUsuario("");
    toast.success(`Acceso otorgado a ${u}`);
  };
  const input = "rounded-lg border bg-background px-3 py-2 text-sm outline-none";

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-24">
        <EncabezadoPagina titulo="Configuración de Telegram" bajada="Simulación visual: no se conecta a Telegram ni guarda cambios al recargar." />
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-card p-6">
          <div className="flex items-start gap-3">
            <Send className="mt-0.5 h-5 w-5 text-brand-blue" />
            <div>
              <h2 className="text-lg font-semibold">Bot de cotizaciones</h2>
              <p className="text-sm text-muted-foreground">@CotizadorFarmaciaDemoBot · permite consultar precios y cotizaciones desde Telegram.</p>
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={habilitado} onCheckedChange={setHabilitado} aria-label="Habilitar Telegram" />
            {habilitado ? "Habilitado" : "Deshabilitado"}
          </label>
        </section>
        <section className={`rounded-3xl border bg-card p-6 transition-opacity ${habilitado ? "" : "opacity-60"}`}>
          <h2 className="text-lg font-semibold">Accesos autorizados</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {habilitado ? "Solo estas personas pueden usar el bot." : "El bot está deshabilitado: nadie puede usarlo aunque tenga acceso."}
          </p>
          <form onSubmit={agregar} className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={input} aria-label="Nombre" />
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="@usuario de Telegram" className={input} aria-label="Usuario de Telegram" />
            <select value={rol} onChange={(e) => setRol(e.target.value as AccesoTelegram["rol"])} className={input} aria-label="Rol">
              <option>Consulta</option>
              <option>Administrador</option>
            </select>
            <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" /> Dar acceso</button>
          </form>
          <ul className="divide-y">
            {accesos.map((a) => (
              <li key={a.usuario} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{a.nombre} <span className="text-xs font-normal text-muted-foreground">(demo)</span></p>
                  <p className="text-sm text-muted-foreground">{a.usuario} · {a.rol}</p>
                </div>
                <button onClick={() => setAccesos(accesos.filter((x) => x.usuario !== a.usuario))} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Quitar acceso a ${a.usuario}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {accesos.length === 0 && <li className="py-4 text-sm text-muted-foreground">Nadie tiene acceso todavía.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
