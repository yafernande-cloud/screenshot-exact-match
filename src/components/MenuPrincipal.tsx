import { ChevronDown, LogOut } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { CampanitaSolicitudes } from "@/components/SolicitudesAcceso";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session";

const roleLabel: Record<string, string> = {
  admin: "Administradora",
  purchasing: "Compras",
  auxiliary: "Auxiliar",
  approver: "Aprobador",
};

/** Cabecera de cada página: menú lateral a la izquierda; persona y campanita a la derecha. */
export function MenuPrincipal() {
  const { profile, signOut } = useSession();
  const nombre = profile?.display_name ?? "Personal";
  const cargos = (profile?.roles ?? []).map((r) => roleLabel[r] ?? r).join(" · ");
  // La campanita solo tiene sentido para quien puede administrar accesos; el backend lo valida.
  const esAdmin = (profile?.roles ?? []).includes("admin");

  return (
    <header className="mx-auto flex w-full max-w-[1760px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:w-[90%] lg:px-0">
      <SidebarTrigger
        aria-label="Abrir o cerrar menú"
        className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      />
      <span className="min-w-0 text-sm font-medium leading-tight text-primary-foreground/90">
        Cotizador Inteligente Farmacia
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-1 py-1 outline-none transition-colors hover:bg-primary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
              aria-label={`Sesión de ${nombre}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 text-sm font-semibold text-primary-foreground">
                {nombre.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-sm font-medium text-primary-foreground sm:inline">
                {nombre}
              </span>
              <ChevronDown
                className="hidden h-4 w-4 text-primary-foreground/80 sm:block"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm">{nombre}</span>
              {cargos && (
                <span className="block text-xs font-normal text-muted-foreground">{cargos}</span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {esAdmin && <CampanitaSolicitudes />}
      </div>
    </header>
  );
}

export function EncabezadoPagina({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <section className="pt-10 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight text-primary-foreground md:text-4xl">
        {titulo}
      </h1>
      <p className="mt-2 text-sm text-primary-foreground/85">{bajada}</p>
    </section>
  );
}
