/**
 * «Enseñar a la IA»: la persona administradora escribe un comentario comercial sobre un producto.
 *
 * Flujo mínimo sobre los endpoints ya existentes:
 * 1. guardar la observación (texto original, sin interpretar),
 * 2. pedir su interpretación con OpenAI,
 * 3. mostrar el resultado en palabras: aplicada, pendiente de revisión, sin preferencia o fallo.
 *
 * La preferencia es **del producto exacto** y la aplica el motor determinista del backend al leer
 * las ofertas. Aquí no se reordena nada, no se inventan sujetos y no se muestran JSON, puntuaciones
 * ni datos técnicos. Un comentario nunca se presenta como aprendido si la interpretación falló.
 */

import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldQuestion, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TEXTO_MAXIMO,
  describirPreferencia,
  describirRetiro,
  esIaDeshabilitada,
  guardarObservacion,
  interpretarObservacion,
  mensajeDeErrorObservacion,
  nuevaClaveDeIdempotencia,
  type PreferenciaComercial,
} from "@/lib/observaciones-api";

type Paso = "editar" | "guardando" | "interpretando" | "resultado";

type Resultado =
  | { tipo: "aplicada"; preferencias: PreferenciaComercial[]; retiros: string[] }
  | { tipo: "revision" }
  | { tipo: "sin_preferencia" }
  | { tipo: "deshabilitada" }
  | { tipo: "error"; mensaje: string; guardado: boolean };

export interface EnsenarALaIaProps {
  /** Artículo exacto (`trade_item_id`) al que pertenece la tarjeta. */
  articuloId: string;
  /** Oferta persistida de la que nace la observación; puede no existir. */
  ofertaId?: string | null | undefined;
  /** Proveedor de la oferta; se envía solo si la tarjeta lo conoce. */
  proveedorId?: string | null | undefined;
  nombreArticulo: string;
  nombreProveedor: string;
  /**
   * Las listas importadas (Excel/CSV) no informan laboratorio ni marca: conviene decirlo para no
   * prometer un orden que esos datos no permiten evaluar.
   */
  sinLaboratorio?: boolean;
  /** Se llama cuando quedó una preferencia aplicada, para refrescar las ofertas del artículo. */
  onPreferenciaAplicada?: (() => void | Promise<void>) | undefined;
}

const ESTILO_BOTON =
  "inline-flex items-center gap-1.5 rounded-full border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/5 disabled:cursor-not-allowed disabled:opacity-50";

