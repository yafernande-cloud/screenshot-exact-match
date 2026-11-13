import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FichaOfertaEnVivo } from "@/components/FichaOfertaEnVivo";
import { OfertasProveedorEnVivo } from "@/components/OfertasProveedorEnVivo";
import type {
  EstadoFuenteEnVivo,
  OfertaEnVivo,
  ProductoPublicadoEnVivo,
  ResultadoEnVivo,
} from "@/lib/proveedores-en-vivo";

/**
 * Pruebas de presentación: las coincidencias directas y los resultados relacionados se muestran
 * por separado, cada tarjeta enseña los datos esenciales y el carrito sigue dependiendo de
 * `cart_eligible`. Los fixtures reproducen la forma del contrato; no son datos de demostración.
 */
function oferta(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "PRE-001",
    trade_item_id: null,
    name: "Predual 30 mg comprimidos",
    laboratory: "Laboratorio Ficticio",
    presentation: "Caja 30 comprimidos",
    price: { amount: "12990", currency: "CLP" },
    price_basis: null,
    sale_unit: null,
    stock_status: "unknown",
    stock_quantity: null,
    stock_unit: null,
    image_url: null,
    product_url: null,
    ean: null,
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: ["sale_unit_unconfirmed", "price_basis_unconfirmed"],
    ...over,
  };
}

function publicado(over: Partial<ProductoPublicadoEnVivo> = {}): ProductoPublicadoEnVivo {
  return {
    external_id: "140640",
    trade_item_id: null,
    name: "Predual Pamabron 25 mg 12 Comprimidos",
    laboratory: "LABORATORIO MAVER S.A",
    presentation: "Comprimido",
    stock_status: "out_of_stock",
    reference_price: { amount: "2290", currency: "CLP" },
    image_url: null,
    product_url: null,
    ean: "crearpredual12",
    match_relation: "direct",
    match_reasons: ["all_query_terms_in_name"],
    cart_eligible: false,
    cart_blockers: [
      "not_available_for_sale",
      "no_current_price",
      "sale_unit_unconfirmed",
      "price_basis_unconfirmed",
    ],
    ...over,
  };
}

function resultado(over: Partial<ResultadoEnVivo> = {}): ResultadoEnVivo {
  return {
    search_id: "busq-1",
    source_id: "src-1",
    source_name: "Farmaloop API",
    query: "Predual",
    state: "connected",
    reason: null,
    outcome: "matches",
    observed_at: "2026-11-10T01:20:56Z",
    created_at: "2026-11-10T01:20:56Z",
    expires_at: "2026-11-10T01:30:56Z",
    cached: false,
    profile_version: 1,
    discarded: 0,
    warnings: [],
    offers: [],
    published: [],
    ...over,
  };
}

function estado(over: Partial<EstadoFuenteEnVivo> = {}): EstadoFuenteEnVivo {
  return {
    fuente: {
      sourceId: "src-1",
      sourceName: "Farmaloop API",
      supplierId: "sup-1",
      supplierName: "Farmaloop",
      state: "connected",
      reason: null,
      consultable: true,
      lastSuccessAt: null,
      error: null,
    },
    cargando: false,
    resultado: null,
    error: null,
    ...over,
  };
}

function renderizar(
  estados: EstadoFuenteEnVivo[],
  consulta: string | null = "Predual",
  onReintentar?: (fuente: EstadoFuenteEnVivo["fuente"]) => void,
) {
  return render(
    <OfertasProveedorEnVivo
      estados={estados}
      consulta={consulta}
      descubriendo={false}
      error={null}
      onReintentar={onReintentar}
    />,
  );
}

