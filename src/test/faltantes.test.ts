import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { solicitudesDemo } from "@/data/demo";
import {
  aplicarCambioCantidad,
  cantidadDeReferencia,
  etiquetaEstadoFaltante,
  fusionarFaltantes,
  pendientes,
  resolverSolicitud,
  siguienteCantidad,
  unidadDeAjuste,
} from "@/lib/faltantes";
import type { Faltante } from "@/lib/faltantes-api";
import { buscarProducto, totalCarrito } from "@/lib/cotizacion";

describe("bandeja sin datos ficticios", () => {
  it("no conserva reportes de demostración ni el dashboard los puede volver a mostrar", () => {
    const demo = readFileSync(resolve(process.cwd(), "src/data/demo.ts"), "utf8");
    const dashboard = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");

    for (const fuente of [demo, dashboard]) {
      expect(fuente).not.toMatch(
        /faltantesDemo|ReporteFaltante|Juanito Pérez|María González|Pedro Soto/,
      );
    }
    expect(dashboard).toContain("listarFaltantes");
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
    expect(resolverSolicitud(rechazada, "sol-001", "aprobada", "adm-2")[0]?.estado).toBe(
      "rechazada",
    );
  });
});

function faltante(overrides: Partial<Faltante> = {}): Faltante {
  return {
    id: "f-1",
    display_name: "Omeprazol 20 mg",
    ingredient: "omeprazol",
    status: "active",
    version: 3,
    observation_count: 2,
    reporters: ["Pato"],
    data_origin: "captured",
    created_at: "2026-11-05T10:00:00Z",
    reported_by: "u-1",
    reported_by_name: "Pato",
    branch_label: "Parque Lantaño",
    declared_quantity: "2",
    declared_unit: "box",
    requested_quantity: "2",
    requested_unit: "box",
    requested_quantity_origin: "explicit",
    target_quantity: null,
    quantity_unit: null,
    quantity_status: "unknown",
    needs_quantity: true,
    reported_at: "2026-11-05T10:00:00Z",
    cancelled_at: null,
    last_raw_text: null,
    ...overrides,
  };
}

describe("bandeja real de faltantes", () => {
  it("presenta el estado real que entrega el backend", () => {
    expect(etiquetaEstadoFaltante("active")).toBe("Pendiente");
    expect(etiquetaEstadoFaltante("cancelled")).toBe("Cancelado");
    expect(etiquetaEstadoFaltante("fulfilled")).toBe("Cumplido");
  });

  it("parte de la cantidad solicitada cuando todavía no hay cantidad objetivo", () => {
    const f = faltante();
    expect(cantidadDeReferencia(f)).toBe(2);
    expect(siguienteCantidad(f, 1)).toBe(3);
  });

  it("usa la cantidad objetivo cuando ya está definida y nunca baja de 1", () => {
    const f = faltante({ target_quantity: "5", quantity_unit: "unit" });
    expect(siguienteCantidad(f, 1)).toBe(6);
    expect(siguienteCantidad(f, -10)).toBe(1);
  });

  it("solo ajusta con una unidad que el backend acepta, sin inventarla", () => {
    expect(unidadDeAjuste(faltante({ quantity_unit: "unit" }))).toBe("unit");
    expect(unidadDeAjuste(faltante({ quantity_unit: null, requested_unit: "box" }))).toBe("box");
    expect(
      unidadDeAjuste(
        faltante({ quantity_unit: null, requested_unit: "caja", declared_unit: "docena" }),
      ),
    ).toBeNull();
  });

  it("el sondeo no pisa una fila más nueva que la respuesta recibida", () => {
    const previo = faltante({ version: 5, target_quantity: "3", quantity_unit: "box" });
    const recibido = faltante({ version: 4, target_quantity: "1", quantity_unit: "box" });
    expect(fusionarFaltantes([previo], [recibido])[0]?.target_quantity).toBe("3");
  });

  it("conserva la fila mientras hay una mutación en curso", () => {
    const previo = faltante({ version: 3, target_quantity: null });
    const recibido = faltante({ version: 4, target_quantity: "1", quantity_unit: "box" });
    const fusion = fusionarFaltantes([previo], [recibido], new Set(["f-1"]));
    expect(fusion[0]?.target_quantity).toBeNull();
    expect(fusion[0]?.version).toBe(3);
  });

  it("aplica la cantidad guardada sin perder autor ni sucursal", () => {
    const previo = faltante();
    const resultado = aplicarCambioCantidad(previo, {
      target_quantity: "4",
      quantity_unit: "box",
      version: 4,
      reported_by_name: null,
      branch_label: null,
    });
    expect(resultado.target_quantity).toBe("4");
    expect(resultado.version).toBe(4);
    expect(resultado.reported_by_name).toBe("Pato");
    expect(resultado.branch_label).toBe("Parque Lantaño");
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
