/**
 * Botón «Agregar a cotización» con reacción visual al presionarlo.
 *
 * Es presentación pura: no decide elegibilidad ni llama a la API. Mientras la acción está en
 * curso muestra «Agregando…» y queda deshabilitado; cuando la acción confirma el alta muestra
 * «Agregado» durante un segundo y vuelve a su estado normal. Si la acción responde `false` o
 * falla, el botón se restaura y el error lo informa quien ejecutó la acción (su notificación
 * existente no cambia).
 *
 * La escala del pulsado y el giro del indicador se desactivan con `prefers-reduced-motion`.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ShoppingCart } from "lucide-react";

/** Una acción puede informar el resultado (`false` = no se agregó) o solo completarse. */
export type ResultadoDeAlta = void | boolean | Promise<void | boolean>;

const ESPERA_CONFIRMACION_MS = 1000;

type Estado = "libre" | "enviando" | "listo";

export function BotonAgregarACotizacion({
  disponible,
  onAgregar,
  agregando = false,
}: {
  /** Elegibilidad ya decidida: sin acción real o sin permiso del backend nunca se habilita. */
  disponible: boolean;
  onAgregar?: (() => ResultadoDeAlta) | undefined;
  /** La pantalla ya sabe que esta oferta tiene una solicitud en curso. */
  agregando?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>("libre");
  const enVuelo = useRef(false);
  const montado = useRef(true);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    };
  }, []);

  const habilitado = disponible && Boolean(onAgregar);
  const enviando = estado === "enviando" || agregando;
  const listo = estado === "listo";

  async function alPresionar() {
    // Un doble clic no repite la solicitud: el botón queda deshabilitado y un ref lo protege
    // incluso si el evento alcanza a dispararse dos veces antes de repintar.
    if (!habilitado || enVuelo.current || estado !== "libre") return;
    enVuelo.current = true;
    setEstado("enviando");
    try {
      const resultado = await onAgregar?.();
      if (!montado.current) return;
      if (resultado === false) {
        // Ya se informó el error: se restaura sin mostrar una confirmación falsa.
        setEstado("libre");
        enVuelo.current = false;
        return;
      }
      setEstado("listo");
      temporizador.current = setTimeout(() => {
        if (montado.current) {
          setEstado("libre");
          enVuelo.current = false;
        }
      }, ESPERA_CONFIRMACION_MS);
    } catch {
      if (montado.current) {
        setEstado("libre");
        enVuelo.current = false;
      }
    }
  }

  return (
    <button
      type="button"
      disabled={!habilitado || enviando}
      aria-busy={enviando || undefined}
      aria-disabled={listo || undefined}
      onClick={() => void alPresionar()}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform duration-100 ease-out enabled:active:scale-[0.98] hover:enabled:bg-brand-green/90 disabled:opacity-60 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
    >
      {enviando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : listo ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
      )}
      <span aria-live="polite">
        {enviando ? "Agregando…" : listo ? "Agregado" : "Agregar a cotización"}
      </span>
    </button>
  );
}
