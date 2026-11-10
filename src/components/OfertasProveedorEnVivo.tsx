/**
 * Bloque «Proveedores en vivo» de la pantalla principal.
 *
 * Cada fuente tiene su propio estado: una que no responde no oculta ni retrasa a las demás, y una
 * sin conexión configurada nunca se presenta como «sin resultados». Las coincidencias directas se
 * separan de los resultados relacionados porque el nombre publicado no confirma la consulta.
 */

import type { ReactNode } from "react";
import { AlertCircle, Loader2, Truck } from "lucide-react";

import { FichaOfertaEnVivo } from "@/components/FichaOfertaEnVivo";
import {
  agruparOfertas,
  mensajeMotivo,
  type EstadoConector,
  type EstadoFuenteEnVivo,
  type ResultadoEnVivo,
} from "@/lib/proveedores-en-vivo";

const ETIQUETA_ESTADO: Record<EstadoConector, string> = {
  connected: "Conectado",
  not_configured: "Sin conexión",
  error: "Error de conexión",
  requires_intervention: "Requiere revisión",
};

const ESTILO_ESTADO: Record<EstadoConector, string> = {
  connected: "border-brand-green/40 text-brand-green",
  not_configured: "border-muted-foreground/30 text-muted-foreground",
  error: "border-destructive/40 text-destructive",
  requires_intervention: "border-amber-500/50 text-amber-700",
};

function fechaHora(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Cargando({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-2 flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {children}
    </p>
  );
}

function GrupoOfertas({
  titulo,
  descripcion,
  ofertas,
  proveedor,
}: {
  titulo: string;
  descripcion?: string;
  ofertas: ResultadoEnVivo["offers"];
  proveedor: string;
}) {
  if (ofertas.length === 0) return null;
  return (
    <div className="mt-4">
      <h5 className="text-sm font-semibold">
        {titulo} <span className="text-muted-foreground">({ofertas.length})</span>
      </h5>
      {descripcion && <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>}
      <div className="mt-3 space-y-3">
        {ofertas.map((oferta) => (
          <FichaOfertaEnVivo
            key={`${oferta.external_id}-${oferta.name}`}
            oferta={oferta}
            proveedor={proveedor}
          />
        ))}
      </div>
    </div>
  );
}

function BloqueFuente({
  estado,
  consulta,
}: {
  estado: EstadoFuenteEnVivo;
  consulta: string | null;
}) {
  const { fuente, resultado, cargando, error } = estado;
  const estadoConexion = resultado?.state ?? fuente.state;
  const motivo = resultado?.reason ?? fuente.reason;
  const ultimaConexion = fechaHora(fuente.lastSuccessAt);
  const consultaVisible = consulta?.trim() || resultado?.query || "";

  return (
    <div className="rounded-2xl border p-4" data-source-id={fuente.sourceId}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">{fuente.supplierName}</h4>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${ESTILO_ESTADO[estadoConexion]}`}
        >
          {ETIQUETA_ESTADO[estadoConexion]}
        </span>
        <span className="text-xs text-muted-foreground">{fuente.sourceName}</span>
        {ultimaConexion && (
          <span className="text-xs text-muted-foreground">· última respuesta {ultimaConexion}</span>
        )}
      </div>

      {cargando && <Cargando>Consultando a {fuente.supplierName}…</Cargando>}

      {!cargando && error && <Aviso>{error}</Aviso>}
      {!cargando && !error && fuente.error && <Aviso>{fuente.error}</Aviso>}

      {!cargando && !error && !fuente.error && !resultado && (
        <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {mensajeMotivo(motivo, estadoConexion)}
        </p>
      )}

      {!cargando && !error && resultado && (
        <>
          {resultado.warnings.length > 0 && (
            <p
              role="status"
              className="mt-2 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              {resultado.warnings.join(" ")}
            </p>
          )}

          {estadoConexion === "not_configured" && (
            <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {mensajeMotivo(motivo, estadoConexion)}
            </p>
          )}
          {(estadoConexion === "error" || estadoConexion === "requires_intervention") && (
            <Aviso>{mensajeMotivo(motivo, estadoConexion)}</Aviso>
          )}

          {estadoConexion === "connected" && resultado.offers.length === 0 && (
            <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {fuente.supplierName} respondió
              {consultaVisible ? ` y no devolvió ofertas para «${consultaVisible}»` : ""}.
            </p>
          )}

          {resultado.offers.length > 0 &&
            (() => {
              const { directas, relacionadas } = agruparOfertas(resultado.offers);
              return (
                <>
                  <GrupoOfertas
                    titulo="Coincidencias directas"
                    ofertas={directas}
                    proveedor={fuente.supplierName}
                  />
                  <GrupoOfertas
                    titulo="Resultados relacionados"
                    descripcion={
                      directas.length === 0
                        ? "No hubo coincidencias directas. Estos resultados no confirman la consulta."
                        : "El nombre publicado no confirma la consulta; no son coincidencias directas."
                    }
                    ofertas={relacionadas}
                    proveedor={fuente.supplierName}
                  />
                </>
              );
            })()}

          {resultado.discarded > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {resultado.discarded}{" "}
              {resultado.discarded === 1
                ? "publicación no se pudo interpretar y no se muestra."
                : "publicaciones no se pudieron interpretar y no se muestran."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function OfertasProveedorEnVivo({
  estados,
  consulta,
  descubriendo,
  error,
}: {
  estados: EstadoFuenteEnVivo[];
  consulta: string | null;
  descubriendo: boolean;
  error: string | null;
}) {
  if (!descubriendo && !error && estados.length === 0) return null;

  return (
    <div className="mt-4 space-y-3" data-testid="proveedores-en-vivo">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-4 w-4 text-brand-green" />
        <h3 className="text-sm font-semibold">Proveedores en vivo</h3>
        {consulta && <span className="text-xs text-muted-foreground">· {consulta}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Consulta directa al proveedor. Se muestra solo lo que el proveedor informa; los campos
        ausentes dicen «No informado». Las ofertas no se guardan en el catálogo.
      </p>

      {descubriendo && estados.length === 0 && <Cargando>Consultando proveedores…</Cargando>}
      {error && <Aviso>{error}</Aviso>}
      {estados.map((estado) => (
        <BloqueFuente key={estado.fuente.sourceId} estado={estado} consulta={consulta} />
      ))}
    </div>
  );
}
