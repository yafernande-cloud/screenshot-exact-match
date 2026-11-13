/**
 * Precios de listas cargadas (Excel/CSV) para la pantalla de búsqueda.
 *
 * El backend ya entrega la última observación de cada SKU con su estado de revisión. Este módulo
 * solo la presenta: no inventa precios, no convierte una observación `needs_review` en verificada y
 * no mezcla estas ofertas con las de proveedores en vivo ni con el carrito.
 *
 * Dos reglas evitan duplicados y precios viejos:
 * - una fuente aporta una sola oferta por SKU (la observación más reciente de ese código); dos
 *   códigos distintos del mismo proveedor pueden compartir artículo canónico y ambos se muestran;
 * - una observación vencida o desactualizada no se presenta como precio vigente.
 *
 * La búsqueda de catálogo devuelve páginas: un producto importado puede quedar después de los
 * primeros 20 resultados porque el catálogo ordena primero las ofertas verificadas. `buscar...`
 * recorre páginas adicionales de E2 con un tope explícito para no ocultarlo.
 */

import type { SearchResponse, SearchResult } from "@/lib/catalogo";
import { compararClaveOrden } from "@/lib/orden-comercial";
import {
  listarFuentes,
  listarOfertasProveedor,
  type Fuente,
  type OfertaImportada,
} from "@/lib/proveedores-api";

/** Páginas adicionales de E2 que se revisan como máximo (50 resultados cada una). */
export const MAX_PAGINAS_ADICIONALES = 5;
export const RESULTADOS_POR_PAGINA = 50;
/** Tope del endpoint de ofertas importadas. */
export const LIMITE_OFERTAS_POR_PROVEEDOR = 1000;

/** Un proveedor con una o más fuentes de lista cargada. */
export interface FuenteDeLista {
  supplierId: string;
  supplierName: string;
  sourceIds: string[];
  sourceNames: string[];
}

export interface GrupoPreciosLista {
  supplierId: string;
  supplierName: string;
  sourceNames: string[];
  ofertas: OfertaImportada[];
}

export interface ResultadoPreciosListas {
  grupos: GrupoPreciosLista[];
  /** Ofertas que coinciden con la búsqueda pero no están vigentes o están desactualizadas. */
  desactualizadas: number;
  /** El mismo total, separado por motivo real de exclusión. */
  motivos: MotivosNoVigente;
  /** Una fuente no respondió: se informa sin ocultar a las demás. */
  errores: string[];
  /** El catálogo tenía más resultados de los que se revisaron. */
  paginasRestantes: boolean;
  /** Claves (artículo, fuente) con oferta importada, para suprimir la tarjeta duplicada de E3. */
  claves: Set<string>;
}

/**
 * Motivos por los que una oferta coincidente no se presenta como precio vigente.
 *
 * Son dimensiones distintas y no se mezclan: la **vigencia** la declara la oferta (`valid_from`,
 * `valid_to`, `is_current`); la **antigüedad de la fuente** es cuánto hace que se observó
 * (`is_stale`, `fresh_until`). El estado de revisión no excluye la oferta de la lista.
 */
export interface MotivosNoVigente {
  fueraDeVigencia: number;
  desactualizado: number;
}

export const SIN_MOTIVOS: MotivosNoVigente = { fueraDeVigencia: 0, desactualizado: 0 };

/**
 * Agrupa las fuentes `manual_import` por proveedor.
 *
 * Una fuente desactivada o sin proveedor no se consulta. El nombre visible es el de la fuente: es
 * lo único que la API de fuentes entrega sin inventar una relación que no informa.
 */
