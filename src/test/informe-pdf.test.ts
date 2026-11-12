import { describe, expect, it } from "vitest";

import { formatearDinero } from "@/lib/catalogo";
import type { InformeCotizacion, ItemInforme } from "@/lib/cotizacion-api";
import {
  agruparLineasPorProveedor,
  cantidadInforme,
  construirInformePdf,
  filaInforme,
  generarInformePdf,
  nombreArchivoInforme,
} from "@/lib/informe-pdf";

const item = (datos: Partial<ItemInforme> & Pick<ItemInforme, "line_id">): ItemInforme => ({
  supplier_id: "s-1",
  supplier_name: "FarmaLoop",
  trade_item_id: "t-1",
  product: {
    name: "Salonpas x 10 Parches Dérmicos",
    laboratory: "Salonpas",
    brand: null,
    presentation: "Caja de 10 parches",
    code: "107581",
  },
  quantity: { value: "3", unit: null },
  unit_price: { amount: "2990.00", currency: "CLP" },
  subtotal: { amount: "8970.00", currency: "CLP" },
  price_state: "current",
  causes: [],
  demand_allocations: [{ demand_item_id: "d-1", quantity: "3" }],
  ...datos,
});

const informe: InformeCotizacion = {
  schema_version: 1,
  quote_id: "q-1",
  title: "Reposición de noviembre",
  number: 1,
  label: "COT-000001",
  finalized_at: "2026-11-11T15:00:00Z",
  finalized_by: "u-1",
  currency: "CLP",
  suppliers: [
    {
      supplier_id: "s-1",
      supplier_name: "FarmaLoop",
      line_count: 2,
      subtotal: { amount: "11960.00", currency: "CLP" },
    },
    {
      supplier_id: "s-2",
      supplier_name: "Proveedor Dos",
      line_count: 1,
      subtotal: { amount: "5100.00", currency: "CLP" },
    },
  ],
  items: [
    item({ line_id: "l-1" }),
    item({
      line_id: "l-2",
      quantity: { value: "1", unit: "box" },
      unit_price: { amount: "2990.00", currency: "CLP" },
      subtotal: { amount: "2990.00", currency: "CLP" },
      product: {
        name: "Ibuprofeno 400 mg",
        laboratory: "ASCEND",
        brand: null,
        presentation: "Caja de 20 comprimidos",
        code: "IBU-400",
      },
    }),
    item({
      line_id: "l-3",
      supplier_id: "s-2",
      supplier_name: "Proveedor Dos",
      quantity: { value: "3", unit: "box" },
      unit_price: { amount: "1700.00", currency: "CLP" },
      subtotal: { amount: "5100.00", currency: "CLP" },
      product: {
        name: "Paracetamol 500 mg",
        laboratory: "LAB DOS",
        brand: null,
        presentation: "Caja de 100 comprimidos",
        code: "PAR-500",
      },
    }),
  ],
  total: { amount: "17060.00", currency: "CLP" },
  warnings: ["Precio revisado al momento de finalizar"],
  release: {
    released: [{ demand_item_id: "d-1", quantity: "3", quantity_unit: "unit" }],
    pending: [
      {
        demand_item_id: "d-2",
        reason: "coverage_incomplete",
        allocated_quantity: "1",
        target_quantity: "5",
      },
    ],
  },
  note: "El total suma los precios publicados de las ofertas elegidas; no incluye flete ni impuestos que la fuente no haya informado.",
};

describe("PDF del informe de cotización", () => {
  it("agrupa por proveedor conservando el orden y los subtotales originales", () => {
    const grupos = agruparLineasPorProveedor(informe);

    expect(grupos.map((grupo) => grupo.supplier.supplier_name)).toEqual([
      "FarmaLoop",
      "Proveedor Dos",
    ]);
    expect(grupos[0]!.items.map((linea) => linea.line_id)).toEqual(["l-1", "l-2"]);
    expect(grupos[1]!.items.map((linea) => linea.line_id)).toEqual(["l-3"]);
    expect(grupos[0]!.supplier.subtotal).toEqual({
      amount: "11960.00",
      currency: "CLP",
    });
  });

  it("muestra solo la cifra cuando la unidad comercial es NULL", () => {
    expect(cantidadInforme(informe.items[0]!)).toBe("3");
    expect(cantidadInforme(informe.items[0]!)).not.toContain("sin unidad");
  });

  it("muestra la unidad cuando está informada", () => {
    expect(cantidadInforme(informe.items[1]!)).toBe("1 caja");
    expect(cantidadInforme(informe.items[2]!)).toBe("3 cajas");
  });

  it("conserva los importes congelados sin recalcularlos", () => {
    const fila = filaInforme(informe.items[0]!);

    expect(fila[0]).toContain("Salonpas x 10 Parches Dérmicos");
    expect(fila[0]).toContain("Salonpas");
    expect(fila[0]).toContain("Caja de 10 parches");
    expect(fila[0]).toContain("Código 107581");
    expect(fila[1]).toBe("FarmaLoop");
    expect(fila[3]).toBe(formatearDinero(informe.items[0]!.unit_price));
    expect(fila[4]).toBe(formatearDinero(informe.items[0]!.subtotal));
  });

  it("no modifica el informe recibido al construir el documento", () => {
    const antes = structuredClone(informe);

    construirInformePdf(informe);

    expect(informe).toEqual(antes);
  });

  it("genera un PDF A4", () => {
    const documento = construirInformePdf(informe);
    const archivo = generarInformePdf(informe);
    const bytes = new Uint8Array(documento.output("arraybuffer"));

    expect(documento.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(documento.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    expect(archivo.type).toBe("application/pdf");
    expect(archivo.size).toBeGreaterThan(0);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  it("pagina el documento cuando hay muchos productos", () => {
    const muchos = Array.from({ length: 35 }, (_, indice) =>
      item({
        line_id: `l-extra-${indice}`,
        product: {
          name: `Producto con nombre largo para paginar ${indice}`,
          laboratory: "Laboratorio de prueba",
          brand: null,
          presentation: "Caja de 20 comprimidos",
          code: `COD-${indice}`,
        },
      }),
    );
    const documento = construirInformePdf({ ...informe, items: muchos });

    expect(documento.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("usa un nombre de archivo estable y seguro", () => {
    expect(nombreArchivoInforme(informe)).toBe("Informe-COT-000001.pdf");
  });
});
