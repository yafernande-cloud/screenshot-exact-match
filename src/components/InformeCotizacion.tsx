/**
 * Informe de cotización finalizado.
 *
 * Es la copia congelada que generó el backend al finalizar: número, fecha, productos, cantidades,
 * proveedores, precios, subtotales y total. No se recalcula en el navegador ni se vuelve a
 * consultar a los proveedores; un cambio posterior de precio no modifica lo ya informado.
 */

import { FileText } from "lucide-react";

import { describirCantidad, formatearDinero } from "@/lib/catalogo";
import {
  describirCantidades,
  resumenDeInforme,
  type InformeCotizacion as Informe,
} from "@/lib/cotizacion-api";

function fecha(iso: string | null): string {
  if (!iso) return "fecha no informada";
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime())
    ? "fecha no informada"
    : valor.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

/** Misma traducción que la tabla y el PDF: `box` → «cajas», con el valor guardado intacto. */
function cantidadInforme(valor: string | null, unit: string | null): string {
  return describirCantidad(valor, unit) ?? valor ?? "sin unidad";
}

export function InformeCotizacion({ informe }: { informe: Informe }) {
  const resumen = resumenDeInforme(informe);
  // El informe congelado declara la unidad desconocida entre paréntesis, sin tocar el valor.
  const cantidades = describirCantidades(resumen, "parentesis");
  return (
    <article className="space-y-4" aria-label={`Orden de compra ${informe.label}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-brand-blue" aria-hidden /> Orden de compra{" "}
            {informe.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {informe.title ? `${informe.title} · ` : ""}Generado el {fecha(informe.finalized_at)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {resumen.referencias} {resumen.referencias === 1 ? "referencia" : "referencias"} ·{" "}
            {resumen.productosDistintos}{" "}
            {resumen.productosDistintos === 1 ? "producto distinto" : "productos distintos"}
            {cantidades && ` · ${cantidades}`}
          </p>
        </div>
        <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-medium text-brand-green">
          Finalizada
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 font-medium">Proveedor</th>
              <th className="py-2 pr-3 font-medium">Cantidad</th>
              <th className="py-2 pr-3 font-medium">Precio unitario</th>
              <th className="py-2 font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {informe.items.map((item) => (
              <tr key={item.line_id}>
                <td className="py-2 pr-3">
                  <span className="font-medium">
                    {item.product.name?.trim() || `Código ${item.product.code}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[item.product.laboratory, item.product.presentation]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos publicados"}
                    {" · "}Código {item.product.code}
                  </span>
                </td>
                <td className="py-2 pr-3">{item.supplier_name ?? "Proveedor sin nombre"}</td>
                <td className="py-2 pr-3">
                  {cantidadInforme(item.quantity.value, item.quantity.unit)}
                </td>
                <td className="py-2 pr-3">{formatearDinero(item.unit_price) ?? "Sin precio"}</td>
                <td className="py-2">
                  {formatearDinero(item.subtotal) ?? (
                    <span className="text-xs text-muted-foreground">Pendiente (no incluido)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 rounded-2xl bg-muted px-4 py-3 text-sm">
        {informe.suppliers.map((proveedor) => (
          <div key={proveedor.supplier_id} className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              {proveedor.supplier_name ?? "Proveedor sin nombre"} · {proveedor.line_count}{" "}
              {proveedor.line_count === 1 ? "referencia" : "referencias"}
            </span>
            <span>{formatearDinero(proveedor.subtotal) ?? "Subtotal pendiente"}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
          <span>Total</span>
          <span className="text-brand-green">
            {formatearDinero(informe.total) ?? "No calculable"}
          </span>
        </div>
      </div>

      {informe.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {informe.warnings.map((aviso) => (
            <li key={aviso}>· {aviso}</li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border px-4 py-3 text-xs text-muted-foreground">
        <p>
          Faltantes liberados: {informe.release.released.length}
          {informe.release.released.length > 0 && (
            <>
              {" "}
              (
              {informe.release.released
                .map((r) => cantidadInforme(r.quantity, r.quantity_unit))
                .join(", ")}
              )
            </>
          )}
          . Una vez liberados, la misma persona puede volver a reportarlos por Telegram como un
          faltante independiente; el historial anterior se conserva.
        </p>
        {informe.release.pending.length > 0 && (
          <p className="mt-1">
            Faltantes que aún no se liberan: {informe.release.pending.length} (la cobertura de lo
            cotizado todavía no completa la cantidad pedida).
          </p>
        )}
        {informe.note && <p className="mt-1">{informe.note}</p>}
      </div>
    </article>
  );
}
