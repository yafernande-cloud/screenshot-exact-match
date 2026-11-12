/**
 * Ofertas organizadas primero por proveedor (A6 Fase 4).
 *
 * Cada proveedor tiene **una** sección con lo que realmente ofrece: sus fuentes en vivo (API) y,
 * si tiene lista cargada, los precios de la última importación (Excel/CSV), distinguidos dentro de
 * la misma sección. No hay bloques globales de producto, ni tarjetas duplicadas, ni proveedores
 * reordenados por IA: el orden de ofertas dentro de cada fuente lo decide el backend.
 *
 * Se reutilizan las tarjetas existentes; este componente solo compone la presentación.
 */

import { AlertCircle, FileSpreadsheet, Loader2, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BloqueFuente } from "@/components/OfertasProveedorEnVivo";
import { TarjetaPrecioLista } from "@/components/PreciosListasCargadas";
import type { GrupoPreciosLista } from "@/lib/ofertas-listas";
import type { EstadoFuenteEnVivo, ItemEnVivo } from "@/lib/proveedores-en-vivo";
import type { OfertaImportada } from "@/lib/proveedores-api";

interface ProveedorConOfertas {
  clave: string;
  nombre: string;
  estados: EstadoFuenteEnVivo[];
  grupo: GrupoPreciosLista | null;
}

function agruparPorProveedor(
  estados: EstadoFuenteEnVivo[],
  grupos: GrupoPreciosLista[],
): ProveedorConOfertas[] {
  const porClave = new Map<string, ProveedorConOfertas>();
  for (const estado of estados) {
    const clave = estado.fuente.supplierId
      ? `supplier:${estado.fuente.supplierId}`
      : `source:${estado.fuente.sourceId}`;
    const actual = porClave.get(clave);
    if (actual) actual.estados.push(estado);
    else
      porClave.set(clave, {
        clave,
        nombre: estado.fuente.supplierName,
        estados: [estado],
        grupo: null,
      });
  }
  for (const grupo of grupos) {
    const clave = `supplier:${grupo.supplierId}`;
    const actual = porClave.get(clave);
    if (actual) actual.grupo = grupo;
    else porClave.set(clave, { clave, nombre: grupo.supplierName, estados: [], grupo });
  }
  // Orden alfabético determinista del nombre visible; no depende de la IA ni del orden de precios.
  return [...porClave.values()].sort(
    (a, b) => a.nombre.localeCompare(b.nombre, "es") || a.clave.localeCompare(b.clave),
  );
}

export function OfertasPorProveedor({
  estados,
  grupos,
  consulta,
  descubriendo,
  error,
  cargandoListas,
  erroresListas,
  desactualizadas,
  paginasRestantes,
  hayFuentesLista,
  onActualizar,
  onAgregarViva,
  onAgregarLista,
  agregando = null,
}: {
  estados: EstadoFuenteEnVivo[];
  grupos: GrupoPreciosLista[];
  consulta: string | null;
  descubriendo: boolean;
  error: string | null;
  cargandoListas: boolean;
  erroresListas: string[];
  desactualizadas: number;
  paginasRestantes: boolean;
  hayFuentesLista: boolean;
  onActualizar?: ((articuloId: string) => void | Promise<void>) | undefined;
  /** Oferta en vivo elegida por la persona; la IA solo ordena, nunca selecciona. */
  onAgregarViva?: ((item: ItemEnVivo) => void) | undefined;
  /** Precio de una lista cargada: ya tiene su observación inmutable en el servidor. */
  onAgregarLista?: ((oferta: OfertaImportada, proveedorId: string) => void) | undefined;
  /** Clave de la oferta en curso de alta: deshabilita solo ese botón. */
  agregando?: string | null;
}) {
  const proveedores = agruparPorProveedor(estados, grupos);
  const sinNada =
    !descubriendo &&
    !error &&
    proveedores.length === 0 &&
    erroresListas.length === 0 &&
    !hayFuentesLista;
  if (sinNada) return null;

  const listasVacias =
    Boolean(consulta) && !cargandoListas && hayFuentesLista && grupos.length === 0;

  return (
    <section className="mt-4 space-y-4" data-testid="ofertas-por-proveedor">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-4 w-4 text-brand-green" aria-hidden />
        <h3 className="text-sm font-semibold">Proveedores</h3>
        {consulta && <span className="text-xs text-muted-foreground">· {consulta}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Cada proveedor reúne sus precios en vivo y los de su última lista cargada. El orden lo
        decide el servidor según lo que enseñaste; todas las ofertas siguen visibles.
      </p>

      {descubriendo && proveedores.length === 0 && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando proveedores…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {erroresListas.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            {erroresListas.map((mensaje) => (
              <p key={mensaje}>{mensaje}</p>
            ))}
          </div>
        </div>
      )}

      {proveedores.map((proveedor) => (
        <section
          key={proveedor.clave}
          className="rounded-2xl border bg-muted/20 p-4"
          aria-label={`Ofertas de ${proveedor.nombre}`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{proveedor.nombre}</h4>
            {proveedor.estados.length > 0 && <Badge variant="outline">En vivo</Badge>}
            {proveedor.grupo && <Badge variant="outline">Lista cargada</Badge>}
          </div>

          {proveedor.estados.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                En vivo · precios y stock informados por el proveedor ahora
              </p>
              {proveedor.estados.map((estado) => (
                <BloqueFuente
                  key={estado.fuente.sourceId}
                  estado={estado}
                  consulta={consulta}
                  onAgregar={onAgregarViva}
                  onPreferenciaAplicada={onActualizar}
                  titulo={estado.fuente.sourceName}
                />
              ))}
            </div>
          )}

          {proveedor.grupo && (
            <div className={proveedor.estados.length > 0 ? "mt-4 space-y-3" : "space-y-3"}>
              <div className="flex flex-wrap items-baseline gap-2">
                <FileSpreadsheet className="h-4 w-4 text-brand-blue" aria-hidden />
                <p className="text-sm font-medium">Precios de listas cargadas</p>
                <span className="text-xs text-muted-foreground">
                  {proveedor.grupo.sourceNames.join(" · ")} · última importación, no consulta en
                  vivo
                </span>
              </div>
              {proveedor.grupo.ofertas.map((oferta) => (
                <TarjetaPrecioLista
                  key={oferta.offer_id}
                  oferta={oferta}
                  proveedor={proveedor.nombre}
                  proveedorId={proveedor.grupo?.supplierId ?? ""}
                  onActualizar={onActualizar}
                  onAgregar={
                    onAgregarLista
                      ? () => onAgregarLista(oferta, proveedor.grupo?.supplierId ?? "")
                      : undefined
                  }
                  agregando={agregando === `lista:${oferta.source_id}:${oferta.external_id}`}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {cargandoListas && grupos.length === 0 && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando precios en las listas
          cargadas…
        </p>
      )}

      {listasVacias && (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Ninguna lista cargada tiene un precio para «{consulta}».
        </p>
      )}

      {desactualizadas > 0 && (
        <p className="text-xs text-muted-foreground">
          {desactualizadas}{" "}
          {desactualizadas === 1
            ? "precio coincidente no se muestra porque está desactualizado o fuera de vigencia."
            : "precios coincidentes no se muestran porque están desactualizados o fuera de vigencia."}
        </p>
      )}

      {paginasRestantes && (
        <p className="text-xs text-muted-foreground">
          Se revisaron los primeros resultados del catálogo. Si el producto no aparece, prueba con
          un nombre más específico.
        </p>
      )}
    </section>
  );
}