describe("proveedores en vivo en la pantalla principal", () => {
  it("separa las coincidencias directas de los resultados relacionados", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [
            oferta(),
            oferta({
              external_id: "PRE-002",
              name: "Predual 30 mg x 30 comprimidos",
            }),
            oferta({
              external_id: "PREG-001",
              name: "Pregalex 75 mg",
              laboratory: null,
              presentation: null,
              match_relation: "related",
            }),
          ],
        }),
      }),
    ]);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Pregalex 75 mg")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resultados relacionados" })).toBeInTheDocument();
    expect(screen.getByText(/su nombre no confirma toda la búsqueda/)).toBeInTheDocument();
  });

  it("muestra los datos esenciales de la oferta sin explicaciones técnicas", () => {
    renderizar([estado({ resultado: resultado({ offers: [oferta()] }) })]);

    const tarjeta = screen.getByRole("article", {
      name: "Oferta de Farmaloop: Predual 30 mg comprimidos",
    });
    expect(within(tarjeta).getByText("Predual 30 mg comprimidos")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Laboratorio Ficticio · Código PRE-001")).toBeInTheDocument();
    expect(within(tarjeta).getByText("$12.990")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Precio")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Stock no informado")).toBeInTheDocument();
    // Del bloqueo solo se escribe el motivo breve; los valores internos no se muestran.
    expect(within(tarjeta).getByText("Unidad de venta pendiente")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("box")).toBeNull();
    expect(within(tarjeta).queryByText(/base del precio/i)).toBeNull();
    expect(within(tarjeta).queryByText(/Presentación/)).toBeNull();
    expect(within(tarjeta).queryByText(/Farmaloop API/)).toBeNull();
  });

  it("mantiene el carrito deshabilitado con una explicación breve", () => {
    renderizar([estado({ resultado: resultado({ offers: [oferta()] }) })]);

    const tarjeta = screen.getByRole("article", {
      name: "Oferta de Farmaloop: Predual 30 mg comprimidos",
    });
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    // La explicación viene del motivo del backend, en cuatro palabras.
    expect(within(tarjeta).getByText("Unidad de venta pendiente")).toBeInTheDocument();
    expect(within(tarjeta).queryByText(/No se puede agregar/)).toBeNull();
  });

  it("no habilita la acción si el backend autoriza pero no hay carrito conectado", () => {
    render(
      <FichaOfertaEnVivo
        oferta={oferta({
          stock_status: "in_stock",
          sale_unit: "box",
          price_basis: "per_commercial_unit",
          cart_eligible: true,
          cart_blockers: [],
        })}
        proveedor="Farmaloop"
      />,
    );

    expect(screen.getByText("Con stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    expect(screen.getByText("No disponible para agregar a la cotización.")).toBeInTheDocument();
  });

  it("habilita la acción solo con elegibilidad del backend y una acción real", () => {
    const agregar = vi.fn();
    const ofertaElegible = oferta({
      stock_status: "in_stock",
      sale_unit: "box",
      price_basis: "per_commercial_unit",
      cart_eligible: true,
      cart_blockers: [],
    });
    render(<FichaOfertaEnVivo oferta={ofertaElegible} proveedor="Farmaloop" onAgregar={agregar} />);

    const boton = screen.getByRole("button", { name: /Agregar a cotización/ });
    expect(boton).toBeEnabled();
    expect(screen.queryByText("No disponible para agregar a la cotización.")).toBeNull();
    boton.click();
    expect(agregar).toHaveBeenCalledWith(ofertaElegible);
  });

  it("habilita la acción de una oferta sin unidad ni base cuando el backend la autoriza", () => {
    const agregar = vi.fn();
    const sinTerminos = oferta({
      stock_status: "in_stock",
      price_basis: null,
      sale_unit: null,
      cart_eligible: true,
      cart_blockers: [],
    });
    render(<FichaOfertaEnVivo oferta={sinTerminos} proveedor="Farmaloop" onAgregar={agregar} />);

    const boton = screen.getByRole("button", { name: /Agregar a cotización/ });
    expect(boton).toBeEnabled();
    expect(screen.queryByText("No disponible para agregar a la cotización.")).toBeNull();
    boton.click();
    expect(agregar).toHaveBeenCalledWith(sinTerminos);
  });

  it("el contenedor no habilita el carrito sin una acción conectada", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [
            oferta({
              cart_eligible: true,
              cart_blockers: [],
              sale_unit: "box",
              price_basis: "per_commercial_unit",
            }),
          ],
          published: [publicado({ cart_eligible: true, cart_blockers: [] })],
        }),
      }),
    ]);

    for (const boton of screen.getAllByRole("button", { name: /Agregar a cotización/ })) {
      expect(boton).toBeDisabled();
    }
  });

  it("el contenedor entrega la acción real con el ítem completo", () => {
    const agregar = vi.fn();
    render(
      <OfertasProveedorEnVivo
        estados={[
          estado({
            resultado: resultado({
              offers: [oferta({ cart_eligible: true, cart_blockers: [] })],
              published: [publicado({ cart_eligible: true, cart_blockers: [] })],
            }),
          }),
        ]}
        consulta="Predual"
        descubriendo={false}
        error={null}
        onAgregar={agregar}
      />,
    );

    const botones = screen.getAllByRole("button", { name: /Agregar a cotización/ });
    expect(botones).toHaveLength(2);
    const [botonOferta, botonPublicado] = botones as [HTMLButtonElement, HTMLButtonElement];
    expect(botonOferta).toBeEnabled();
    expect(botonPublicado).toBeEnabled();
    botonOferta.click();
    botonPublicado.click();
    expect(agregar).toHaveBeenNthCalledWith(1, {
      tipo: "oferta",
      oferta: expect.objectContaining({ external_id: "PRE-001", cart_eligible: true }),
    });
    expect(agregar).toHaveBeenNthCalledWith(2, {
      tipo: "publicado",
      producto: expect.objectContaining({ external_id: "140640", cart_eligible: true }),
    });
  });

  it("distingue las tres disponibilidades sin inventar datos", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [
            oferta({ external_id: "A", name: "Predual A", stock_status: "in_stock" }),
            oferta({ external_id: "B", name: "Predual B", stock_status: "out_of_stock" }),
            oferta({ external_id: "C", name: "Predual C", stock_status: "unknown" }),
          ],
        }),
      }),
    ]);

    const tarjeta = (nombre: string) =>
      screen.getByRole("article", { name: `Oferta de Farmaloop: ${nombre}` });
    expect(within(tarjeta("Predual A")).getByText("Con stock")).toBeInTheDocument();
    expect(within(tarjeta("Predual B")).getByText("Sin stock")).toBeInTheDocument();
    expect(within(tarjeta("Predual C")).getByText("Stock no informado")).toBeInTheDocument();
  });

  it("muestra el precio de lista como referencial y no como precio vigente", () => {
    renderizar([estado({ resultado: resultado({ published: [publicado()] }) })]);

    const tarjeta = screen.getByRole("article", {
      name: "Producto publicado por Farmaloop: Predual Pamabron 25 mg 12 Comprimidos",
    });
    expect(within(tarjeta).getByText("$2.290")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Precio de lista (referencial)")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Precio")).toBeNull();
    expect(within(tarjeta).getByText("Sin stock")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    expect(
      within(tarjeta).getByText("No disponible para agregar a la cotización."),
    ).toBeInTheDocument();
  });

  it("un publicado directo sin stock se mantiene entre los resultados", () => {
    renderizar([
      estado({ resultado: resultado({ offers: [oferta()], published: [publicado()] }) }),
    ]);

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      screen.getByRole("article", {
        name: "Producto publicado por Farmaloop: Predual Pamabron 25 mg 12 Comprimidos",
      }),
    ).toBeInTheDocument();
  });

  it("cuando solo hay resultados relacionados los muestra aparte, no como coincidencias", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [
            oferta({
              external_id: "PREG-001",
              name: "Pregalex 75 mg",
              match_relation: "related",
            }),
          ],
          published: [publicado({ match_relation: "related" })],
        }),
      }),
    ]);

    expect(screen.queryByText("Sin resultados para esta búsqueda.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Resultados relacionados" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    // Ninguno se presenta como la oferta buscada ni habilita el alta.
    for (const boton of screen.getAllByRole("button", { name: /Agregar a cotización/ })) {
      expect(boton).toBeDisabled();
    }
  });

  it("una fuente sin conexión se informa como tal y nunca como «sin resultados»", () => {
    renderizar([
      estado({
        fuente: {
          ...estado().fuente,
          state: "not_configured",
          reason: "profile_missing",
          consultable: false,
        },
      }),
    ]);

    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    expect(screen.getByText(/Falta configurar la conexión/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin resultados para esta búsqueda/)).toBeNull();
  });

  it("un error de una fuente no oculta el resultado de otra", () => {
    renderizar([
      estado({
        resultado: resultado({ offers: [oferta()] }),
      }),
      estado({
        fuente: {
          sourceId: "src-2",
          sourceName: "Otro proveedor",
          supplierId: "sup-2",
          supplierName: "Otro",
          state: "connected",
          reason: null,
          consultable: true,
          lastSuccessAt: null,
          error: null,
        },
        error: "Demasiadas búsquedas en vivo. Espera un minuto antes de reintentar.",
      }),
    ]);

    expect(screen.getByRole("alert")).toHaveTextContent(/Demasiadas búsquedas en vivo/);
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
  });

  it("una fuente conectada sin resultados lo dice con un mensaje simple", () => {
    renderizar([estado({ resultado: resultado({ offers: [], outcome: "no_matches" }) })]);

    expect(screen.getByText("Sin resultados para esta búsqueda.")).toBeInTheDocument();
  });

  it("muestra las ofertas válidas aunque la estructura pida revisión", () => {
    renderizar([
      estado({
        resultado: resultado({
          state: "requires_intervention",
          reason: "schema_changed",
          outcome: "matches",
          warnings: [
            "La estructura de la respuesta cambió; revisa el mapeo antes de confiar en estos datos.",
          ],
          offers: [oferta({ stock_status: "in_stock" })],
        }),
      }),
    ]);

    // La oferta conserva su precio y su stock reales; el aviso no la oculta.
    expect(
      screen.getByRole("article", { name: "Oferta de Farmaloop: Predual 30 mg comprimidos" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$12.990")).toBeInTheDocument();
    expect(screen.getByText("Con stock")).toBeInTheDocument();
    expect(
      screen.getByText(/Se muestran las ofertas y publicaciones que sí validaron/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos consultar/)).toBeNull();
    expect(screen.queryByText("Sin resultados para esta búsqueda.")).toBeNull();
  });

  it("una respuesta ilegible se avisa con un texto breve y permite reintentar", () => {
    const reintentar = vi.fn();
    renderizar(
      [
        estado({
          resultado: resultado({
            state: "requires_intervention",
            reason: "field_mapping_failed",
            outcome: null,
            offers: [],
            published: [],
          }),
        }),
      ],
      "Predual",
      reintentar,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar a Farmaloop.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos leer los productos de la respuesta.",
    );
    // Un fallo de lectura no se disfraza de «sin resultados».
    expect(screen.queryByText("Sin resultados para esta búsqueda.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
    expect(reintentar.mock.calls[0]?.[0]).toMatchObject({ sourceId: "src-1" });
  });

  it("un fallo de red o del proveedor se puede reintentar sin volver a buscar todo", () => {
    const reintentar = vi.fn();
    renderizar([estado({ error: "El proveedor no respondió a tiempo." })], "Predual", reintentar);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar a Farmaloop.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it("muestra las advertencias funcionales y oculta el detalle técnico de descartes", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [oferta()],
          warnings: [
            "El proveedor informó precios sin IVA.",
            "5 ítem(s) descartados por datos incompletos o inválidos.",
          ],
          discarded: 5,
        }),
      }),
    ]);

    expect(screen.getByText("El proveedor informó precios sin IVA.")).toBeInTheDocument();
    expect(screen.queryByText(/descartad/i)).toBeNull();
    expect(screen.queryByText(/no se pudieron interpretar/)).toBeNull();
  });

  it("no renderiza nada mientras no hay fuentes ni consulta en curso", () => {
    const { container } = render(
      <OfertasProveedorEnVivo estados={[]} consulta={null} descubriendo={false} error={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