export function fuentesDeLista(fuentes: Fuente[]): FuenteDeLista[] {
  const porProveedor = new Map<string, FuenteDeLista>();
  for (const fuente of fuentes) {
    if (!fuente.enabled || fuente.mode !== "manual_import" || !fuente.supplier_id) continue;
    const actual = porProveedor.get(fuente.supplier_id);
    if (actual) {
      if (!actual.sourceIds.includes(fuente.source_id)) {
        actual.sourceIds.push(fuente.source_id);
        actual.sourceNames.push(fuente.name);
      }
      continue;
    }
    porProveedor.set(fuente.supplier_id, {
      supplierId: fuente.supplier_id,
      supplierName: fuente.name,
      sourceIds: [fuente.source_id],
      sourceNames: [fuente.name],
    });
  }
  return [...porProveedor.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

/** Descubre las fuentes de lista cargada de la organización. */
export async function descubrirFuentesDeLista(): Promise<FuenteDeLista[]> {
  return fuentesDeLista(await listarFuentes());
}

/**
 * Clave (artículo, fuente) de una oferta importada.
 *
 * Sirve para suprimir la tarjeta duplicada de E3: si la fuente ya trae precio para ese artículo,
 * la oferta en vivo de esa misma fuente no se repite. **No** sirve para elegir qué SKU mostrar:
 * dos códigos del mismo proveedor pueden ser el mismo artículo y seguir siendo ofertas distintas.
 */
export function claveOferta(oferta: Pick<OfertaImportada, "trade_item_id" | "source_id">): string {
  return `${oferta.trade_item_id}::${oferta.source_id}`;
}

/**
 * Clave de selección de una observación importada: artículo, fuente **y SKU**.
 *
 * La identidad comercial es el código del proveedor. Al vincular AND-002 y AND-031 al mismo
 * artículo canónico ambas ofertas siguen siendo SKUs distintos y deben seguir visibles con su
 * propio precio, laboratorio y stock.
 */
export function claveSku(
  oferta: Pick<OfertaImportada, "trade_item_id" | "source_id" | "external_id">,
): string {
  return `${oferta.trade_item_id}::${oferta.source_id}::${oferta.external_id}`;
}

function masReciente(a: OfertaImportada, b: OfertaImportada): boolean {
  const observadoA = Date.parse(a.observed_at);
  const observadoB = Date.parse(b.observed_at);
  if (observadoA !== observadoB) return observadoA > observadoB;
  const importadoA = Date.parse(a.imported_at);
  const importadoB = Date.parse(b.imported_at);
  if (importadoA !== importadoB) return importadoA > importadoB;
  return a.offer_id > b.offer_id;
}

/**
 * Vigencia presentada al usuario.
 *
 * Para una **lista manual importada**, la lista actual la define la última importación válida
 * (D-151) y la vigencia la declaran sus ofertas (`is_current`, `valid_from`, `valid_to`). La
 * antigüedad de la fuente (`is_stale`, `fresh_until`, 24 h) describe cuándo se observó el precio,
 * no si la lista dejó de valer: un Excel cargado ayer sigue siendo la lista vigente hasta que se
 * importe otro. Se ignora aquí para no contradecir a `/proveedores`, que cuenta esas mismas
 * ofertas como vigentes.
 *
 * Para fuentes que no son listas manuales, la antigüedad sí excluye: es el criterio de una
 * lectura en vivo.
 */
export function precioVigente(oferta: OfertaImportada, ahora: Date = new Date()): boolean {
  if (oferta.is_current === false) return false;
  if (oferta.valid_from && Date.parse(oferta.valid_from) > ahora.getTime()) return false;
  if (oferta.valid_to && Date.parse(oferta.valid_to) < ahora.getTime()) return false;
  if (oferta.source_mode !== "manual_import") {
    if (oferta.is_stale === true) return false;
    if (oferta.fresh_until && Date.parse(oferta.fresh_until) < ahora.getTime()) return false;
  }
  return true;
}

export interface SeleccionOfertasLista {
  /** La observación más reciente de cada (artículo, fuente, SKU) que coincide con la búsqueda. */
  vigentes: OfertaImportada[];
  /** Las que coinciden pero no están vigentes o están desactualizadas. */
  desactualizadas: number;
  /** El mismo total, separado por motivo real de exclusión. */
  motivos: MotivosNoVigente;
  /** Claves (artículo, fuente) de TODAS las ofertas importadas que coinciden, para E3. */
  claves: Set<string>;
}

/**
 * Motivo por el que la oferta no se presenta como vigente, o `null` si sí lo está.
 *
 * Reparte exactamente el mismo criterio que `precioVigente` sin cambiarlo. Primero la vigencia
 * declarada por la oferta; `desactualizado` solo puede salir para fuentes que no son listas
 * manuales, porque en una lista importada la antigüedad de la observación no la invalida (D-151).
 */
export function motivoNoVigente(
  oferta: OfertaImportada,
  ahora: Date = new Date(),
): "fuera_de_vigencia" | "desactualizado" | null {
  if (oferta.is_current === false) return "fuera_de_vigencia";
  const desde = oferta.valid_from ? Date.parse(oferta.valid_from) : null;
  if (desde !== null && !Number.isNaN(desde) && desde > ahora.getTime()) return "fuera_de_vigencia";
  const hasta = oferta.valid_to ? Date.parse(oferta.valid_to) : null;
  if (hasta !== null && !Number.isNaN(hasta) && hasta < ahora.getTime()) return "fuera_de_vigencia";
  if (precioVigente(oferta, ahora)) return null;
  return "desactualizado";
}

/** Frase que explica cuántas ofertas se omiten y por qué, sin mezclar los dos motivos. */
export function describirNoVigentes(motivos: MotivosNoVigente): string | null {
  const partes: string[] = [];
  if (motivos.fueraDeVigencia > 0) {
    partes.push(
      motivos.fueraDeVigencia === 1
        ? "1 precio coincidente no se muestra porque su vigencia terminó."
        : `${motivos.fueraDeVigencia} precios coincidentes no se muestran porque su vigencia terminó.`,
    );
  }
  if (motivos.desactualizado > 0) {
    partes.push(
      motivos.desactualizado === 1
        ? "1 precio coincidente no se muestra porque la lista del proveedor está desactualizada."
        : `${motivos.desactualizado} precios coincidentes no se muestran porque la lista del proveedor está desactualizada.`,
    );
  }
  return partes.length > 0 ? partes.join(" ") : null;
}

/**
 * Cruza por `trade_item_id` exacto y conserva la última observación de cada SKU de cada fuente.
 * No compara nombres: la identidad la resolvió el backend al importar.
 *
 * La clave de selección incluye el SKU a propósito: compartir artículo canónico no convierte dos
 * códigos del proveedor en la misma oferta. `claves` se mantiene por (artículo, fuente) porque es
 * la que usa la búsqueda para no repetir la tarjeta de E3.
 */
export function seleccionarOfertasDeLista(
  ofertas: OfertaImportada[],
  articleIds: ReadonlySet<string>,
  ahora: Date = new Date(),
): SeleccionOfertasLista {
  const ultimas = new Map<string, OfertaImportada>();
  const claves = new Set<string>();
  for (const oferta of ofertas) {
    if (oferta.source_mode !== "manual_import") continue;
    if (!articleIds.has(oferta.trade_item_id)) continue;
    claves.add(claveOferta(oferta));
    const clave = claveSku(oferta);
    const previa = ultimas.get(clave);
    if (!previa || masReciente(oferta, previa)) ultimas.set(clave, oferta);
  }

  const vigentes: OfertaImportada[] = [];
  const motivos: MotivosNoVigente = { fueraDeVigencia: 0, desactualizado: 0 };
  for (const oferta of ultimas.values()) {
    const motivo = motivoNoVigente(oferta, ahora);
    if (motivo === null) vigentes.push(oferta);
    else if (motivo === "fuera_de_vigencia") motivos.fueraDeVigencia += 1;
    else motivos.desactualizado += 1;
  }
  // El orden comercial lo decide el backend (`order_key`); nunca se reordena por nombre ni fuente.
  // `Array.prototype.sort` es estable: un empate conserva el orden de la respuesta.
  vigentes.sort((a, b) => compararClaveOrden(a.order_key, b.order_key));
  return {
    vigentes,
    desactualizadas: motivos.fueraDeVigencia + motivos.desactualizado,
    motivos,
    claves,
  };
}

/** Agrupa las ofertas por proveedor, conservando solo proveedores con precios para la consulta. */
export function agruparPreciosPorProveedor(
  fuentes: FuenteDeLista[],
  ofertas: OfertaImportada[],
): GrupoPreciosLista[] {
  const fuentePorSourceId = new Map<string, FuenteDeLista>();
  for (const fuente of fuentes) {
    for (const sourceId of fuente.sourceIds) fuentePorSourceId.set(sourceId, fuente);
  }
  const grupos = new Map<string, GrupoPreciosLista>();
  for (const oferta of ofertas) {
    const fuente = fuentePorSourceId.get(oferta.source_id);
    if (!fuente) continue;
    const grupo = grupos.get(fuente.supplierId) ?? {
      supplierId: fuente.supplierId,
      supplierName: fuente.supplierName,
      sourceNames: fuente.sourceNames,
      ofertas: [],
    };
    grupo.ofertas.push(oferta);
    grupos.set(fuente.supplierId, grupo);
  }
  return [...grupos.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

/**
 * Vuelve a leer las listas cargadas y recalcula solo el orden de los precios ya coincidentes.
 *
 * Se usa después de enseñar una preferencia: el backend ya devuelve `order_key` con la decisión
 * nueva, así que basta volver a leer las ofertas y reagrupar. No repite la búsqueda de catálogo ni
 * agrega artículos que antes no coincidían; tampoco inventa precios.
 */
export async function refrescarPreciosDeListas({
  fuentes,
  articleIds,
  cargarOfertas = (supplierId) => listarOfertasProveedor(supplierId, LIMITE_OFERTAS_POR_PROVEEDOR),
  ahora = new Date(),
}: {
  fuentes: FuenteDeLista[];
  articleIds: ReadonlySet<string>;
  cargarOfertas?: (supplierId: string) => Promise<OfertaImportada[]>;
  ahora?: Date;
}): Promise<ResultadoPreciosListas> {
  const errores: string[] = [];
  if (fuentes.length === 0) {
    return {
      grupos: [],
      desactualizadas: 0,
      motivos: { ...SIN_MOTIVOS },
      errores,
      paginasRestantes: false,
      claves: new Set<string>(),
    };
  }
  const respuestas = await Promise.allSettled(
    fuentes.map((fuente) => cargarOfertas(fuente.supplierId)),
  );
  const ofertas: OfertaImportada[] = [];
  respuestas.forEach((respuesta, indice) => {
    const fuente = fuentes[indice];
    if (!fuente) return;
    if (respuesta.status === "fulfilled") ofertas.push(...respuesta.value);
    else errores.push(`No pudimos cargar los precios de la lista de ${fuente.supplierName}.`);
  });
  const seleccion = seleccionarOfertasDeLista(ofertas, articleIds, ahora);
  return {
    grupos: agruparPreciosPorProveedor(fuentes, seleccion.vigentes),
    desactualizadas: seleccion.desactualizadas,
    motivos: seleccion.motivos,
    errores,
    paginasRestantes: false,
    claves: seleccion.claves,
  };
}

export interface OpcionesBusquedaListas {
  fuentes: FuenteDeLista[];
  resultadosIniciales: SearchResult[];
  nextCursor: string | null;
  cargarPagina: (cursor: string, limit: number) => Promise<SearchResponse>;
  cargarOfertas?: (supplierId: string) => Promise<OfertaImportada[]>;
  maxPaginas?: number;
  ahora?: Date;
  /** Se invoca después de cada página: la sección se puede mostrar progresivamente. */
  alAvanzar?: (
    grupos: GrupoPreciosLista[],
    desactualizadas: number,
    claves: Set<string>,
    motivos: MotivosNoVigente,
  ) => void;
}

/**
 * Lee los precios de cada proveedor y recorre las páginas de la búsqueda guardada (E2) hasta
 * encontrar los artículos importados o agotar el tope. Nunca reejecuta la búsqueda ni cambia el
 * orden de E1. Los errores de un proveedor o de una página no ocultan lo ya encontrado.
 */
export async function buscarPreciosDeListas({
  fuentes,
  resultadosIniciales,
  nextCursor,
  cargarPagina,
  cargarOfertas = (supplierId) => listarOfertasProveedor(supplierId, LIMITE_OFERTAS_POR_PROVEEDOR),
  maxPaginas = MAX_PAGINAS_ADICIONALES,
  ahora = new Date(),
  alAvanzar,
}: OpcionesBusquedaListas): Promise<ResultadoPreciosListas> {
  const errores: string[] = [];
  if (fuentes.length === 0) {
    return {
      grupos: [],
      desactualizadas: 0,
      motivos: { ...SIN_MOTIVOS },
      errores,
      paginasRestantes: false,
      claves: new Set<string>(),
    };
  }

  const respuestas = await Promise.allSettled(
    fuentes.map(async (fuente) => ({
      fuente,
      ofertas: await cargarOfertas(fuente.supplierId),
    })),
  );
  const ofertas: OfertaImportada[] = [];
  respuestas.forEach((respuesta, indice) => {
    const fuente = fuentes[indice];
    if (!fuente) return;
    if (respuesta.status === "fulfilled") {
      ofertas.push(...respuesta.value.ofertas);
      if (respuesta.value.ofertas.length >= LIMITE_OFERTAS_POR_PROVEEDOR) {
        errores.push(
          `La lista de ${fuente.supplierName} tiene más de ${LIMITE_OFERTAS_POR_PROVEEDOR} precios; puede faltar alguno.`,
        );
      }
    } else {
      errores.push(`No pudimos cargar los precios de la lista de ${fuente.supplierName}.`);
    }
  });

  const articleIds = new Set(resultadosIniciales.map((resultado) => resultado.article_id));
  let seleccion = seleccionarOfertasDeLista(ofertas, articleIds, ahora);
  alAvanzar?.(
    agruparPreciosPorProveedor(fuentes, seleccion.vigentes),
    seleccion.desactualizadas,
    seleccion.claves,
    seleccion.motivos,
  );

  let cursor = nextCursor;
  let paginas = 0;
  while (cursor && paginas < maxPaginas) {
    try {
      const pagina = await cargarPagina(cursor, RESULTADOS_POR_PAGINA);
      for (const resultado of pagina.results) articleIds.add(resultado.article_id);
      seleccion = seleccionarOfertasDeLista(ofertas, articleIds, ahora);
      alAvanzar?.(
        agruparPreciosPorProveedor(fuentes, seleccion.vigentes),
        seleccion.desactualizadas,
        seleccion.claves,
        seleccion.motivos,
      );
      cursor = pagina.next_cursor;
      paginas += 1;
    } catch {
      errores.push(
        "No pudimos revisar todos los resultados del catálogo; pueden faltar precios de listas cargadas.",
      );
      cursor = null;
    }
  }

  return {
    grupos: agruparPreciosPorProveedor(fuentes, seleccion.vigentes),
    desactualizadas: seleccion.desactualizadas,
    motivos: seleccion.motivos,
    errores,
    paginasRestantes: cursor !== null,
    claves: seleccion.claves,
  };
}
