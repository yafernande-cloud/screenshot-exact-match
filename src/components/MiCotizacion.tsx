/**
 * Carrito activo integrado en «Cotizador» (E10).
 *
 * Las líneas viven en el servidor: este componente solo presenta el detalle que devuelve el
 * backend y delega cada acción (cantidad, quitar, vaciar, finalizar). No calcula precios con
 * reglas propias: usa los subtotales que el servidor puede verificar y declara pendiente lo que no.
 */

import { useState } from "react";
import { ShoppingCart, ChevronDown, Minus, Plus, Trash2, Clock, Loader2 } from "lucide-react";

import { formatearDinero } from "@/lib/catalogo";
import {
  carritosConLineas,
  subtotalDeCarrito,
  totalesDeCotizacion,
  type CarritoCotizacion,
  type DetalleCotizacion,
  type LineaCotizacion,
} from "@/lib/cotizacion-api";

export interface AccionesCotizacion {
  onCantidad: (linea: LineaCotizacion, cantidad: number) => void;
  onQuitar: (linea: LineaCotizacion) => void;
  onVaciar: (carrito: CarritoCotizacion) => void;
  onFinalizar: () => void;
  /** Líneas con una operación en curso: sus controles se bloquean mientras tanto. */
  ocupadas: Set<string>;
  finalizando: boolean;
}

const iniciales = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

const nombreProducto = (linea: LineaCotizacion) =>
  linea.product.name?.trim() || `Código ${linea.product.code}`;

/** Motivo legible de un subtotal pendiente; el precio jamás se completa por suposición. */
function motivoPendiente(linea: LineaCotizacion): string {
  const causas = [...linea.causes, ...linea.warnings].filter(Boolean);
  if (causas.length > 0) return causas.join(" · ");
  if (!linea.unit_price) return "Sin precio informado por el proveedor";
  return "Condiciones comerciales pendientes";
}

