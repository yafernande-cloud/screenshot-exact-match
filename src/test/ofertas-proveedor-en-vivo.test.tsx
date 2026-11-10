import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FichaOfertaEnVivo } from "@/components/FichaOfertaEnVivo";
import { OfertasProveedorEnVivo } from "@/components/OfertasProveedorEnVivo";
import type {
  EstadoFuenteEnVivo,
  OfertaEnVivo,
  ProductoPublicadoEnVivo,
  ResultadoEnVivo,
} from "@/lib/proveedores-en-vivo";

/**
 * Pruebas de presentación: cada tarjeta muestra solo lo que el proveedor informó y cada fuente
 * tiene su propio estado. Los fixtures reproducen la forma del contrato; no son datos de
 * demostración de la aplicación.
 */
function oferta(over: Partial<OfertaEnVivo> = {}): OfertaEnVivo {
  return {
    external_id: "PRE-001",
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

function renderizar(estados: EstadoFuenteEnVivo[], consulta: string | null = "Predual") {
  return render(
    <OfertasProveedorEnVivo
      estados={estados}
      consulta={consulta}
      descubriendo={false}
      error={null}
    />,
  );
}

describe("proveedores en vivo en la pantalla principal", () => {
  it("separa coincidencias directas de resultados relacionados y muestra los datos informados", () => {
    renderizar([
      estado({
        resultado: resultado({
          offers: [
            oferta(),
            oferta({
              external_id: "PRE-002",
              name: "Predual 30 mg x 30 comprimidos",
              match_relation: "direct",
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

    const directas = screen.getByRole("heading", { name: /Coincidencias directas/ });
    expect(directas).toHaveTextContent("(2)");
    const relacionadas = screen.getByRole("heading", { name: /Resultados relacionados/ });
    expect(relacionadas).toHaveTextContent("(1)");
    expect(screen.getByText(/El nombre publicado no confirma la consulta/)).toBeInTheDocument();

    const tarjetaDirecta = screen.getByRole("article", {
      name: "Oferta de Farmaloop: Predual 30 mg comprimidos",
    });
    expect(within(tarjetaDirecta).getByText("Predual 30 mg comprimidos")).toBeInTheDocument();
    expect(within(tarjetaDirecta).getByText("Laboratorio Ficticio")).toBeInTheDocument();
    expect(within(tarjetaDirecta).getByText("Caja 30 comprimidos")).toBeInTheDocument();
    expect(within(tarjetaDirecta).getByText("Coincidencia directa")).toBeInTheDocument();
    expect(within(tarjetaDirecta).getByText("$12.990")).toBeInTheDocument();
    // Un dato ausente no se completa: queda «No informado».
    const filaStock = within(tarjetaDirecta).getByText("Stock:").parentElement;
    expect(filaStock).toHaveTextContent("Stock: No informado");

    const tarjetaRelacionada = screen.getByRole("article", {
      name: "Oferta de Farmaloop: Pregalex 75 mg",
    });
    expect(within(tarjetaRelacionada).getByText("Relacionado")).toBeInTheDocument();
  });

  it("mantiene el carrito deshabilitado y muestra los motivos reales", () => {
    renderizar([estado({ resultado: resultado({ offers: [oferta()] }) })]);

    const tarjeta = screen.getByRole("article", {
      name: "Oferta de Farmaloop: Predual 30 mg comprimidos",
    });
    const boton = within(tarjeta).getByRole("button", { name: /Agregar a cotización/ });
    expect(boton).toBeDisabled();
    expect(
      within(tarjeta).getByText(
        "No se puede agregar: unidad de venta no informada; base del precio no informada.",
      ),
    ).toBeInTheDocument();
  });

  it("no inventa stock ni unidad de venta cuando el proveedor no los informa", () => {
    render(<FichaOfertaEnVivo oferta={oferta()} proveedor="Farmaloop" />);

    const tarjeta = screen.getByRole("article");
    const filaStock = within(tarjeta).getByText("Stock:").parentElement;
    expect(filaStock).toHaveTextContent("Stock: No informado");
    const filaUnidad = within(tarjeta).getByText("Unidad de venta:").parentElement;
    expect(filaUnidad).toHaveTextContent("Unidad de venta: No informado");
    expect(within(tarjeta).queryByText(/Con stock|Sin stock/)).toBeNull();
    expect(within(tarjeta).queryByText(/^Precio por/)).toBeNull();
  });

  it("muestra stock y precio tal como los informa el proveedor", () => {
    render(
      <FichaOfertaEnVivo
        oferta={oferta({
          stock_status: "in_stock",
          stock_quantity: "6",
          stock_unit: "box",
          sale_unit: "box",
          price_basis: "per_commercial_unit",
          cart_eligible: true,
          cart_blockers: [],
        })}
        proveedor="Farmaloop"
      />,
    );

    expect(screen.getByText("Con stock: 6 cajas (informado por el proveedor)")).toBeInTheDocument();
    expect(screen.getByText("Precio por unidad de venta")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Datos comerciales completos; el carrito se habilitará en una etapa posterior.",
      ),
    ).toBeInTheDocument();
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
    expect(screen.queryByText(/no devolvió ofertas/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Coincidencias directas/ })).toBeNull();
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

  it("una fuente conectada sin ofertas lo dice con la consulta real", () => {
    renderizar([estado({ resultado: resultado({ offers: [], outcome: "no_matches" }) })]);

    expect(
      screen.getByText("Farmaloop respondió y no devolvió ofertas para «Predual»."),
    ).toBeInTheDocument();
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

  it("muestra un producto publicado sin precio vigente como coincidencia directa y sin habilitar el carrito", () => {
    renderizar([
      estado({ resultado: resultado({ offers: [oferta()], published: [publicado()] }) }),
    ]);

    const directas = screen.getByRole("heading", { name: /Coincidencias directas/ });
    expect(directas).toHaveTextContent("(2)");

    const tarjeta = screen.getByRole("article", {
      name: "Producto publicado por Farmaloop: Predual Pamabron 25 mg 12 Comprimidos",
    });
    expect(within(tarjeta).getByText("Sin stock (informado por el proveedor)")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Sin precio vigente")).toBeInTheDocument();
    expect(within(tarjeta).getByText("$2.290")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Precio de lista referencial/)).toHaveTextContent(
      "Precio de lista referencial: $2.290",
    );
    expect(
      within(tarjeta).getByText("Sin precio comercial vigente: no se puede cotizar."),
    ).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: /Agregar a cotización/ })).toBeDisabled();
    expect(
      within(tarjeta).getByText(
        /No se puede agregar: el proveedor informa que no está disponible para la venta; no hay precio comercial vigente/,
      ),
    ).toBeInTheDocument();
    // No se presenta como oferta comercial.
    expect(
      screen.queryByRole("article", {
        name: "Oferta de Farmaloop: Predual Pamabron 25 mg 12 Comprimidos",
      }),
    ).toBeNull();
  });

  it("distingue «Sin stock» de «Stock no informado» en un producto publicado", () => {
    renderizar([
      estado({
        resultado: resultado({
          published: [publicado({ stock_status: "unknown", reference_price: null })],
        }),
      }),
    ]);

    const tarjeta = screen.getByRole("article", { name: /Producto publicado por Farmaloop/ });
    const filaDisponibilidad = within(tarjeta).getByText("Disponibilidad:").parentElement;
    expect(filaDisponibilidad).toHaveTextContent("Disponibilidad: No informado");
    expect(within(tarjeta).getByText(/Precio de lista referencial/)).toHaveTextContent(
      "Precio de lista referencial: No informado",
    );
    expect(within(tarjeta).queryByText(/Sin stock/)).toBeNull();
  });

  it("mantiene separados los publicados directos de los relacionados y no niega los resultados", () => {
    renderizar([
      estado({
        resultado: resultado({
          published: [
            publicado(),
            publicado({
              external_id: "8127",
              name: "Pedialyte 60 Manzana x 500 ml Solución Oral",
              match_relation: "related",
              stock_status: "unknown",
              reference_price: null,
            }),
          ],
        }),
      }),
    ]);

    expect(screen.getByRole("heading", { name: /Coincidencias directas/ })).toHaveTextContent(
      "(1)",
    );
    expect(screen.getByRole("heading", { name: /Resultados relacionados/ })).toHaveTextContent(
      "(1)",
    );
    expect(screen.queryByText(/no devolvió ofertas/)).toBeNull();
  });

  it("no renderiza nada mientras no hay fuentes ni consulta en curso", () => {
    const { container } = render(
      <OfertasProveedorEnVivo estados={[]} consulta={null} descubriendo={false} error={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
