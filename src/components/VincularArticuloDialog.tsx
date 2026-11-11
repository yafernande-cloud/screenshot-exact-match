/**
 * Diálogo mínimo para vincular un producto de una fuente en vivo con un artículo del catálogo.
 *
 * No crea artículos ni propone equivalencias por nombre: busca en el catálogo interno, la persona
 * elige un artículo existente y confirma. El vínculo queda auditado en `supplier_product_mapping`
 * y, al guardarse, se abre «Enseñar a la IA» sin repetir el proceso.
 */

import { useEffect, useId, useState } from "react";
import { AlertCircle, Link2, Loader2, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buscarCatalogo, type SearchResult } from "@/lib/catalogo";
import { mensajeDeErrorVinculo, vincularProductoEnVivo } from "@/lib/proveedores-en-vivo";

const CONSULTA_MINIMA = 2;

function mensajeBusqueda(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim() !== "") return message;
  return "No pudimos buscar en el catálogo. Inténtalo otra vez.";
}

export function VincularArticuloDialog({
  abierto,
  onOpenChange,
  sourceId,
  externalId,
  externalName,
  nombreProveedor,
  consultaInicial,
  onVinculado,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  sourceId: string;
  externalId: string;
  externalName: string;
  nombreProveedor: string;
  /** Texto de la búsqueda en vivo, para proponer la primera búsqueda en el catálogo. */
  consultaInicial?: string | null | undefined;
  /** Se llama con el artículo elegido y el nombre visible para continuar con «Enseñar a la IA». */
  onVinculado: (tradeItemId: string, nombreArticulo: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<SearchResult[] | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBusqueda = useId();
  const idDescripcion = useId();

  const buscar = async (consulta: string) => {
    const limpio = consulta.trim();
    if (limpio.length < CONSULTA_MINIMA || buscando) return;
    setBuscando(true);
    setError(null);
    setSeleccion(null);
    try {
      const respuesta = await buscarCatalogo(limpio);
      setResultados(respuesta.results);
    } catch (fallo) {
      setResultados(null);
      setError(mensajeBusqueda(fallo));
    } finally {
      setBuscando(false);
    }
  };

  // Al abrir, se parte de la consulta en vivo y se busca de inmediato: es el nombre que la
  // persona acaba de usar, pero la elección final siempre la hace ella.
  useEffect(() => {
    if (!abierto) return;
    const inicial = (consultaInicial ?? "").trim();
    setTexto(inicial);
    setResultados(null);
    setSeleccion(null);
    setError(null);
    setGuardando(false);
    if (inicial.length >= CONSULTA_MINIMA) void buscar(inicial);
    // `buscar` solo depende de estado local de este diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, consultaInicial]);

  const elegido = resultados?.find((resultado) => resultado.article_id === seleccion) ?? null;
  const puedeConfirmar = Boolean(elegido) && !guardando && !buscando;

  const confirmar = async () => {
    if (!elegido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const vinculo = await vincularProductoEnVivo({
        sourceId,
        externalId,
        externalName,
        tradeItemId: elegido.article_id,
      });
      onVinculado(vinculo.trade_item_id, elegido.display_name);
      onOpenChange(false);
    } catch (fallo) {
      setError(mensajeDeErrorVinculo(fallo));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(ahora) => {
        if (guardando) return;
        onOpenChange(ahora);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular con el catálogo interno</DialogTitle>
          <DialogDescription id={idDescripcion}>
            «{externalName}» de {nombreProveedor} (código {externalId}) todavía no está vinculado a
            un artículo del catálogo. Elige el artículo existente al que corresponde. No se creará
            ninguno nuevo ni se buscará por parecido de nombres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={idBusqueda}>Buscar artículo en el catálogo</Label>
          <div className="flex gap-2">
            <Input
              id={idBusqueda}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  void buscar(texto);
                }
              }}
              placeholder="Nombre o principio activo del artículo"
              disabled={guardando}
            />
            <button
              type="button"
              onClick={() => void buscar(texto)}
              disabled={texto.trim().length < CONSULTA_MINIMA || buscando || guardando}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buscando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Search className="h-3.5 w-3.5" aria-hidden />
              )}
              Buscar
            </button>
          </div>
        </div>

        {buscando && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando en el catálogo…
          </p>
        )}

        {resultados !== null && !buscando && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Artículos encontrados</legend>
            {resultados.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No encontramos artículos con ese texto. Prueba con otro nombre o principio activo.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {resultados.map((resultado) => (
                  <label
                    key={resultado.article_id}
                    className="flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted/40 has-[:checked]:border-brand-blue/50 has-[:checked]:bg-brand-blue/5"
                  >
                    <input
                      type="radio"
                      name={`articulo-${idBusqueda}`}
                      value={resultado.article_id}
                      checked={seleccion === resultado.article_id}
                      onChange={() => setSeleccion(resultado.article_id)}
                      disabled={guardando}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{resultado.display_name}</span>
                      {resultado.identity_summary && (
                        <span className="block text-xs text-muted-foreground">
                          {resultado.identity_summary}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        {elegido && (
          <div className="space-y-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Confirma el vínculo antes de guardarlo</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Producto externo</dt>
                <dd>{externalName}</dd>
                <dd>
                  {nombreProveedor} · código {externalId}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Artículo interno</dt>
                <dd>{elegido.display_name}</dd>
                {elegido.identity_summary && <dd>{elegido.identity_summary}</dd>}
              </div>
            </dl>
            <p>
              Se guarda un vínculo explícito y auditado; se reutiliza en las próximas búsquedas.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            onClick={() => onOpenChange(false)}
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={!puedeConfirmar}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Vincular y enseñar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
