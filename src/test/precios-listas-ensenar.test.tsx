import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreciosListasCargadas } from "@/components/PreciosListasCargadas";
import type { GrupoPreciosLista } from "@/lib/ofertas-listas";
import type { OfertaImportada } from "@/lib/proveedores-api";
import type { ObservacionComercial } from "@/lib/observaciones-api";

/**
 * «Enseñar a la IA» desde un precio de lista cargada (Distribuidora Andes, Excel/CSV).
 *
 * La observación usa los identificadores que ya persiste la importación: artículo
 * (`trade_item_id`), proveedor de esa fuente y la oferta importada. No se cruza por nombre ni se
 * completa ningún campo que la lista no informe.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

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

const GRUPO: GrupoPreciosLista = {
  supplierId: "sup-andes",
  supplierName: "Distribuidora Andes",
  sourceNames: ["Distribuidora Andes"],
  ofertas: [ofertaLista()],
};

function observacion(over: Partial<ObservacionComercial> = {}): ObservacionComercial {
  return {
    observation_id: "obs-andes",
    text: "Prefiero Andes para este producto",
    trade_item_id: "art-paracetamol",
    supplier_id: "sup-andes",
    offer_snapshot_id: "of-lista-1",
    interpretation_status: "no_preference",
    interpretation: null,
    retired_subject_kinds: [],
    ...over,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation(async (ruta: string) =>
    String(ruta).endsWith("/interpretations")
      ? { replayed: false, observation: observacion() }
      : observacion(),
  );
});

describe("«Enseñar a la IA» en precios de lista importados", () => {
  it("muestra el laboratorio y la marca publicados por la lista", () => {
    const grupo: GrupoPreciosLista = {
      ...GRUPO,
      ofertas: [
        ofertaLista({
          laboratory_as_published: "Laboratorios Andes Ficticios",
          brand_as_published: "Marca Alfa Ficticia",
        }),
      ],
    };
    render(
      <PreciosListasCargadas
        grupos={[grupo]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(
      screen.getByText("Laboratorio: Laboratorios Andes Ficticios · Marca: Marca Alfa Ficticia"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Laboratorio y marca pendientes de identificación")).toBeNull();
    expect(screen.queryByText("Laboratorio y marca no informados")).toBeNull();

    // Con identidad publicada, el formulario no advierte que la lista no la informa.
    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    expect(
      screen.queryByText(/Distribuidora Andes no informa laboratorio ni marca en su lista/),
    ).toBeNull();
  });

  it("declara la ausencia de laboratorio y marca sin inventarlas", () => {
    render(
      <PreciosListasCargadas
        grupos={[GRUPO]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(
      screen.getByText("Laboratorio y marca pendientes de identificación"),
    ).toBeInTheDocument();
    // La oferta sigue visible, pero marcada como pendiente: no se presenta como completa.
    expect(screen.getByText("Laboratorio y marca no informados")).toBeInTheDocument();
  });

  it("muestra precio y acciones a la derecha, con el mismo patrón que las ofertas en vivo", () => {
    render(
      <PreciosListasCargadas
        grupos={[GRUPO]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    const tarjeta = screen.getByRole("article", {
      name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
    });
    // La columna de acciones es la que contiene el precio y su rótulo.
    const columna = within(tarjeta).getByText("Precio de lista").parentElement?.parentElement;
    expect(columna).not.toBeNull();
    const hijos = [...(columna?.children ?? [])];

    // Precio arriba; debajo, en este orden: agregar, su mensaje y enseñar a la IA.
    expect(hijos[0]).toHaveTextContent("$12.990");
    expect(hijos[1]).toHaveTextContent("Agregar a cotización");
    // Sin una acción de carrito conectada, la tarjeta informa que no se puede agregar.
    expect(hijos[2]).toHaveTextContent("No disponible para agregar a la cotización.");
    expect(hijos[3]).toHaveTextContent("Enseñar a la IA");
    // Los datos del producto no forman parte de la columna de acciones.
    expect(columna).not.toContainElement(
      within(tarjeta).getByRole("heading", { name: "Paracetamol 500 mg comprimidos" }),
    );
  });

  it("distingue la identidad reconocida en la descripción de una columna publicada", () => {
    const grupo: GrupoPreciosLista = {
      ...GRUPO,
      ofertas: [
        ofertaLista({
          laboratory_as_published: "Lab. Cordillera Ficticio",
          brand_as_published: null,
          identity_status: "extracted",
          laboratory_source: "description",
        }),
      ],
    };
    render(
      <PreciosListasCargadas
        grupos={[grupo]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(
      screen.getByText(
        "Laboratorio: Lab. Cordillera Ficticio (reconocido en la descripción, pendiente de confirmación)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Identidad extraída de la descripción")).toBeInTheDocument();
    expect(screen.queryByText("Laboratorio y marca no informados")).toBeNull();

    // El laboratorio sí está informado (en la descripción): no se advierte que falte.
    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    expect(
      screen.queryByText(/Distribuidora Andes no informa laboratorio ni marca en su lista/),
    ).toBeNull();
  });

  it("envía el artículo, el proveedor de la lista y la oferta importada", async () => {
    const onActualizar = vi.fn();
    render(
      <PreciosListasCargadas
        grupos={[GRUPO]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
        onActualizar={onActualizar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    expect(
      screen.getByText(/Distribuidora Andes no informa laboratorio ni marca en su lista/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Comentario sobre el producto" }), {
      target: { value: "Prefiero Andes para este producto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(2));
    const [ruta, init] = apiRequestMock.mock.calls[0] ?? [];
    expect(ruta).toBe("/api/v1/commercial-observations");
    expect(JSON.parse(init.body)).toEqual({
      text: "Prefiero Andes para este producto",
      trade_item_id: "art-paracetamol",
      supplier_id: "sup-andes",
      offer_snapshot_id: "of-lista-1",
    });
    expect(apiRequestMock.mock.calls[1]?.[0]).toBe(
      "/api/v1/commercial-observations/obs-andes/interpretations",
    );
  });

  it("sin preferencia aplicable no pide refrescar el orden", async () => {
    const onActualizar = vi.fn();
    render(
      <PreciosListasCargadas
        grupos={[GRUPO]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
        onActualizar={onActualizar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comentario sobre el producto" }), {
      target: { value: "Prefiero Andes para este producto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Comentario guardado sin una preferencia aplicable"),
    ).toBeInTheDocument();
    expect(onActualizar).not.toHaveBeenCalled();
  });

  it("muestra dos ofertas del mismo proveedor que comparten artículo canónico", () => {
    // Tras vincular AND-002 y AND-031 al mismo artículo, ambas tarjetas siguen visibles con su
    // propio precio, laboratorio y stock: compartir artículo no las vuelve la misma oferta.
    const grupo: GrupoPreciosLista = {
      ...GRUPO,
      ofertas: [
        ofertaLista({
          offer_id: "of-and-002",
          external_id: "AND-002",
          price_amount: "3190",
          laboratory_as_published: "Laboratorio Cordillera",
        }),
        ofertaLista({
          offer_id: "of-and-031",
          external_id: "AND-031",
          price_amount: "2890",
          laboratory_as_published: "ASCEND LABORATORIES SPA",
        }),
      ],
    };
    render(
      <PreciosListasCargadas
        grupos={[grupo]}
        consulta="Ibuprofeno"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    const tarjetas = screen.getAllByRole("article");
    expect(tarjetas).toHaveLength(2);
    expect(screen.getByText("$3.190")).toBeInTheDocument();
    expect(screen.getByText("$2.890")).toBeInTheDocument();
    expect(screen.getByText(/Laboratorio: Laboratorio Cordillera/)).toBeInTheDocument();
    expect(screen.getByText(/Laboratorio: ASCEND LABORATORIES SPA/)).toBeInTheDocument();
    expect(screen.getByText(/Código AND-002/)).toBeInTheDocument();
    expect(screen.getByText(/Código AND-031/)).toBeInTheDocument();
  });

  it("muestra la cantidad guardada en formato local y con su unidad", () => {
    const grupo: GrupoPreciosLista = {
      ...GRUPO,
      ofertas: [
        ofertaLista({ stock_status: "known", stock_quantity: "120.000", stock_unit: "box" }),
      ],
    };
    render(
      <PreciosListasCargadas
        grupos={[grupo]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(
      screen.getByRole("article", {
        name: "Precio de lista de Distribuidora Andes: Paracetamol 500 mg comprimidos",
      }),
    ).toHaveTextContent("120 cajas");
    // «120.000» es el decimal que serializa el backend, no 120 mil cajas.
    expect(screen.queryByText(/120\.000 caja/)).toBeNull();
  });

  it("presenta las condiciones del proveedor sin alarmarlas y conserva su texto", () => {
    const grupo: GrupoPreciosLista = {
      ...GRUPO,
      ofertas: [ofertaLista({ review_status: "needs_review", notes: "Entrega en 48 horas" })],
    };
    render(
      <PreciosListasCargadas
        grupos={[grupo]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(screen.getByText("Condiciones del proveedor")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente de revisión")).toBeNull();
    expect(screen.getByText(/«Entrega en 48 horas»/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      /El proveedor informó estas condiciones comerciales/,
    );
  });

  it("indica «Sin condiciones informadas» cuando la lista no publica condiciones", () => {
    render(
      <PreciosListasCargadas
        grupos={[GRUPO]}
        consulta="Paracetamol"
        cargando={false}
        errores={[]}
        desactualizadas={0}
        paginasRestantes={false}
        hayFuentes
      />,
    );

    expect(screen.getByText("Sin condiciones informadas")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
});
