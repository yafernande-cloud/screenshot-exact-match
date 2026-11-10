/**
 * Tarjeta de una oferta obtenida en vivo de un proveedor.
 *
 * Muestra solo lo que la persona necesita para comparar: imagen, nombre, laboratorio y código,
 * precio vigente, disponibilidad y la acción de agregar. El resto de los datos comerciales
 * (unidad de venta, base del precio, motivos de bloqueo) se conserva en el contrato y se usa para
 * decidir si la acción está habilitada, pero no se escribe en la tarjeta.
 *
 * No se inventan stock, descuentos ni condiciones: un dato ausente se informa como tal.
 */

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { formatearDinero } from "@/lib/catalogo";
import type { OfertaEnVivo } from "@/lib/proveedores-en-vivo";

/** Disponibilidad con el mismo vocabulario en toda la pantalla. */
function textoDisponibilidad(estado: OfertaEnVivo["stock_status"]): string {
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

export function FichaOfertaEnVivo({
  oferta,
  proveedor,
  onAgregar,
}: {
  oferta: OfertaEnVivo;
  proveedor: string;
  /** Acción real del carrito. Sin ella el botón nunca se habilita, aunque el backend autorice. */
  onAgregar?: ((oferta: OfertaEnVivo) => void) | undefined;
}) {
  const [imagenFallida, setImagenFallida] = useState(false);
  const imagen = urlPublicada(oferta.image_url);
  const laboratorio = oferta.laboratory?.trim() || "Laboratorio no informado";
  const puedeAgregar = oferta.cart_eligible && Boolean(onAgregar);

  return (
    <article
      className="@container rounded-2xl border p-4"
      aria-label={`Oferta de ${proveedor}: ${oferta.name}`}
    >
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          {imagen && !imagenFallida ? (
            <img
              src={imagen}
              alt={`Imagen de ${oferta.name} publicada por ${proveedor}`}
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
            <h4 className="font-medium">{oferta.name}</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {laboratorio} · Código {oferta.external_id}
            </p>
            <p className="mt-1 text-sm">{textoDisponibilidad(oferta.stock_status)}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          <div>
            <p className="text-2xl font-semibold text-brand-green">
              {formatearDinero(oferta.price)}
            </p>
            <p className="text-xs text-muted-foreground">Precio</p>
          </div>
          <button
            type="button"
            disabled={!puedeAgregar}
            onClick={() => onAgregar?.(oferta)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
          </button>
          {!puedeAgregar && (
            <p className="max-w-xs text-xs text-muted-foreground">
              No disponible para agregar a la cotización.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
