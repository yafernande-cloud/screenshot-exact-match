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
  suppliers: [],
  items: [],
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
