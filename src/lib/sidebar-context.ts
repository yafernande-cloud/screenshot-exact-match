import { createContext, type Context } from "react";

/**
 * Objeto de contexto del menú lateral.
 *
 * Vive en este módulo —sin componentes— y se registra en `globalThis` con `Symbol.for` para que
 * exista **un único objeto por página**, aunque el runtime evalúe este módulo más de una vez.
 *
 * Es el mismo problema que ya se corrigió para la sesión (ver `session-context.ts`): Vite resuelve
 * una actualización en caliente reimportando el módulo cambiado con `?t=…` y la instancia nueva
 * convive con la anterior, que siguen usando los módulos que no cambiaron. Si `SidebarProvider` y
 * `useSidebar` leen dos objetos distintos, el hook falla con «useSidebar must be used within a
 * SidebarProvider» aunque el árbol de React sea correcto. Compartir el objeto en `globalThis`
 * elimina esa diferencia de identidad; si de verdad no hay proveedor arriba, el hook sigue
 * lanzando el mismo error.
 */

export type SidebarState = "expanded" | "collapsed";

export interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

type SidebarContextType = Context<SidebarContextValue | null>;

const CONTEXT_KEY = Symbol.for("cotizador-farmacia.sidebar-context");

function sharedSidebarContext(): SidebarContextType {
  const registry = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const existing = registry[CONTEXT_KEY];
  if (existing) return existing as SidebarContextType;

  const created = createContext<SidebarContextValue | null>(null);
  registry[CONTEXT_KEY] = created;
  return created;
}

export const SidebarContext = sharedSidebarContext();
