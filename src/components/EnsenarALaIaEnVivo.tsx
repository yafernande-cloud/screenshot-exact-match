/**
 * «Enseñar a la IA» desde una oferta en vivo.
 *
 * La persona ya eligió el producto al buscar: no se le pide vincular, confirmar ni elegir un
 * artículo otra vez. El botón abre directamente el comentario libre y envía, junto con el texto,
 * el contexto comercial real de la oferta (fuente, SKU, nombre, laboratorio, presentación, precio,
 * stock y EAN). El backend resuelve la identidad interna con evidencia verificable —vínculo
 * explícito, EAN único o una identidad técnica propia del SKU— y aplica la preferencia.
 *
 * Si la oferta todavía no tiene artículo canónico, el aprendizaje queda en una identidad técnica
 * `inactive` que no aparece en el catálogo; al vincularla más adelante, lo aprendido se reubica en
 * el artículo canónico sin repetir la enseñanza.
 */

import { EnsenarALaIa } from "@/components/EnsenarALaIa";
import type { ContextoOferta } from "@/lib/observaciones-api";

export function EnsenarALaIaEnVivo({
  sourceId,
  externalId,
  externalName,
  laboratory,
  brand,
  presentation,
  price,
  priceBasis,
  saleUnit,
  stockStatus,
  stockQuantity,
  stockUnit,
  imageUrl,
  productUrl,
  ean,
  proveedorId,
  nombreProveedor,
  tradeItemId,
  onPreferenciaAplicada,
}: {
  sourceId: string;
  externalId: string;
  externalName: string;
  laboratory?: string | null | undefined;
  brand?: string | null | undefined;
  presentation?: string | null | undefined;
  price?: { amount: string; currency: string } | null | undefined;
  priceBasis?: string | null | undefined;
  saleUnit?: string | null | undefined;
  stockStatus?: string | null | undefined;
  stockQuantity?: string | null | undefined;
  stockUnit?: string | null | undefined;
  imageUrl?: string | null | undefined;
  productUrl?: string | null | undefined;
  ean?: string | null | undefined;
  proveedorId?: string | null | undefined;
  nombreProveedor: string;
  /** Artículo ya resuelto por la búsqueda; puede ser una identidad técnica o `null`. */
  tradeItemId: string | null;
  /** Refresca las ofertas del artículo que el backend resolvió después de enseñar. */
  onPreferenciaAplicada?: ((articuloId: string) => void | Promise<void>) | undefined;
}) {
  const ofertaContexto: ContextoOferta = {
    source_id: sourceId,
    external_id: externalId,
    name: externalName,
    supplier_id: proveedorId ?? null,
    laboratory: laboratory ?? null,
    brand: brand ?? null,
    presentation: presentation ?? null,
    price: price ?? null,
    price_basis: priceBasis ?? null,
    sale_unit: saleUnit ?? null,
    stock_status: stockStatus ?? null,
    stock_quantity: stockQuantity ?? null,
    stock_unit: stockUnit ?? null,
    ean: ean ?? null,
    product_url: productUrl ?? null,
    image_url: imageUrl ?? null,
  };

  return (
    <EnsenarALaIa
      articuloId={tradeItemId}
      ofertaContexto={ofertaContexto}
      proveedorId={proveedorId}
      nombreArticulo={externalName}
      nombreProveedor={nombreProveedor}
      onPreferenciaAplicada={onPreferenciaAplicada}
    />
  );
}
