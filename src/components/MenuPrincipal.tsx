import { SidebarTrigger } from "@/components/ui/sidebar";

/** Cabecera de cada página: botón para expandir/contraer el menú lateral y nombre de la app. */
export function MenuPrincipal() {
  return (
    <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
      <SidebarTrigger aria-label="Expandir o contraer menú" className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" />
      <span className="text-sm font-medium text-primary-foreground/90">Cotizador inteligente para farmacia</span>
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
