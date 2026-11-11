/**
 * Tarjeta de una publicación del catálogo sin precio comercial vigente.
 *
 * El producto existe en el portal pero no se puede cotizar. Se muestra con la misma estructura
 * que una oferta —imagen, nombre, laboratorio y código, disponibilidad y acción— y el precio de
 * lista queda rotulado como referencial para que nunca se lea como un precio vigente.
 */

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { EnsenarALaIaEnVivo } from "@/components/EnsenarALaIaEnVivo";
import { formatearDinero } from "@/lib/catalogo";
import type { ProductoPublicadoEnVivo } from "@/lib/proveedores-en-vivo";

/** Disponibilidad con el mismo vocabulario en toda la pantalla. */
function textoDisponibilidad(estado: ProductoPublicadoEnVivo["stock_status"]): string {
  if (estado === "in_stock") return "Con stock";
  if (estado === "out_of_stock") return "Sin stock";
  return "Stock no informado";
}

function urlPublicada(valor: string | null): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function FichaProductoPublicadoEnVivo({
  producto,
  proveedor,
  onAgregar,
  sourceId,
  supplierId,
  consulta,
}: {
  producto: ProductoPublicadoEnVivo;
  proveedor: string;
  /** Acción real del carrito. Sin ella el botón nunca se habilita, aunque el backend autorice. */
  onAgregar?: ((producto: ProductoPublicadoEnVivo) => void) | undefined;
  /** Fuente de la que salió la publicación; sin ella no se puede vincular ni enseñar. */
  sourceId?: string | undefined;
  supplierId?: string | null | undefined;
  /** Consulta que originó el resultado, para proponerla al vincular. */
  consulta?: string | null | undefined;
}) {
  const [imagenFallida, setImagenFallida] = useState(false);
  const imagen = urlPublicada(producto.image_url);
  const laboratorio = producto.laboratory?.trim() || "Laboratorio no informado";
  const referencia = producto.reference_price ? formatearDinero(producto.reference_price) : null;
  const puedeAgregar = producto.cart_eligible && Boolean(onAgregar);

  return (
    <article
      className="@container rounded-2xl border p-4"
      aria-label={`Producto publicado por ${proveedor}: ${producto.name}`}
    >
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          {imagen && !imagenFallida ? (
            <img
              src={imagen}
              alt={`Imagen de ${producto.name} publicada por ${proveedor}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImagenFallida(true)}
              className="h-14 w-14 shrink-0 rounded-xl border object-contain"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-brand-blue"
            >
              {iniciales(proveedor)}
            </div>
          )}
          <div className="min-w-0">
            <h4 className="font-medium">{producto.name}</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {laboratorio} · Código {producto.external_id}
            </p>
            <p className="mt-1 text-sm">{textoDisponibilidad(producto.stock_status)}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          <div>
            <p className="text-lg font-medium">{referencia ?? "Sin precio de lista informado"}</p>
            <p className="text-xs text-muted-foreground">Precio de lista (referencial)</p>
          </div>
          <button
            type="button"
            disabled={!puedeAgregar}
            onClick={() => onAgregar?.(producto)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
          </button>
          {!puedeAgregar && (
            <p className="max-w-xs text-xs text-muted-foreground">
              No disponible para agregar a la cotización.
            </p>
          )}
          {sourceId && (
            <EnsenarALaIaEnVivo
              sourceId={sourceId}
              externalId={producto.external_id}
              externalName={producto.name}
              proveedorId={supplierId}
              nombreProveedor={proveedor}
              tradeItemId={producto.trade_item_id}
              consulta={consulta}
            />
          )}
        </div>
      </div>
    </article>
  );
}
