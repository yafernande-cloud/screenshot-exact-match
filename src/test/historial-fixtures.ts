import type { InformeCotizacion, ResumenCotizacion } from "@/lib/cotizacion-api";

/** Fixtures compartidas por las pruebas del historial y del PDF del historial. */
export const cotizacionFinalizada: ResumenCotizacion = {
  quote_id: "q-9",
  title: null,
  status: "closed",
  version: 4,
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T11:00:00Z",
  report_number: 1,
  report_label: "COT-000001",
  finalized_at: "2026-11-11T11:00:00Z",
  finalized_by: "u-1",
  supplier_count: 2,
  line_count: 5,
  distinct_product_count: 3,
  quantity_totals: [
    { unit: "box", quantity: "6" },
    { unit: "unit", quantity: "2" },
  ],
};

const producto = {
  name: "Ibuprofeno 400 mg",
  laboratory: "ASCEND",
  brand: null,
  presentation: "Caja de 20 comprimidos",
  code: "IBU-400",
};

export const informeFinalizado: InformeCotizacion = {
  schema_version: 1,
  quote_id: "q-9",
  title: null,
  number: 1,
  label: "COT-000001",
  finalized_at: "2026-11-11T11:00:00Z",
  finalized_by: "u-1",
  currency: "CLP",
  suppliers: [
    { supplier_id: "s-1", supplier_name: "Proveedor Uno", line_count: 1, subtotal: null },
    { supplier_id: "s-2", supplier_name: "Proveedor Dos", line_count: 1, subtotal: null },
  ],
  items: [
    {
      line_id: "l-1",
      supplier_id: "s-1",
      supplier_name: "Proveedor Uno",
      product: producto,
      trade_item_id: "t-1",
      quantity: { value: "2", unit: "box" },
      unit_price: null,
      subtotal: null,
      price_state: "pending",
      causes: [],
      demand_allocations: [],
    },
    {
      line_id: "l-2",
      supplier_id: "s-2",
      supplier_name: "Proveedor Dos",
      product: producto,
      trade_item_id: "t-1",
      quantity: { value: "1", unit: "box" },
      unit_price: null,
      subtotal: null,
      price_state: "pending",
      causes: [],
      demand_allocations: [],
    },
  ],
  total: { amount: "8000.00", currency: "CLP" },
  warnings: [],
  release: { released: [], pending: [] },
  note: null,
};

export const informeRecuperado = {
  quote_id: "q-9",
  report_number: 1,
  report_label: "COT-000001",
  finalized_at: "2026-11-11T11:00:00Z",
  finalized_by: "u-1",
  report: informeFinalizado,
};
