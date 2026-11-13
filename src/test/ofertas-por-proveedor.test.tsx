import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { OfertasPorProveedor } from "@/components/OfertasPorProveedor";
import type { FuenteDeLista, GrupoPreciosLista } from "@/lib/ofertas-listas";
import type { OfertaImportada } from "@/lib/proveedores-api";
import type { EstadoFuenteEnVivo, OfertaEnVivo, ResultadoEnVivo } from "@/lib/proveedores-en-vivo";

/**
 * Presentación por proveedor (A6, fase 4). Estas pruebas no ordenan nada: comprueban que cada
 * proveedor aparece una sola vez, que sus precios en vivo y de lista se distinguen dentro de su
 * sección y que no se inventan proveedores ni se duplican tarjetas.
 */

function ofertaEnVivo(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "FL-1",
    trade_item_id: "art-predual",
    name: "Predual 30 mg comprimidos",
    laboratory: "Laboratorio",
    presentation: "Caja 30",
    price: { amount: "12990", currency: "CLP" },
    price_basis: "per_commercial_unit",
    sale_unit: "box",
    stock_status: "in_stock",
    stock_quantity: "10",
    stock_unit: "box",
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: true,
    cart_blockers: [],
    ...over,
  };
}

function estado(
  over: Partial<ResultadoEnVivo> = {},
  fuenteOver: Partial<EstadoFuenteEnVivo["fuente"]> = {},
): EstadoFuenteEnVivo {
  const fuente = {
    sourceId: "src-farmaloop",
    sourceName: "Farmaloop API",
    supplierId: "sup-farmaloop",
    supplierName: "Farmaloop",
    state: "connected" as const,
    reason: null,
    consultable: true,
    lastSuccessAt: null,
    error: null,
    ...fuenteOver,
  };
  const resultado: ResultadoEnVivo = {
    search_id: "busq-vivo",
    source_id: fuente.sourceId,
    source_name: fuente.sourceName,
    query: "Predual",
    state: "connected",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-11T10:00:00Z",
    created_at: "2026-11-11T10:00:00Z",
    expires_at: "2026-11-11T10:01:00Z",
    cached: false,
    profile_version: 1,
    discarded: 0,
    warnings: [],
    published: [],
    offers: [ofertaEnVivo()],
    ...over,
  };
  return { fuente, cargando: false, resultado, error: null };
}

function ofertaLista(over: Partial<OfertaImportada> = {}): OfertaImportada {
  return {
    offer_id: "of-lista-1",
    source_id: "src-andes",
    source_name: "Distribuidora Andes",
    source_mode: "manual_import",
    external_id: "AND-100",
    external_name: "Paracetamol 500 mg",
    trade_item_id: "art-paracetamol",
    trade_item_name: "Paracetamol 500 mg comprimidos",
    price_amount: "12990",
    currency: "CLP",
    price_basis: "per_commercial_unit",
    sale_unit: "box",
    sale_unit_text: null,
    pack_units_per_commercial_unit: null,
    pack_base_unit: null,
    stock_status: "unknown",
    stock_quantity: null,
    stock_unit: null,
    review_status: "accepted",
    notes: null,
    valid_from: null,
    valid_to: null,
    is_current: true,
    fresh_until: "2099-01-01T00:00:00Z",
    is_stale: false,
    observed_at: "2026-11-10T09:00:00Z",
    imported_at: "2026-11-10T09:00:00Z",
    ...over,
  };
}

function grupo(over: Partial<GrupoPreciosLista> = {}): GrupoPreciosLista {
  return {
    supplierId: "sup-andes",
    supplierName: "Distribuidora Andes",
    sourceNames: ["Distribuidora Andes"],
    ofertas: [ofertaLista()],
    ...over,
  };
}

