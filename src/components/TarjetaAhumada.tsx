import { cadenasInfo } from "@/data/demo";
import type { EstadoFuenteAhumada } from "@/lib/cadenas";
import { TarjetaCadenaPublicada } from "@/components/TarjetaCadenaPublicada";

/**
 * Tarjeta existente de Farmacias Ahumada dentro de «Grandes tiendas». Presenta solo lo publicado:
 * no calcula precios, no completa campos ausentes y no agrega comparaciones ni rankings.
 */
export function TarjetaAhumada({ estado }: { estado: EstadoFuenteAhumada }) {
  const info = cadenasInfo.ahumada;

  return (
    <TarjetaCadenaPublicada
      nombre={info.nombre}
      logo={info.logo}
      logoClassName="h-12 min-w-0 max-w-[180px] object-contain object-left sm:h-14 sm:max-w-[200px]"
      estado={estado}
    />
  );
}
