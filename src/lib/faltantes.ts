import type { ReporteFaltante, SolicitudAcceso } from "@/data/demo";

/** Ajusta la cantidad de un solo reporte (mínimo 1); los demás reportes no cambian. */
export function ajustarCantidad(reportes: ReporteFaltante[], reporteId: string, delta: number): ReporteFaltante[] {
  return reportes.map((r) => (r.reporteId === reporteId ? { ...r, cantidad: Math.max(1, r.cantidad + delta) } : r));
}

/** Retira un reporte de la bandeja. No equivale a una compra confirmada. */
export const eliminarReporte = (reportes: ReporteFaltante[], reporteId: string) =>
  reportes.filter((r) => r.reporteId !== reporteId);

export const pendientes = (s: SolicitudAcceso[]) => s.filter((x) => x.estado === "pendiente");

/** Cualquier administrador autorizado puede aprobar o rechazar; solo se resuelven solicitudes pendientes. */
export function resolverSolicitud(
  solicitudes: SolicitudAcceso[], solicitudId: string, estado: "aprobada" | "rechazada", adminId: string,
): SolicitudAcceso[] {
  return solicitudes.map((s) => (s.solicitudId === solicitudId && s.estado === "pendiente" ? { ...s, estado, revisadaPor: adminId } : s));
}