function renderizar({
  estados = [],
  grupos = [],
  fuentesListas = [],
  cargandoListas = false,
  erroresListas = [],
}: {
  estados?: EstadoFuenteEnVivo[];
  grupos?: GrupoPreciosLista[];
  fuentesListas?: FuenteDeLista[];
  cargandoListas?: boolean;
  erroresListas?: string[];
}) {
  return render(
    <OfertasPorProveedor
      estados={estados}
      grupos={grupos}
      fuentesListas={fuentesListas}
      consulta="Predual"
      descubriendo={false}
      error={null}
      cargandoListas={cargandoListas}
      erroresListas={erroresListas}
      desactualizadas={0}
      paginasRestantes={false}
      hayFuentesLista={fuentesListas.length > 0 || grupos.length > 0}
    />,
  );
}

function regionesProveedor(): HTMLElement[] {
  return screen
    .getAllByRole("region")
    .filter((region) => (region.getAttribute("aria-label") ?? "").startsWith("Ofertas de "));
}

describe("ofertas organizadas por proveedor", () => {
  it("un proveedor con API y lista cargada aparece una sola vez y distingue sus fuentes", () => {
    renderizar({
      estados: [estado()],
      grupos: [
        grupo({
          supplierId: "sup-farmaloop",
          supplierName: "Farmaloop",
          sourceNames: ["Farmaloop Excel"],
        }),
      ],
    });

    const regiones = regionesProveedor();
    expect(regiones).toHaveLength(1);
    const farmaloop = regiones[0]!;
    expect(farmaloop).toHaveAttribute("aria-label", "Ofertas de Farmaloop");
    expect(farmaloop).toHaveTextContent("En vivo");
    expect(farmaloop).toHaveTextContent("Lista cargada");
    expect(farmaloop).toHaveTextContent("Precios de listas cargadas");
    // La promo de la API y el precio de la lista de ese proveedor conviven en secciones distintas.
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", {
        name: "Precio de lista de Farmaloop: Paracetamol 500 mg comprimidos",
      }),
    ).toBeInTheDocument();
  });

  it("cada proveedor tiene su propia sección, en orden alfabético y sin duplicados", () => {
    renderizar({
      estados: [estado()],
      grupos: [
        grupo({ supplierId: "sup-otro", supplierName: "Pacífico", sourceNames: ["Pacífico"] }),
      ],
    });

    const nombres = regionesProveedor().map((region) => region.getAttribute("aria-label"));
    expect(nombres).toEqual(["Ofertas de Farmaloop", "Ofertas de Pacífico"]);
    // Un proveedor sin conexión en vivo no recibe ofertas inventadas.
    expect(screen.getAllByRole("article", { name: /^Oferta de / })).toHaveLength(1);
  });

  it("un proveedor con solo lista cargada no muestra el bloque en vivo", () => {
    renderizar({ grupos: [grupo()] });

    const regiones = regionesProveedor();
    expect(regiones).toHaveLength(1);
    expect(regiones[0]).toHaveAttribute("aria-label", "Ofertas de Distribuidora Andes");
    expect(regiones[0]).not.toHaveTextContent("En vivo");
    // El precio importado se identifica como precio de lista, no como consulta en vivo.
    expect(regiones[0]).toHaveTextContent("última importación, no consulta en vivo");
  });

  it("la lista cargada y el catálogo no se duplican: cada precio de lista se muestra una vez", () => {
    renderizar({ grupos: [grupo()] });

    expect(
      screen.getAllByRole("article", {
        name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
      }),
    ).toHaveLength(1);
  });

  it("un proveedor con lista habilitada conserva su sección aunque no tenga precios", () => {
    renderizar({
      estados: [estado()],
      fuentesListas: [
        {
          supplierId: "sup-andes",
          supplierName: "Distribuidora Andes",
          sourceIds: ["src-andes"],
          sourceNames: ["Distribuidora Andes"],
        },
      ],
    });

    // Una lista sin coincidencias no es una fuente inexistente: sus dos proveedores siguen ahí.
    const regiones = regionesProveedor();
    expect(regiones.map((region) => region.getAttribute("aria-label"))).toEqual([
      "Ofertas de Distribuidora Andes",
      "Ofertas de Farmaloop",
    ]);
    const andes = regiones[0]!;
    expect(andes).toHaveTextContent("Sin resultados para esta búsqueda.");
    // Sin resultados no se rotula como «En vivo» ni «Lista cargada»: no hay nada que rotular.
    expect(andes).not.toHaveTextContent("En vivo");
    expect(andes).not.toHaveTextContent("Lista cargada");
    expect(within(andes).queryAllByRole("article")).toHaveLength(0);
  });

  it("mientras se buscan precios de las listas lo dice sin adelantar un resultado vacío", () => {
    renderizar({
      fuentesListas: [
        {
          supplierId: "sup-andes",
          supplierName: "Distribuidora Andes",
          sourceIds: ["src-andes"],
          sourceNames: ["Distribuidora Andes"],
        },
      ],
      cargandoListas: true,
    });

    const andes = regionesProveedor()[0]!;
    expect(andes).toHaveTextContent("Buscando precios en las listas cargadas…");
    expect(andes).not.toHaveTextContent("Sin resultados para esta búsqueda.");
  });

  it("un fallo al consultar la lista no se presenta como «sin resultados»", () => {
    renderizar({
      fuentesListas: [
        {
          supplierId: "sup-andes",
          supplierName: "Distribuidora Andes",
          sourceIds: ["src-andes"],
          sourceNames: ["Distribuidora Andes"],
        },
      ],
      erroresListas: ["No pudimos cargar los precios de las listas cargadas."],
    });

    const andes = regionesProveedor()[0]!;
    expect(andes).toHaveTextContent("No se pudo consultar al proveedor.");
    expect(andes).not.toHaveTextContent("Sin resultados para esta búsqueda.");
  });

  it("el fallo de una lista no se atribuye al proveedor que sí respondió", () => {
    renderizar({
      fuentesListas: [
        {
          supplierId: "sup-andes",
          supplierName: "Distribuidora Andes",
          sourceIds: ["src-andes"],
          sourceNames: ["Distribuidora Andes"],
        },
        {
          supplierId: "sup-pacifico",
          supplierName: "Pacífico",
          sourceIds: ["src-pacifico"],
          sourceNames: ["Pacífico"],
        },
      ],
      erroresListas: ["No pudimos cargar los precios de la lista de Pacífico."],
    });

    const [andes, pacifico] = regionesProveedor();
    expect(andes).toHaveTextContent("Sin resultados para esta búsqueda.");
    expect(andes).not.toHaveTextContent("No se pudo consultar al proveedor.");
    expect(pacifico).toHaveTextContent("No se pudo consultar al proveedor.");
    expect(pacifico).not.toHaveTextContent("Sin resultados para esta búsqueda.");
  });

  it("una fuente sin conexión se informa como «No disponible», no como vacía ni con error", () => {
    renderizar({
      estados: [
        {
          fuente: {
            sourceId: "src-farmaloop",
            sourceName: "Farmaloop API",
            supplierId: "sup-farmaloop",
            supplierName: "Farmaloop",
            state: "not_configured",
            reason: "profile_missing",
            consultable: false,
            lastSuccessAt: null,
            error: null,
          },
          cargando: false,
          resultado: null,
          error: null,
        },
      ],
    });

    const farmaloop = regionesProveedor()[0]!;
    expect(farmaloop).toHaveTextContent("No disponible");
    expect(farmaloop).not.toHaveTextContent("Sin resultados para esta búsqueda.");
    expect(within(farmaloop).queryByRole("alert")).toBeNull();
  });

  it("un error de consulta en vivo se informa como tal sin inventar ofertas", () => {
    renderizar({
      estados: [
        {
          fuente: {
            sourceId: "src-farmaloop",
            sourceName: "Farmaloop API",
            supplierId: "sup-farmaloop",
            supplierName: "Farmaloop",
            state: "connected",
            reason: null,
            consultable: true,
            lastSuccessAt: null,
            error: null,
          },
          cargando: false,
          resultado: null,
          error: "Demasiadas búsquedas en vivo. Espera un minuto antes de reintentar.",
        },
      ],
    });

    const farmaloop = regionesProveedor()[0]!;
    expect(farmaloop).toHaveTextContent("No pudimos consultar a Farmaloop.");
    expect(farmaloop).not.toHaveTextContent("Sin resultados para esta búsqueda.");
    expect(within(farmaloop).queryAllByRole("article")).toHaveLength(0);
  });
});
