import { cadenasInfo } from "@/data/demo";
import type { EstadoFuenteCruzVerde } from "@/lib/cadenas";
import { TarjetaCadenaPublicada } from "@/components/TarjetaCadenaPublicada";

/**
 * Tarjeta de Cruz Verde dentro de «Grandes farmacias». Usa la misma estructura, tamaño y scroll
 * interno que las otras cadenas. Muestra la marca publicada, pero no informa disponibilidad: el
 * stock está fuera del alcance del conector.
 */
export function TarjetaCruzVerde({ estado }: { estado: EstadoFuenteCruzVerde }) {
  const info = cadenasInfo.cruzverde;

  return (
    <TarjetaCadenaPublicada
      nombre="Cruz Verde"
      logo={info.logo}
      logoClassName="h-16 min-w-0 max-w-[240px] object-contain object-left sm:h-20 sm:max-w-[280px]"
      estado={estado}
      mostrarMarca
    />
  );
}
