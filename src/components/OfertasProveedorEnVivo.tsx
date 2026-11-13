/**
 * Bloque «Proveedores en vivo» de la pantalla principal.
 *
 * Cada fuente tiene su propio estado: una que no responde no oculta ni retrasa a las demás, y una
 * sin conexión configurada nunca se presenta como «sin resultados». Las coincidencias directas se
 * muestran como resultados; las que el proveedor devolvió sin confirmar toda la consulta se
 * muestran aparte, etiquetadas y sin acción de carrito.
 */

import type { ReactNode } from "react";
import { AlertCircle, Loader2, Truck } from "lucide-react";

import type { ResultadoDeAlta } from "@/components/BotonAgregarACotizacion";
import { FichaOfertaEnVivo } from "@/components/FichaOfertaEnVivo";
import { FichaProductoPublicadoEnVivo } from "@/components/FichaProductoPublicadoEnVivo";
import {
  advertenciasVisibles,
  agruparResultados,
  mensajeMotivo,
  type EstadoConector,
  type EstadoFuenteEnVivo,
  type ItemEnVivo,
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

function ListaResultados({
  items,
  fuente,
  consulta,
  onAgregar,
  onPreferenciaAplicada,
}: {
  items: ItemEnVivo[];
  fuente: EstadoFuenteEnVivo["fuente"];
  consulta: string | null;
  onAgregar?: ((item: ItemEnVivo) => ResultadoDeAlta) | undefined;
  onPreferenciaAplicada?: ((articuloId: string) => void | Promise<void>) | undefined;
}) {
  return (
    <div className="mt-3 space-y-3">
      {items.map((item) =>
        item.tipo === "oferta" ? (
          <FichaOfertaEnVivo
            key={`oferta-${item.oferta.external_id}-${item.oferta.name}`}
            oferta={item.oferta}
            proveedor={fuente.supplierName}
            sourceId={fuente.sourceId}
            supplierId={fuente.supplierId}
            onAgregar={onAgregar ? (oferta) => onAgregar({ tipo: "oferta", oferta }) : undefined}
            onPreferenciaAplicada={onPreferenciaAplicada}
          />
        ) : (
          <FichaProductoPublicadoEnVivo
            key={`publicado-${item.producto.external_id}-${item.producto.name}`}
            producto={item.producto}
            proveedor={fuente.supplierName}
            sourceId={fuente.sourceId}
            supplierId={fuente.supplierId}
            onAgregar={
              onAgregar ? (producto) => onAgregar({ tipo: "publicado", producto }) : undefined
            }
          />
        ),
      )}
    </div>
  );
}

export function BloqueFuente({
  estado,
  consulta,
  onAgregar,
  onPreferenciaAplicada,
  onReintentar,
  titulo,
}: {
  estado: EstadoFuenteEnVivo;
  consulta: string | null;
  onAgregar?: ((item: ItemEnVivo) => ResultadoDeAlta) | undefined;
  onPreferenciaAplicada?: ((articuloId: string) => void | Promise<void>) | undefined;
  /** Vuelve a consultar esta fuente con la misma búsqueda. */
  onReintentar?: (() => void) | undefined;
  /** Dentro de una sección de proveedor se muestra el nombre de la fuente, no el del proveedor. */
  titulo?: string | undefined;
}) {
  const { fuente, resultado, cargando, error } = estado;
  const estadoConexion = resultado?.state ?? fuente.state;
  const motivo = resultado?.reason ?? fuente.reason;
  const ultimaConexion = fechaHora(fuente.lastSuccessAt);
  const advertencias = resultado ? advertenciasVisibles(resultado.warnings) : [];
  const agrupados = resultado ? agruparResultados(resultado) : { directas: [], relacionadas: [] };
  const directas = agrupados.directas;
  const relacionadas = agrupados.relacionadas;
  const consultaAmpliada = resultado?.relaxed_query ?? null;
  const hayResultados = directas.length > 0 || relacionadas.length > 0;
  // Cuatro estados distintos, sin confundir una respuesta vacía o ilegible con un fallo:
  // sin conexión (no se intentó), consulta fallida (se intentó y no se pudo leer) y sin
  // coincidencias (el proveedor respondió bien y no tiene nada para esta búsqueda).
  const sinConexion = !fuente.consultable || estadoConexion === "not_configured";
  const falloConsulta = Boolean(error) || Boolean(fuente.error) || estadoConexion === "error";
  // Una revisión pendiente sin ofertas legibles (estructura cambiada o mapeo ilegible) no es
  // «sin resultados»: se avisa y se permite reintentar. Con ofertas que sí validaron, se muestran
  // igual y la revisión queda como advertencia, nunca como bloqueo de la consulta en vivo.
  const revisionSinDatos =
    !hayResultados && !falloConsulta && estadoConexion === "requires_intervention";
  const errorConsulta = falloConsulta || revisionSinDatos;

  return (
    <div className="rounded-2xl border p-4" data-source-id={fuente.sourceId}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">{titulo ?? fuente.supplierName}</h4>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${ESTILO_ESTADO[estadoConexion]}`}
        >
          {ETIQUETA_ESTADO[estadoConexion]}
        </span>
        {ultimaConexion && (
          <span className="text-xs text-muted-foreground">· última respuesta {ultimaConexion}</span>
        )}
      </div>

      {cargando && <Cargando>Consultando a {fuente.supplierName}…</Cargando>}

      {!cargando && errorConsulta && (
        <Aviso>
          No pudimos consultar a {fuente.supplierName}.{" "}
          {error ?? fuente.error ?? mensajeMotivo(motivo, estadoConexion)}
          {onReintentar && fuente.consultable && (
            <button
              type="button"
              onClick={onReintentar}
              className="ml-2 shrink-0 font-medium underline underline-offset-2"
            >
              Reintentar
            </button>
          )}
        </Aviso>
      )}

      {!cargando && !errorConsulta && sinConexion && (
        <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No disponible · {mensajeMotivo(motivo, estadoConexion)}
        </p>
      )}

      {!cargando && !errorConsulta && !sinConexion && !resultado && (
        <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Sin resultados para esta búsqueda.
        </p>
      )}

      {!cargando && !errorConsulta && !sinConexion && resultado && (
        <>
          {estadoConexion === "requires_intervention" && hayResultados && (
            <p
              role="status"
              className="mt-2 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              Se muestran las ofertas y publicaciones que sí validaron; la conexión queda en
              revisión.
            </p>
          )}

          {advertencias.length > 0 && (
            <p
              role="status"
              className="mt-2 rounded-2xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              {advertencias.join(" ")}
            </p>
          )}

          {consultaAmpliada && (
            <p className="mt-2 text-xs text-muted-foreground">
              Se amplió la búsqueda a «{consultaAmpliada}» para encontrar candidatos. Las
              coincidencias se confirman con la búsqueda original.
            </p>
          )}

          {!hayResultados && estadoConexion === "connected" && (
            <p className="mt-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              Sin resultados para esta búsqueda.
            </p>
          )}

          {directas.length > 0 && (
            <ListaResultados
              items={directas}
              fuente={fuente}
              consulta={consulta}
              onAgregar={onAgregar}
              onPreferenciaAplicada={onPreferenciaAplicada}
            />
          )}

          {relacionadas.length > 0 && (
            <div className="mt-5 space-y-3">
              <div>
                <h5 className="text-sm font-semibold">Resultados relacionados</h5>
                <p className="text-xs text-muted-foreground">
                  El proveedor los devolvió, pero su nombre no confirma toda la búsqueda. Se
                  muestran aparte de las coincidencias.
                </p>
              </div>
              {/* La acción se entrega también aquí: la elegibilidad la decide el backend con
                  `cart_eligible` y cada tarjeta muestra el motivo cuando está bloqueada. */}
              <ListaResultados
                items={relacionadas}
                fuente={fuente}
                consulta={consulta}
                onAgregar={onAgregar}
                onPreferenciaAplicada={onPreferenciaAplicada}
              />
            </div>
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
  onAgregar,
  onPreferenciaAplicada,
  onReintentar,
}: {
  estados: EstadoFuenteEnVivo[];
  consulta: string | null;
  descubriendo: boolean;
  error: string | null;
  /**
   * Acción real de agregar al carrito. Mientras no exista, «Agregar a cotización» queda deshabilitado
   * aunque el backend marque el producto como elegible.
   */
  onAgregar?: ((item: ItemEnVivo) => ResultadoDeAlta) | undefined;
  onPreferenciaAplicada?: ((articuloId: string) => void | Promise<void>) | undefined;
  /** Repite la consulta en una fuente cuyo intento falló. */
  onReintentar?: ((fuente: EstadoFuenteEnVivo["fuente"]) => void) | undefined;
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
        Precios y disponibilidad informados por el proveedor en el momento de la consulta.
      </p>

      {descubriendo && estados.length === 0 && <Cargando>Consultando proveedores…</Cargando>}
      {error && <Aviso>{error}</Aviso>}
      {estados.map((estado) => (
        <BloqueFuente
          key={estado.fuente.sourceId}
          estado={estado}
          consulta={consulta}
          onAgregar={onAgregar}
          onPreferenciaAplicada={onPreferenciaAplicada}
          onReintentar={onReintentar ? () => onReintentar(estado.fuente) : undefined}
        />
      ))}
    </div>
  );
}
