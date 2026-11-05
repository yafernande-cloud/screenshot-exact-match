import { cadenasInfo } from "@/data/demo";
import type { EstadoFuenteSalcobrand } from "@/lib/cadenas";
import { TarjetaCadenaPublicada } from "@/components/TarjetaCadenaPublicada";

/**
 * Tarjeta de Salcobrand dentro de «Grandes farmacias». Usa la misma estructura y el mismo scroll
 * interno que la tarjeta de Ahumada, pero muestra la marca comercial como un campo aparte del
 * laboratorio: el backend de Salcobrand no publica laboratorio y no se completa por conjetura.
 */
export function TarjetaSalcobrand({ estado }: { estado: EstadoFuenteSalcobrand }) {
  const info = cadenasInfo.salcobrand;

  return (
    <TarjetaCadenaPublicada
      nombre="Farmacias Salcobrand"
      logo={info.logo}
      logoClassName="h-16 min-w-0 max-w-[240px] object-contain object-left sm:h-20 sm:max-w-[280px]"
      estado={estado}
      mostrarMarca
      mostrarDisponibilidad
    />
  );
}
