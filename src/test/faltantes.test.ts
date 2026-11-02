import { describe, expect, it } from "vitest";
import { faltantesDemo, solicitudesDemo } from "@/data/demo";
import { ajustarCantidad, eliminarReporte, pendientes, resolverSolicitud } from "@/lib/faltantes";
import { buscarProducto, totalCarrito } from "@/lib/cotizacion";

describe("faltantes por cotizar", () => {
  it("lowering María's Losartán report leaves Juanito's at 10", () => {
    const r = ajustarCantidad(faltantesDemo, "rep-002", -1);
    expect(r.find((x) => x.reporteId === "rep-002")?.cantidad).toBe(9);
    expect(r.find((x) => x.reporteId === "rep-001")?.cantidad).toBe(10);
  });

  it("quantity never drops below 1", () => {
    expect(ajustarCantidad(faltantesDemo, "rep-004", -10).find((x) => x.reporteId === "rep-004")?.cantidad).toBe(1);
  });

  it("removing one report keeps the other reports of the same medicine", () => {
    const r = eliminarReporte(faltantesDemo, "rep-001");
    expect(r.map((x) => x.reporteId)).toEqual(["rep-002", "rep-003", "rep-004"]);
  });
});

describe("solicitudes de acceso", () => {
  it("approving removes the request from pending and records the reviewing admin", () => {
    const r = resolverSolicitud(solicitudesDemo, "sol-001", "aprobada", "adm-2");
    expect(pendientes(r)).toHaveLength(0);
    expect(r[0]).toMatchObject({ estado: "aprobada", revisadaPor: "adm-2" });
  });

  it("an already rejected request cannot be approved afterwards", () => {
    const rechazada = resolverSolicitud(solicitudesDemo, "sol-001", "rechazada", "adm-1");
    expect(resolverSolicitud(rechazada, "sol-001", "aprobada", "adm-2")[0]?.estado).toBe("rechazada");
  });
});

describe("búsqueda y carrito", () => {
  it("finds Losartán by partial name and dose without accents", () => {
    expect(buscarProducto("losartan 50")?.id).toBe("losartan");
  });

  it("cart total adds only complete lines and counts pending ones", () => {
    const r = totalCarrito([
      { productoId: "losartan", proveedor: "Proveedor Y", cantidad: 10 },
      { productoId: "paracetamol", proveedor: "Proveedor Y", cantidad: 5 },
    ]);
    expect(r).toEqual({ total: 20500, pendientes: 1 });
  });
});
