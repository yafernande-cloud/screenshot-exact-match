/**
 * Tarjeta de una oferta obtenida en vivo de un proveedor.
 *
 * Solo muestra lo que el proveedor devolvió: un campo ausente queda «No informado». No se
 * interpreta la presentación como unidad de venta, no se multiplica el precio por cantidades y
 * no se inventan stock, descuentos, despacho ni condiciones de pago.
 *
 * El carrito no se conecta en esta etapa: el botón queda deshabilitado siempre y, cuando
 * `cart_eligible` es falso, muestra los motivos concretos de `cart_blockers`.
 */

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { describirCantidad, etiquetaUnidad, formatearDinero } from "@/lib/catalogo";
import { etiquetaBloqueador, etiquetaRelacion, type OfertaEnVivo } from "@/lib/proveedores-en-vivo";

const BASES_PRECIO: Record<string, string> = {
  per_commercial_unit: "por unidad de venta",
  per_base_unit: "por unidad base",
};

function textoStock(oferta: OfertaEnVivo): string | null {
  if (oferta.stock_status === "in_stock") {
    const cantidad = describirCantidad(oferta.stock_quantity, oferta.stock_unit);
    return cantidad
      ? `Con stock: ${cantidad} (informado por el proveedor)`
      : "Con stock (informado por el proveedor)";
  }
  if (oferta.stock_status === "out_of_stock") {
    return "Sin stock (informado por el proveedor)";
  }
  return null;
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
}: {
  oferta: OfertaEnVivo;
  proveedor: string;
}) {
  const [imagenFallida, setImagenFallida] = useState(false);
  const precio = formatearDinero(oferta.price);
  const stock = textoStock(oferta);
  const unidad = oferta.sale_unit ? etiquetaUnidad(oferta.sale_unit) : null;
  const base = oferta.price_basis ? (BASES_PRECIO[oferta.price_basis] ?? oferta.price_basis) : null;
  const enlace = urlPublicada(oferta.product_url);
  const bloqueos = oferta.cart_blockers.map(etiquetaBloqueador);
  const imagen = urlPublicada(oferta.image_url);

  const datos: Array<[string, string]> = [
    ["Proveedor", proveedor],
    ["Laboratorio", oferta.laboratory?.trim() || "No informado"],
    ["Presentación", oferta.presentation?.trim() || "No informado"],
    ["Stock", stock ?? "No informado"],
    ["Unidad de venta", unidad || "No informado"],
    ["Base del precio", base || "No informado"],
    ["Código en el proveedor", oferta.external_id],
  ];

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
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium">{oferta.name}</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {etiquetaRelacion(oferta.match_relation)}
              </span>
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                Consulta en vivo
              </span>
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm @md:grid-cols-2 @5xl:grid-cols-3">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <span className="text-muted-foreground">{etiqueta}: </span>
                  <span className="text-foreground">{valor}</span>
                </div>
              ))}
            </dl>
            {enlace && (
              <a
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-brand-blue hover:underline"
              >
                Ver publicación del proveedor
              </a>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 border-t pt-3 @2xl:ml-auto @2xl:items-end @2xl:border-t-0 @2xl:pt-0 @2xl:text-right">
          {precio ? (
            <div>
              <p className="text-2xl font-semibold text-brand-green">{precio}</p>
              <p className="text-xs text-muted-foreground">
                {base ? `Precio ${base}` : "Base del precio no informada"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin precio informado</p>
          )}
          <button
            type="button"
            disabled
            title="La integración con el carrito estará disponible próximamente"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
          </button>
          {!oferta.cart_eligible && bloqueos.length > 0 && (
            <p className="max-w-xs text-xs text-muted-foreground">
              No se puede agregar: {bloqueos.join("; ")}.
            </p>
          )}
          {oferta.cart_eligible && (
            <p className="max-w-xs text-xs text-muted-foreground">
              Datos comerciales completos; el carrito se habilitará en una etapa posterior.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
