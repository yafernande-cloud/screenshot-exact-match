/**
 * «Enseñar a la IA» para un producto obtenido en vivo de cualquier proveedor.
 *
 * Si el backend ya resolvió el artículo interno (`trade_item_id`), se reutiliza el formulario de
 * siempre con identificadores reales. Si no lo resolvió, el botón sigue disponible: abre un
 * diálogo para vincular el producto con un artículo existente del catálogo y, al confirmarlo,
 * continúa con «Enseñar a la IA» sin pedir el paso dos veces.
 *
 * No hay condiciones por proveedor, ni asociación por nombres, ni identificadores inventados.
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { EnsenarALaIa, ESTILO_BOTON } from "@/components/EnsenarALaIa";
import { VincularArticuloDialog } from "@/components/VincularArticuloDialog";

export function EnsenarALaIaEnVivo({
  sourceId,
  externalId,
  externalName,
  proveedorId,
  nombreProveedor,
  tradeItemId,
  consulta,
}: {
  sourceId: string;
  externalId: string;
  externalName: string;
  proveedorId?: string | null | undefined;
  nombreProveedor: string;
  /** Artículo interno ya vinculado; `null` si el backend no encontró un vínculo exacto. */
  tradeItemId: string | null;
  consulta?: string | null | undefined;
}) {
  const [articuloId, setArticuloId] = useState<string | null>(tradeItemId);
  const [nombreArticulo, setNombreArticulo] = useState(externalName);
  const [vinculadoAhora, setVinculadoAhora] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  // Si una búsqueda posterior ya trae el vínculo resuelto, se usa el identificador del backend.
  useEffect(() => {
    if (tradeItemId && tradeItemId !== articuloId) {
      setArticuloId(tradeItemId);
      setNombreArticulo(externalName);
    }
  }, [tradeItemId, externalName, articuloId]);

  if (articuloId) {
    return (
      <EnsenarALaIa
        articuloId={articuloId}
        proveedorId={proveedorId}
        nombreArticulo={nombreArticulo}
        nombreProveedor={nombreProveedor}
        abrirInicial={vinculadoAhora}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className={ESTILO_BOTON}
        title="Primero vincula este producto con un artículo del catálogo"
        onClick={() => setDialogoAbierto(true)}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Enseñar a la IA
      </button>
      <VincularArticuloDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        sourceId={sourceId}
        externalId={externalId}
        externalName={externalName}
        nombreProveedor={nombreProveedor}
        consultaInicial={consulta}
        onVinculado={(id, nombre) => {
          setArticuloId(id);
          setNombreArticulo(nombre);
          setVinculadoAhora(true);
        }}
      />
    </>
  );
}
