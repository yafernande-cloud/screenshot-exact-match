import { SidebarTrigger } from "@/components/ui/sidebar";
import { CampanitaSolicitudes } from "@/components/SolicitudesAcceso";
import { adminDemo } from "@/data/demo";

/** Cabecera de cada página: menú lateral a la izquierda; administrador y campanita a la derecha. */
export function MenuPrincipal() {
  return (
    <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
      <SidebarTrigger aria-label="Expandir o contraer menú" className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" />
      <span className="hidden text-sm font-medium text-primary-foreground/90 sm:inline">Cotizador Inteligente — Farmacia Parque Lantaño</span>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20 text-sm font-semibold text-primary-foreground">
            {adminDemo.nombre[0]}
          </div>
          <span className="text-sm font-medium text-primary-foreground">
            {adminDemo.nombre} <span className="text-xs font-normal text-primary-foreground/75">(demo)</span>
          </span>
        </div>
        <CampanitaSolicitudes />
      </div>
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