export function SeccionCotizaciones({
  detalle,
  acciones,
}: {
  detalle: DetalleCotizacion | null;
  acciones: AccionesCotizacion;
}) {
  const grupos = carritosConLineas(detalle);
  const r = totalesDeCotizacion(detalle);
  const [cerrados, setCerrados] = useState<string[]>([]);
  const [vaciar, setVaciar] = useState<CarritoCotizacion | null>(null);
  // Quitar una línea es irreversible en el carrito: se confirma con el nombre real del producto.
  const [porQuitar, setPorQuitar] = useState<{
    linea: LineaCotizacion;
    proveedor: string;
  } | null>(null);

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        <ShoppingCart className="h-8 w-8" />
        Tu carrito está vacío. Busca un producto y usa «Agregar a cotización» en una oferta de
        proveedor.
      </div>
    );
  }

  return (
    <>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map((carrito) => {
          const abierto = !cerrados.includes(carrito.cart_id);
          const sub = subtotalDeCarrito(carrito);
          const activas = carrito.lines.filter((linea) => linea.status === "active");
          const nombre = carrito.supplier_name ?? "Proveedor sin nombre";
          return (
            <div key={carrito.cart_id} className="rounded-2xl border bg-card">
              <button
                onClick={() =>
                  setCerrados(
                    abierto
                      ? [...cerrados, carrito.cart_id]
                      : cerrados.filter((c) => c !== carrito.cart_id),
                  )
                }
                className="flex w-full items-center gap-3 p-4 text-left"
                aria-expanded={abierto}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue">
                  {iniciales(nombre)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {activas.length} {activas.length === 1 ? "producto" : "productos"} ·{" "}
                    {sub !== null ? (
                      <span className="font-medium text-brand-green">
                        {formatearDinero({ amount: sub.toFixed(2), currency: "CLP" })}
                      </span>
                    ) : (
                      "Subtotal pendiente"
                    )}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`}
                />
              </button>
              {abierto && (
                <div className="border-t">
                  <ul className="divide-y">
                    {activas.map((linea) => (
                      <LineaItem
                        key={linea.line_id}
                        linea={linea}
                        proveedor={nombre}
                        acciones={acciones}
                        onQuitar={() => setPorQuitar({ linea, proveedor: nombre })}
                      />
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                    <button
                      onClick={() => setVaciar(carrito)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Vaciar carrito
                    </button>
                    {sub !== null ? (
                      <span>
                        Subtotal:{" "}
                        <span className="font-semibold text-brand-green">
                          {formatearDinero({ amount: sub.toFixed(2), currency: "CLP" })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Subtotal pendiente</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
        <div>
          {r.total !== null ? (
            <span className="font-semibold">
              Total general:{" "}
              <span className="text-brand-green">
                {formatearDinero({ amount: r.total.toFixed(2), currency: "CLP" })}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Total general pendiente: {r.pendientes}{" "}
              {r.pendientes === 1
                ? "línea no tiene un subtotal completo."
                : "líneas no tienen un subtotal completo."}{" "}
              {r.confirmado > 0 && (
                <>
                  Suma de subtotales completos:{" "}
                  <span className="font-medium">
                    {formatearDinero({ amount: r.confirmado.toFixed(2), currency: "CLP" })}
                  </span>
                  .
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button
            onClick={acciones.onFinalizar}
            disabled={acciones.finalizando || r.lineas === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-green/90 disabled:opacity-60"
          >
            {acciones.finalizando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Generar informe y finalizar
          </button>
          <p className="max-w-sm text-xs text-muted-foreground">
            Finalizar guarda el informe con los precios elegidos y libera los faltantes que quedaron
            cubiertos. No registra una compra.
          </p>
        </div>
      </div>

      {porQuitar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Confirmar quitar ${nombreProducto(porQuitar.linea)}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-soft">
            <h3 className="font-semibold">
              ¿Quitar «{nombreProducto(porQuitar.linea)}» de la cotización?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se quitará del carrito de {porQuitar.proveedor}. Las demás líneas, sus cantidades y
              precios no cambian, y los faltantes no se liberan hasta finalizar el informe.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPorQuitar(null)}
                className="rounded-full border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const linea = porQuitar.linea;
                  setPorQuitar(null);
                  acciones.onQuitar(linea);
                }}
                disabled={acciones.ocupadas.has(porQuitar.linea.line_id)}
                className="rounded-full bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-60"
              >
                Sí, quitar producto
              </button>
            </div>
          </div>
        </div>
      )}

      {vaciar && (
        <div
          role="dialog"
          aria-label={`Confirmar vaciado de ${vaciar.supplier_name ?? "proveedor"}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-soft">
            <h3 className="font-semibold">
              ¿Vaciar el carrito de {vaciar.supplier_name ?? "este proveedor"}?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se quitarán sus productos de la cotización. Los demás proveedores no cambian y cada
              línea conserva su historial.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setVaciar(null)}
                className="rounded-full border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  acciones.onVaciar(vaciar);
                  setVaciar(null);
                }}
                className="rounded-full bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground"
              >
                Vaciar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LineaItem({
  linea,
  proveedor,
  acciones,
  onQuitar,
}: {
  linea: LineaCotizacion;
  proveedor: string;
  acciones: AccionesCotizacion;
  onQuitar: () => void;
}) {
  const ocupada = acciones.ocupadas.has(linea.line_id);
  const cantidad = Number.parseInt(linea.quantity.value, 10) || 1;
  const subtotal = linea.subtotal ? formatearDinero(linea.subtotal) : null;
  const unitario = linea.unit_price ? formatearDinero(linea.unit_price) : null;
  const nombre = nombreProducto(linea);
  const detalles = [linea.product.laboratory, linea.product.presentation]
    .filter((valor): valor is string => Boolean(valor && valor.trim() !== ""))
    .join(" · ");

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{nombre}</p>
          <p className="text-xs text-muted-foreground">
            {unitario ? `${unitario} c/u` : "Sin precio informado"}
            {detalles && ` · ${detalles}`} · Código {linea.product.code}
          </p>
          {linea.demand_allocations.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Asociado a {linea.demand_allocations.length}{" "}
              {linea.demand_allocations.length === 1 ? "faltante" : "faltantes"} reportados.
            </p>
          )}
        </div>
        <button
          onClick={onQuitar}
          disabled={ocupada}
          aria-label={`Quitar ${nombre} de ${proveedor}`}
          className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center rounded-full border">
          <button
            aria-label="Disminuir"
            disabled={ocupada || cantidad <= 1}
            onClick={() => acciones.onCantidad(linea, cantidad - 1)}
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="number"
            min={1}
            value={cantidad}
            aria-label="Cantidad"
            disabled={ocupada}
            onChange={(evento) =>
              acciones.onCantidad(linea, Number.parseInt(evento.target.value, 10) || 1)
            }
            className="w-10 bg-transparent text-center text-xs font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            aria-label="Aumentar"
            disabled={ocupada}
            onClick={() => acciones.onCantidad(linea, cantidad + 1)}
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <span className="text-xs">
          {subtotal ? (
            <span className="font-medium">{subtotal}</span>
          ) : (
            <span className="text-muted-foreground">Subtotal pendiente</span>
          )}
        </span>
      </div>
      {!linea.subtotal && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          {motivoPendiente(linea)}
        </p>
      )}
      {linea.unit_price && !linea.unit_price.basis && (
        // El proveedor publicó un precio sin declarar si es por unidad comercial o por unidad
        // base. El subtotal lo usa igual, pero no se presenta la base como confirmada.
        <p className="text-xs text-muted-foreground">Base del precio no confirmada</p>
      )}
    </li>
  );
}
