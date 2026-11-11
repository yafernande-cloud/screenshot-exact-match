/**
 * Precios de listas cargadas (Excel/CSV) en la pantalla de búsqueda.
 *
 * Es una sección separada de «Proveedores en vivo»: estos precios no se consultaron al proveedor
 * ahora, son la última observación guardada de su archivo. Una oferta `needs_review` se muestra con
 * su advertencia y nunca como verificada. No se agrega al carrito local: la cotización conserva sus
 * validaciones actuales.
 */

import { AlertCircle, FileSpreadsheet, ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EnsenarALaIa } from "@/components/EnsenarALaIa";
import { describirCantidad, formatearDinero } from "@/lib/catalogo";
import {
  etiquetaBasePrecio,
  etiquetaEstadoRevision,
  etiquetaUnidad,
  type OfertaImportada,
} from "@/lib/proveedores-api";
import type { GrupoPreciosLista } from "@/lib/ofertas-listas";

function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "fecha no informada" : fecha.toLocaleDateString("es-CL");
}

function presentacion(oferta: OfertaImportada): string {
  const unidad = etiquetaUnidad(oferta.sale_unit);
  if (!oferta.pack_units_per_commercial_unit) return unidad;
  const base = etiquetaUnidad(oferta.pack_base_unit);
  return `${unidad} · ${oferta.pack_units_per_commercial_unit} ${base.toLowerCase()} por unidad`;
}

function stock(oferta: OfertaImportada): string {
  if (oferta.stock_status !== "known") return "Stock no informado";
  // El backend serializa `Numeric(12,3)` como «120.000»: no son 120 mil, son 120 unidades.
  // Se muestra la cifra en formato local y con la unidad en plural cuando corresponde.
  return describirCantidad(oferta.stock_quantity, oferta.stock_unit) ?? "Stock informado";
}

function precio(oferta: OfertaImportada): string {
  return (
    formatearDinero({ amount: oferta.price_amount, currency: oferta.currency }) ??
    `${oferta.price_amount} ${oferta.currency}`
  );
}

type EstadoIdentidad = "published" | "extracted" | "unconfirmed";

/**
 * Estado de identificación de la oferta (D-150). `published` viene de una columna propia,
 * `extracted` se reconoció en la descripción con una marca explícita y un nombre confirmado, y
 * `unconfirmed` no tiene identidad. Respuestas antiguas sin el campo se deducen de los valores.
 */
function estadoIdentidad(oferta: OfertaImportada): EstadoIdentidad {
  if (
    oferta.identity_status === "published" ||
    oferta.identity_status === "extracted" ||
    oferta.identity_status === "unconfirmed"
  ) {
    return oferta.identity_status;
  }
  return oferta.laboratory_as_published || oferta.brand_as_published ? "published" : "unconfirmed";
}

/** Identidad de la lista, sin inventar la que falta ni presentarla como completa. */
function identidad(oferta: OfertaImportada): string {
  const partes = [
    oferta.laboratory_as_published ? `Laboratorio: ${oferta.laboratory_as_published}` : null,
    oferta.brand_as_published ? `Marca: ${oferta.brand_as_published}` : null,
  ].filter((parte): parte is string => parte !== null);
  if (partes.length === 0) return "Laboratorio y marca pendientes de identificación";
  if (estadoIdentidad(oferta) === "extracted") {
    return `${partes.join(" · ")} (reconocido en la descripción, pendiente de confirmación)`;
  }
  return partes.join(" · ");
}

function EtiquetaIdentidad({ oferta }: { oferta: OfertaImportada }) {
  const estado = estadoIdentidad(oferta);
  if (estado === "published") return null;
  // La falta de identidad informativa se muestra como dato pendiente, sin alarma: el laboratorio y
  // la marca son información de la lista, no una condición comercial del proveedor (D-151).
  return (
    <Badge variant="outline">
      {estado === "extracted"
        ? "Identidad extraída de la descripción"
        : "Laboratorio y marca no informados"}
    </Badge>
  );
}

