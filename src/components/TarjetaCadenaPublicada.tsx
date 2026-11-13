import { AlertCircle, ExternalLink, Loader2, Wifi, WifiOff } from "lucide-react";

import type { ChainResult, EstadoFuenteCadena } from "@/lib/cadenas";
import { formatearDinero } from "@/lib/catalogo";

const CAMPOS_VACIOS = ["Producto", "Laboratorio", "Presentación", "Descripción", "Disponibilidad"];

/** Distintivo compacto del estado de la fuente; nunca presenta una fuente caída como conectada. */
function EstadoConexion({ estado }: { estado: EstadoFuenteCadena }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs";
  if (estado.tipo === "cargando") {
    return (
      <span className={`${base} text-muted-foreground`}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Buscando…
      </span>
    );
  }
  if (estado.tipo === "error") {
    return (
      <span className={`${base} text-destructive`}>
        <AlertCircle className="h-3 w-3" aria-hidden /> Error
      </span>
    );
  }
  if (estado.tipo === "vacia") {
    return (
      <span className={`${base} text-muted-foreground`}>
        <WifiOff className="h-3 w-3" aria-hidden /> Sin resultados
      </span>
    );
  }
  if (estado.tipo === "resultados") {
    return (
      <span className={`${base} text-muted-foreground`}>
        <Wifi className="h-3 w-3" aria-hidden /> Conectada
      </span>
    );
  }
  return (
    <span className={`${base} text-muted-foreground`}>
      <WifiOff className="h-3 w-3" aria-hidden /> Sin conexión
    </span>
  );
}

function SinConexion({ mensaje }: { mensaje: string | null }) {
  return (
    <>
      <div className="flex gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted px-1 text-center text-[10px] text-muted-foreground">
          Sin imagen
        </div>
        <dl className="min-w-0 space-y-0.5 text-xs">
          {CAMPOS_VACIOS.map((campo) => (
            <div key={campo}>
              <span className="text-muted-foreground">{campo}: </span>
              <span className="text-muted-foreground">—</span>
            </div>
          ))}
        </dl>
      </div>
      {mensaje && (
        <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          {mensaje}
        </p>
      )}
      <div className="mt-auto flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Precio publicado</p>
          <p className="text-xl font-semibold text-muted-foreground">—</p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-60"
        >
          Ver publicación <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </>
  );
}

