import { SidebarTrigger } from "@/components/ui/sidebar";
import { CampanitaSolicitudes } from "@/components/SolicitudesAcceso";
import { adminDemo } from "@/data/demo";

/** Cabecera de cada página: menú lateral a la izquierda; administrador y campanita a la derecha. */
export function MenuPrincipal() {
  return (
    <header className="mx-auto flex w-full max-w-[1760px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:w-[90%] lg:px-0">
      <SidebarTrigger aria-label="Abrir o cerrar menú" className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" />
      <span className="min-w-0 text-sm font-medium leading-tight text-primary-foreground/90">Cotizador Inteligente Farmacia</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 text-sm font-semibold text-primary-foreground" title={adminDemo.nombre}>
            {adminDemo.nombre[0]}
          </div>
          <span className="hidden text-sm font-medium text-primary-foreground sm:inline">
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