export function TarjetaPrecioLista({
  oferta,
  proveedor,
  proveedorId,
  onActualizar,
}: {
  oferta: OfertaImportada;
  proveedor: string;
  proveedorId: string;
  onActualizar?: ((articuloId: string) => void | Promise<void>) | undefined;
}) {
  const pendiente = oferta.review_status === "needs_review";
  return (
    <article
      className="@container rounded-2xl border bg-background p-4"
      aria-label={`Precio de lista de ${proveedor}: ${oferta.trade_item_name}`}
    >
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="min-w-0">
          <h4 className="font-medium">{oferta.trade_item_name}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Código {oferta.external_id} · {presentacion(oferta)} · {stock(oferta)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {etiquetaBasePrecio(oferta.price_basis)} · Observado el {fechaCorta(oferta.observed_at)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{identidad(oferta)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Una condición comercial no es un error: se informa sin badge destructivo (D-151). */}
            <Badge variant={pendiente ? "secondary" : "outline"}>
              {etiquetaEstadoRevision(oferta.review_status)}
            </Badge>
            <EtiquetaIdentidad oferta={oferta} />
            <span className="text-xs text-muted-foreground">{oferta.source_name}</span>
          </div>
        </div>

        {/* Misma disposición que las ofertas en vivo: precio arriba y las acciones debajo, a la
            derecha; en pantallas angostas la columna pasa debajo de los datos del producto. */}
        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          <div>
            <p className="text-2xl font-semibold text-brand-green">{precio(oferta)}</p>
            <p className="text-xs text-muted-foreground">Precio de lista</p>
          </div>
          <button
            type="button"
            disabled
            title="Disponible próximamente"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
          </button>
          <p className="max-w-xs text-xs text-muted-foreground">
            Se incorporará a la cotización cuando el carrito esté conectado.
          </p>
          <EnsenarALaIa
            articuloId={oferta.trade_item_id}
            ofertaId={oferta.offer_id}
            proveedorId={proveedorId}
            nombreArticulo={oferta.trade_item_name}
            nombreProveedor={proveedor}
            sinLaboratorio={estadoIdentidad(oferta) === "unconfirmed"}
            onPreferenciaAplicada={
              onActualizar ? () => onActualizar(oferta.trade_item_id) : undefined
            }
          />
        </div>
      </div>

      {pendiente && (
        <div
          role="note"
          className="mt-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <p>
            El proveedor informó estas condiciones comerciales. El precio se guardó, pero no se
            presenta como verificado.
          </p>
          {oferta.notes && <p className="mt-1">«{oferta.notes}»</p>}
        </div>
      )}
    </article>
  );
}

export function PreciosListasCargadas({
  grupos,
  consulta,
  cargando,
  errores,
  desactualizadas,
  paginasRestantes,
  hayFuentes,
  onActualizar,
}: {
  grupos: GrupoPreciosLista[];
  consulta: string | null;
  cargando: boolean;
  errores: string[];
  desactualizadas: number;
  paginasRestantes: boolean;
  hayFuentes: boolean;
  onActualizar?: ((articuloId: string) => void | Promise<void>) | undefined;
}) {
  // Sin proveedores de lista no hay nada que mostrar; un fallo al descubrirlos sí se informa.
  if (!consulta) return null;
  if (!hayFuentes && errores.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="precios-listas-cargadas">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-brand-blue" aria-hidden />
        <h2 id="precios-listas-cargadas" className="text-lg font-semibold">
          Precios de listas cargadas
        </h2>
        <Badge variant="outline">Excel / CSV</Badge>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Son precios de la última lista importada de cada proveedor, no consultas en vivo. Cada
        oferta indica la fecha en que se observó y las condiciones comerciales que informó el
        proveedor.
      </p>

      {cargando && grupos.length === 0 && (
        <p
          role="status"
          className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground"
        >
          Buscando precios en las listas cargadas…
        </p>
      )}

      {errores.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            {errores.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        </div>
      )}

      {!cargando && grupos.length === 0 && errores.length === 0 && (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Ninguna lista cargada tiene un precio para «{consulta}».
        </p>
      )}

      <div className="space-y-5">
        {grupos.map((grupo) => (
          <div key={grupo.supplierId} className="rounded-2xl border bg-muted/20 p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <h3 className="font-semibold">{grupo.supplierName}</h3>
              <span className="text-xs text-muted-foreground">
                {grupo.sourceNames.join(" · ")} · {grupo.ofertas.length}{" "}
                {grupo.ofertas.length === 1 ? "precio" : "precios"}
              </span>
            </div>
            <div className="space-y-3">
              {grupo.ofertas.map((oferta) => (
                <TarjetaPrecioLista
                  key={oferta.offer_id}
                  oferta={oferta}
                  proveedor={grupo.supplierName}
                  proveedorId={grupo.supplierId}
                  onActualizar={onActualizar}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {desactualizadas > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {desactualizadas}{" "}
          {desactualizadas === 1
            ? "precio coincidente no se muestra porque está desactualizado o fuera de vigencia."
            : "precios coincidentes no se muestran porque están desactualizados o fuera de vigencia."}
        </p>
      )}

      {paginasRestantes && (
        <p className="mt-2 text-xs text-muted-foreground">
          Se revisaron los primeros resultados del catálogo. Si el producto no aparece, prueba con
          un nombre más específico.
        </p>
      )}
    </section>
  );
}
