import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const opciones = [
  { to: "/", label: "Cotizador" },
  { to: "/historial", label: "Historial de cotizaciones" },
  { to: "/proveedores", label: "Proveedores" },
  { to: "/telegram", label: "Configuración de Telegram" },
] as const;

/** Menú principal compartido por todas las páginas. */
export function MenuPrincipal() {
  const [abierto, setAbierto] = useState(false);
  const base = "rounded-full px-3 py-1.5 text-sm transition-colors";
  const inactivo = `${base} text-primary-foreground/85 hover:bg-primary-foreground/15`;
  const activo = `${base} bg-card font-medium text-foreground shadow-soft`;

  return (
    <header className="px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link to="/" className="text-sm font-semibold text-primary-foreground">Cotizador inteligente para farmacia</Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Menú principal">
          {opciones.map((o) => (
            <Link key={o.to} to={o.to} activeProps={{ className: activo }} inactiveProps={{ className: inactivo }} activeOptions={{ exact: true }}>
              {o.label}
            </Link>
          ))}
        </nav>
        <button className="rounded-full p-2 text-primary-foreground md:hidden" aria-label="Abrir menú" onClick={() => setAbierto(!abierto)}>
          {abierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {abierto && (
        <nav className="mx-auto mt-3 flex max-w-5xl flex-col gap-1 rounded-2xl border bg-card p-2 shadow-soft md:hidden" aria-label="Menú principal móvil">
          {opciones.map((o) => (
            <Link
              key={o.to}
              to={o.to}
              onClick={() => setAbierto(false)}
              activeProps={{ className: "rounded-xl bg-muted px-3 py-2 text-sm font-medium text-foreground" }}
              inactiveProps={{ className: "rounded-xl px-3 py-2 text-sm text-foreground hover:bg-muted" }}
              activeOptions={{ exact: true }}
            >
              {o.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function EncabezadoPagina({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <section className="pt-10 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight text-primary-foreground md:text-4xl">{titulo}</h1>
      <p className="mt-2 text-sm text-primary-foreground/85">{bajada}</p>
    </section>
  );
}
