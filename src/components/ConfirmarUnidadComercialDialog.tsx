/**
 * Confirma la unidad comercial de una oferta que no la declara (FarmaLoop).
 *
 * El Cotizador trabaja con presentaciones completas: cajas, envases, frascos o unidades. La
 * fuente puede omitir la unidad de venta, y el sistema no la supone. Aquí una persona decide cuál
 * corresponde antes de asociar la oferta a un faltante; el backend valida la decisión, la audita
 * y mantiene intacto el dato original de la oferta.
 */

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { etiquetaUnidad } from "@/lib/catalogo";

const UNIDADES = [
  { code: "box", label: "Caja" },
  { code: "package", label: "Envase o paquete" },
  { code: "bottle", label: "Frasco o botella" },
  { code: "unit", label: "Unidad suelta" },
] as const;

export function ConfirmarUnidadComercialDialog({
  abierto,
  nombreOferta,
  unidadFaltante,
  onCancelar,
  onConfirmar,
}: {
  abierto: boolean;
  nombreOferta: string;
  /** Unidad operativa del faltante: `box`, `package` o `bottle`. */
  unidadFaltante: string;
  onCancelar: () => void;
  onConfirmar: (unidad: string) => void;
}) {
  const base = useId();
  const [unidad, setUnidad] = useState("");

  useEffect(() => {
    if (abierto) setUnidad("");
  }, [abierto, nombreOferta]);

  const faltante = etiquetaUnidad(unidadFaltante, "2") || "una unidad sin definir";
  const elegida = unidad ? etiquetaUnidad(unidad, "2") : "";
  const incompatible = unidad !== "" && unidad !== unidadFaltante;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!siguiente) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirma la unidad comercial</DialogTitle>
          <DialogDescription>
            «{nombreOferta}» no informa en qué unidad se vende. Confirma la presentación completa
            que vas a cotizar. No se modifica el dato publicado por el proveedor: la confirmación
            queda registrada y auditada en la línea.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Unidad de venta</legend>
          <RadioGroup
            value={unidad}
            onValueChange={setUnidad}
            aria-label="Unidad de venta de la oferta"
          >
            {UNIDADES.map((opcion) => {
              const id = `${base}-${opcion.code}`;
              return (
                <div key={opcion.code} className="flex items-center gap-3">
                  <RadioGroupItem value={opcion.code} id={id} />
                  <Label htmlFor={id} className="cursor-pointer font-normal">
                    {opcion.label}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            El faltante se mide en {faltante}. Debe coincidir para asociarlo sin suponer una
            equivalencia.
          </p>
        </fieldset>

        {incompatible && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            El faltante se mide en {faltante} y confirmaste {elegida}: no se puede asociar sin
            inventar una equivalencia. Elige la misma unidad o cancela la operación.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!unidad || incompatible}
            onClick={() => onConfirmar(unidad)}
          >
            Agregar y asociar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