function Precios({ resultado }: { resultado: ChainResult }) {
  const normal = formatearDinero(resultado.price.normal);
  const promocional = formatearDinero(resultado.price.promotional);
  const fraccionado = formatearDinero(resultado.price.fractional);
  const unidad = resultado.price.fractional?.per_unit ?? null;
  const principal = promocional ?? normal;

  return (
    <div className="mt-1">
      {principal ? (
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {promocional && (
            <span className="rounded-full bg-brand-green/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-green">
              Oferta
            </span>
          )}
          <span className="text-base font-semibold">{principal}</span>
          {promocional && normal && promocional !== normal && (
            <span className="text-[11px] text-muted-foreground">
              Normal <span className="line-through">{normal}</span>
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Precio no informado</p>
      )}
      {fraccionado && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {fraccionado}
          {unidad ? ` por ${unidad}` : " fraccionado"}
        </p>
      )}
    </div>
  );
}

/** Texto de disponibilidad: solo repite el booleano publicado, sin inferir stock. */
function disponibilidad(hasStock: boolean | null | undefined): string {
  if (hasStock === true) return "disponible";
  if (hasStock === false) return "sin stock";
  return "no informada";
}

/**
 * Distintivo de relación con la consulta. Cruz Verde informa `query_relation` (`partial` es la
 * misma dosis con otra presentación y `alternative` es otra concentración). Ahumada declara
 * `match.level = "related"` cuando el nombre publicado no confirma la búsqueda entera: tanto si
 * no comparte ningún término (`query_not_confirmed_by_name`) como si solo coincide en parte
 * (`partial_query_match`). Ambas se rotulan «Coincidencia no confirmada»: se muestra aparte,
 * nunca como coincidencia. Sin ese dato no se muestra nada, así las demás cadenas siguen igual.
 */
function RelacionConsulta({ resultado }: { resultado: ChainResult }) {
  const relacion = resultado.match["query_relation"];
  if (relacion === "partial" || relacion === "alternative") {
    const texto = relacion === "partial" ? "Otra presentación" : "Alternativa";
    const detalle =
      relacion === "partial"
        ? "Coincide con el producto pedido, pero la presentación publicada es distinta."
        : "La publicación declara otra concentración; se muestra como alternativa.";
    return (
      <span
        title={detalle}
        className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
      >
        {texto}
      </span>
    );
  }
  const causas = Array.isArray(resultado.match["causes"]) ? resultado.match["causes"] : [];
  // Ahumada nombra dos grados de no confirmación; otras causas (o su ausencia) no se rotulan.
  const noConfirmada =
    causas.includes("query_not_confirmed_by_name") || causas.includes("partial_query_match");
  if (resultado.match["level"] !== "related" || !noConfirmada) {
    return null;
  }
  return (
    <span
      title="Se publica para esta búsqueda, pero su nombre no confirma la consulta."
      className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
    >
      Coincidencia no confirmada
    </span>
  );
}

function Resultado({
  resultado,
  mostrarMarca,
  mostrarDisponibilidad,
}: {
  resultado: ChainResult;
  mostrarMarca: boolean;
  mostrarDisponibilidad: boolean;
}) {
  return (
    <div className="flex gap-3">
      {resultado.image_url ? (
        <img
          src={resultado.image_url}
          alt={resultado.published_name}
          loading="lazy"
          decoding="async"
          className="h-16 w-16 shrink-0 rounded-xl border bg-white object-contain p-1"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted px-1 text-center text-[10px] text-muted-foreground">
          Sin imagen
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-1.5">
          <p
            className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug"
            title={resultado.published_name}
          >
            {resultado.published_name}
          </p>
          <RelacionConsulta resultado={resultado} />
        </div>
        {mostrarMarca && (
          <p
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={resultado.brand_as_published ?? undefined}
          >
            Marca: {resultado.brand_as_published ?? "no informada"}
          </p>
        )}
        <p
          className="mt-0.5 truncate text-[11px] text-muted-foreground"
          title={resultado.laboratory_as_published ?? undefined}
        >
          {resultado.laboratory_as_published ?? "Laboratorio no informado"}
        </p>
        <p
          className="truncate text-[11px] text-muted-foreground"
          title={resultado.presentation_as_published ?? undefined}
        >
          {resultado.presentation_as_published ?? "Presentación no informada"}
        </p>

        <Precios resultado={resultado} />

        {mostrarDisponibilidad && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Disponibilidad: {disponibilidad(resultado.has_stock)}
          </p>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {resultado.conditions ? (
            <span
              className="min-w-0 truncate text-[11px] text-muted-foreground"
              title={resultado.conditions}
            >
              {resultado.conditions}
            </span>
          ) : (
            <span />
          )}
          {resultado.source_url ? (
            <a
              href={resultado.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver publicación de ${resultado.published_name}`}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] text-brand-blue hover:underline"
            >
              Ver publicación <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              Enlace no disponible
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta de una cadena dentro de «Grandes tiendas». Presenta solo lo publicado: no calcula
 * precios, no completa campos ausentes y no agrega comparaciones ni rankings. El contenido de los
 * resultados vive en una región con scroll interno para no alterar el tamaño de la tarjeta.
 */
export function TarjetaCadenaPublicada({
  nombre,
  logo,
  logoClassName,
  estado,
  mostrarMarca = false,
  mostrarDisponibilidad = false,
}: {
  nombre: string;
  logo: string;
  logoClassName: string;
  estado: EstadoFuenteCadena;
  mostrarMarca?: boolean;
  mostrarDisponibilidad?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <img src={logo} alt={`Logo ${nombre}`} className={logoClassName} />
        <EstadoConexion estado={estado} />
      </div>

      {(estado.tipo === "inicial" || estado.tipo === "no_configurada") && (
        <SinConexion mensaje={estado.tipo === "no_configurada" ? estado.mensaje : null} />
      )}

      {estado.tipo === "cargando" && (
        <p
          role="status"
          className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando en {nombre}…
        </p>
      )}

      {estado.tipo === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {estado.mensaje}
        </p>
      )}

      {estado.tipo === "vacia" && (
        <p className="flex min-h-32 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
          {estado.mensaje}
        </p>
      )}

      {estado.tipo === "resultados" && (
        <div className="flex min-h-0 flex-col gap-2">
          {estado.desactualizado && (
            <p className="text-[11px] text-muted-foreground">
              Los datos publicados pueden estar desactualizados.
            </p>
          )}
          <div
            role="region"
            aria-label={`Publicaciones de ${nombre} (${estado.resultados.length})`}
            tabIndex={0}
            className="max-h-60 overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ul className="divide-y">
              {estado.resultados.map((resultado) => (
                <li key={resultado.chain_item_id} className="py-3 first:pt-0 last:pb-0">
                  <Resultado
                    resultado={resultado}
                    mostrarMarca={mostrarMarca}
                    mostrarDisponibilidad={mostrarDisponibilidad}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
