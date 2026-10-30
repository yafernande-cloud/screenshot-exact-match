import { describe, expect, it } from "vitest";
import { agregar, carritoInicial, evaluarLinea, mover, resumen, subtotalProveedor } from "@/lib/cotizacion";

describe("cotización por proveedor", () => {
  it("adding a product already in that supplier's cart updates quantity instead of duplicating", () => {
    const r = agregar(carritoInicial, "paracetamol", "Proveedor X", 40);
    expect(r.filter((l) => l.productoId === "paracetamol" && l.proveedor === "Proveedor X")).toEqual([
      { productoId: "paracetamol", proveedor: "Proveedor X", cantidad: 40 },
    ]);
    expect(r.length).toBe(carritoInicial.length);
  });

  it("adding to one supplier keeps the other suppliers' carts", () => {
    const r = agregar([], "paracetamol", "Proveedor X", 20);
    const r2 = agregar(r, "losartan", "Proveedor Y", 10);
    expect(r2.map((l) => l.proveedor)).toEqual(["Proveedor X", "Proveedor Y"]);
  });

  it("moving a product is refused when the target supplier has no offer for it", () => {
    expect(mover(carritoInicial, "nivea", "Proveedor X", "Proveedor Z")).toBe(carritoInicial);
  });

  it("moving a product is allowed when the target supplier has an offer", () => {
    const r = mover(carritoInicial, "alcohol", "Proveedor Z", "Proveedor X");
    expect(r.find((l) => l.productoId === "alcohol")?.proveedor).toBe("Proveedor X");
  });

  it("quantity below the minimum leaves the supplier subtotal pending", () => {
    expect(evaluarLinea({ productoId: "nivea", proveedor: "Proveedor X", cantidad: 3 })).toMatchObject({ ok: false, motivo: "bajo-minimo" });
    expect(subtotalProveedor(carritoInicial, "Proveedor X")).toBeNull();
  });

  it("supplier subtotal shows only when every line is complete", () => {
    const lineas = [
      { productoId: "paracetamol", proveedor: "Proveedor X", cantidad: 20 },
      { productoId: "nivea", proveedor: "Proveedor X", cantidad: 6 },
    ];
    expect(subtotalProveedor(lineas, "Proveedor X")).toBe(20 * 360 + 6 * 6900);
  });

  it("an offer pending review is not treated as verified", () => {
    expect(evaluarLinea({ productoId: "alcohol", proveedor: "Proveedor Z", cantidad: 2 })).toMatchObject({ ok: false, motivo: "no-verificada" });
  });

  it("no definitive overall total while any cart is incomplete", () => {
    expect(resumen(carritoInicial).total).toBeNull();
  });
});
