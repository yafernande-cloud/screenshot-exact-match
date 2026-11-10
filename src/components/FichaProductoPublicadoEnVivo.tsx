/**
 * Tarjeta de una publicación del catálogo sin precio comercial vigente.
 *
 * El producto existe en el portal, pero no se puede cotizar: no tiene precio de venta, así que
 * `reference_price` (precio de lista) se muestra **solo** como referencial y nunca con el estilo
 * de un precio vigente. La disponibilidad sale de `stock_status` y no se inventa: un dato ausente
 * queda «No informado». El botón de agregar permanece deshabilitado y los motivos salen de
 * `cart_blockers`.
 */

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { formatearDinero } from "@/lib/catalogo";
import {
  etiquetaBloqueador,
  etiquetaRelacion,
  type ProductoPublicadoEnVivo,
} from "@/lib/proveedores-en-vivo";

/** Texto de disponibilidad: solo lo que el proveedor informó. */
function textoDisponibilidad(producto: ProductoPublicadoEnVivo): string {
  if (producto.stock_status === "out_of_stock") {
    return "Sin stock (informado por el proveedor)";
  }
  if (producto.stock_status === "in_stock") {
    return "Con stock (informado por el proveedor)";
  }
  return "No informado";
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
}: {
  producto: ProductoPublicadoEnVivo;
  proveedor: string;
}) {
  const [imagenFallida, setImagenFallida] = useState(false);
  const referencia = producto.reference_price ? formatearDinero(producto.reference_price) : null;
  const imagen = urlPublicada(producto.image_url);
  const enlace = urlPublicada(producto.product_url);
  const bloqueos = producto.cart_blockers.map(etiquetaBloqueador);

  const datos: Array<[string, string]> = [
    ["Proveedor", proveedor],
    ["Laboratorio", producto.laboratory?.trim() || "No informado"],
    ["Presentación", producto.presentation?.trim() || "No informado"],
    ["Disponibilidad", textoDisponibilidad(producto)],
    ["Código en el proveedor", producto.external_id],
  ];

  return (
    <article
      className="@container rounded-2xl border border-dashed p-4"
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
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium">{producto.name}</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {etiquetaRelacion(producto.match_relation)}
              </span>
              <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-xs text-amber-700">
                Sin precio vigente
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
          <div>
            <p className="text-sm text-muted-foreground">
              Precio de lista referencial:{" "}
              <span className="text-foreground">{referencia ?? "No informado"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Sin precio comercial vigente: no se puede cotizar.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Este producto no tiene precio comercial vigente"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar a cotización
          </button>
          {bloqueos.length > 0 && (
            <p className="max-w-xs text-xs text-muted-foreground">
              No se puede agregar: {bloqueos.join("; ")}.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
