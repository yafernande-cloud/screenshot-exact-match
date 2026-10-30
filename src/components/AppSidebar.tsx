import { Link, useRouterState } from "@tanstack/react-router";
import { Calculator, ShoppingCart, History, Truck, Send } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

/** Opciones del menú lateral. Para sumar una opción futura basta con agregarla aquí. */
export const opcionesMenu = [
  { to: "/", label: "Cotizador", icon: Calculator },
  { to: "/mis-cotizaciones", label: "Mis cotizaciones", icon: ShoppingCart },
  { to: "/historial", label: "Historial de cotizaciones", icon: History },
  { to: "/proveedores", label: "Proveedores", icon: Truck },
  { to: "/telegram", label: "Configuración de Telegram", icon: Send },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const contraido = state === "collapsed" && !isMobile;
  const ruta = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-9 items-center gap-2 px-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">C</div>
          {!contraido && <span className="truncate text-sm font-semibold">Cotizador farmacia</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {opcionesMenu.map((o) => {
                const activo = ruta === o.to;
                return (
                  <SidebarMenuButton key={o.to} asChild isActive={activo} tooltip={o.label} className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary">
                    <Link to={o.to} onClick={() => isMobile && setOpenMobile(false)}>
                      <o.icon className="h-4 w-4" />
                      <span>{o.label}</span>
                    </Link>
                  </SidebarMenuButton>
                );
              }).map((btn, i) => <SidebarMenuItem key={opcionesMenu[i]!.to}>{btn}</SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