export function EnsenarALaIa({
  articuloId,
  ofertaId,
  proveedorId,
  nombreArticulo,
  nombreProveedor,
  sinLaboratorio = false,
  onPreferenciaAplicada,
}: EnsenarALaIaProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [paso, setPaso] = useState<Paso>("editar");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [observacionId, setObservacionId] = useState<string | null>(null);
  const claveIdempotencia = useRef<string | null>(null);
  const idComentario = useId();

  const ocupado = paso === "guardando" || paso === "interpretando";
  const puedeEnviar = texto.trim().length > 0 && !ocupado;

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || ocupado) return;

    let id = observacionId;
    if (!id) {
      claveIdempotencia.current ??= nuevaClaveDeIdempotencia();
      setPaso("guardando");
      setResultado(null);
      try {
        const observacion = await guardarObservacion(
          {
            texto: limpio,
            articuloId,
            proveedorId,
            ofertaId,
          },
          claveIdempotencia.current,
        );
        id = observacion.observation_id;
        setObservacionId(id);
      } catch (error) {
        setPaso("resultado");
        setResultado({ tipo: "error", mensaje: mensajeDeErrorObservacion(error), guardado: false });
        return;
      }
    }

    setPaso("interpretando");
    setResultado(null);
    try {
      const salida = await interpretarObservacion(id);
      const estado = salida.observation.interpretation_status;
      const interpretacion = salida.observation.interpretation;
      if (estado === "suggested" || estado === "confirmed") {
        setResultado({
          tipo: "aplicada",
          preferencias: interpretacion?.preferences ?? [],
          retiros: salida.observation.retired_subject_kinds ?? [],
        });
        void onPreferenciaAplicada?.();
      } else if (estado === "needs_review") {
        setResultado({ tipo: "revision" });
      } else if (estado === "no_preference") {
        setResultado({ tipo: "sin_preferencia" });
      } else {
        setResultado({
          tipo: "error",
          mensaje: "El servicio de IA no pudo interpretar el comentario esta vez.",
          guardado: true,
        });
      }
    } catch (error) {
      if (esIaDeshabilitada(error)) {
        setResultado({ tipo: "deshabilitada" });
      } else {
        setResultado({
          tipo: "error",
          mensaje: mensajeDeErrorObservacion(error),
          guardado: true,
        });
      }
    } finally {
      setPaso("resultado");
    }
  };

  const empezarDeNuevo = () => {
    setTexto("");
    setObservacionId(null);
    claveIdempotencia.current = null;
    setResultado(null);
    setPaso("editar");
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abiertoAhora) => {
        if (ocupado) return;
        setAbierto(abiertoAhora);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={ESTILO_BOTON}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Enseñar a la IA
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enseñar a la IA</DialogTitle>
          <DialogDescription>
            Escribe una preferencia comercial sobre {nombreArticulo} en {nombreProveedor}. Se aplica
            solo a este producto, no a los demás de la misma marca o proveedor.
          </DialogDescription>
        </DialogHeader>

        {/* Una interpretación exitosa reemplaza la edición por el resultado; el texto sigue visible. */}
        {(paso === "editar" || ocupado) && (
          <div className="space-y-2">
            <Label htmlFor={idComentario}>Comentario sobre el producto</Label>
            <Textarea
              id={idComentario}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              maxLength={TEXTO_MAXIMO}
              rows={4}
              disabled={ocupado}
              placeholder="Por ejemplo: «Prefiero Laboratorio Chile aunque sea un poco más caro»."
            />
            <p className="text-right text-xs text-muted-foreground">
              {texto.length}/{TEXTO_MAXIMO}
            </p>
            {sinLaboratorio && (
              <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Este proveedor no informa laboratorio ni marca en su lista. Una preferencia de
                proveedor, disponibilidad o precio sí puede ordenar sus ofertas; una de laboratorio
                o marca quedará guardada, pero no cambiará su orden.
              </p>
            )}
          </div>
        )}

        {paso === "guardando" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Guardando el comentario…
          </p>
        )}
        {paso === "interpretando" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Interpretando el comentario…
          </p>
        )}

        {paso === "resultado" && resultado?.tipo === "aplicada" && (
          <ResultadoAplicado
            preferencias={resultado.preferencias}
            retiros={resultado.retiros}
            nombreArticulo={nombreArticulo}
          />
        )}
        {paso === "resultado" && resultado?.tipo === "revision" && (
          <div role="status" className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <ShieldQuestion className="h-4 w-4 text-brand-blue" aria-hidden /> Comentario
              guardado, pendiente de revisión
            </p>
            <p className="text-muted-foreground">
              Guardamos el comentario tal como lo escribiste. La interpretación no es inequívoca,
              así que todavía no cambia el orden de las ofertas.
            </p>
            <Badge variant="outline">Sin efectos por ahora</Badge>
          </div>
        )}
        {paso === "resultado" && resultado?.tipo === "sin_preferencia" && (
          <div role="status" className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-brand-green" aria-hidden /> Comentario guardado
              sin una preferencia aplicable
            </p>
            <p className="text-muted-foreground">
              El comentario quedó registrado, pero no contiene una preferencia comercial que podamos
              aplicar. Las ofertas no cambian.
            </p>
          </div>
        )}
        {paso === "resultado" && resultado?.tipo === "deshabilitada" && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <p className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" aria-hidden /> La interpretación con IA no está
              disponible
            </p>
            <p>
              El comentario quedó guardado. En esta instalación la interpretación con IA está
              deshabilitada, así que todavía no cambia el orden de las ofertas.
            </p>
          </div>
        )}
        {paso === "resultado" && resultado?.tipo === "error" && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <p className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" aria-hidden /> No pudimos interpretar el comentario
            </p>
            <p>{resultado.mensaje}</p>
            {resultado.guardado && (
              <p className="text-xs">
                El comentario original quedó guardado. Reintentar no crea otro ni consume una
                observación nueva.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {paso === "resultado" && resultado?.tipo !== "aplicada" && (
            <button type="button" className={ESTILO_BOTON} onClick={() => void enviar()}>
              Reintentar
            </button>
          )}
          {paso === "resultado" && (
            <button type="button" className={ESTILO_BOTON} onClick={empezarDeNuevo}>
              Escribir otro comentario
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              onClick={() => setAbierto(false)}
              disabled={ocupado}
            >
              Cerrar
            </button>
            {(paso === "editar" || ocupado) && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void enviar()}
                disabled={!puedeEnviar}
              >
                {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Guardar y enseñar
              </button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultadoAplicado({
  preferencias,
  retiros,
  nombreArticulo,
}: {
  preferencias: PreferenciaComercial[];
  retiros: string[];
  nombreArticulo: string;
}) {
  return (
    <div
      role="status"
      className="space-y-2 rounded-xl border border-brand-green/40 bg-brand-green/5 p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-4 w-4 text-brand-green" aria-hidden /> Preferencia guardada y
        aplicada
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {preferencias.map((preferencia) => (
          <li key={preferencia.preference_id}>{describirPreferencia(preferencia)}</li>
        ))}
        {retiros.map((clase) => (
          <li key={clase}>{describirRetiro(clase)}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Se usará al ordenar las ofertas de {nombreArticulo} en las próximas búsquedas. Los precios,
        el stock y las condiciones no cambian.
      </p>
    </div>
  );
}
