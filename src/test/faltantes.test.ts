import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { solicitudesDemo } from "@/data/demo";
import {
  aplicarCambioCantidad,
  cantidadDeReferencia,
  cantidadReportadaExplicita,
  consultaDeBusqueda,
  consultaCompletaDeBusqueda,
  etiquetaEstadoFaltante,
  fusionarFaltantes,
  MAX_CONSULTA_BUSQUEDA,
  partesDelFaltante,
  pendientes,
  resolverSolicitud,
  siguienteCantidad,
  unidadDeAjuste,
  unidadParaAsociar,
  visiblesEnBandeja,
} from "@/lib/faltantes";
import type { Faltante } from "@/lib/faltantes-api";
import { buscarProducto, totalCarrito } from "@/lib/cotizacion";

describe("bandeja sin datos ficticios", () => {
  it("no conserva reportes de demostración ni el dashboard los puede volver a mostrar", () => {
    const demo = readFileSync(resolve(process.cwd(), "src/data/demo.ts"), "utf8");
    const dashboard = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");

    for (const fuente of [demo, dashboard]) {
      expect(fuente).not.toMatch(
        /faltantesDemo|ReporteFaltante|Juanito Pérez|María González|Pedro Soto/,
      );
    }
    expect(dashboard).toContain("listarFaltantes");
    expect(dashboard).toContain("consultaDeBusqueda(f)");
  });
});

describe("solicitudes de acceso", () => {
  it("approving removes the request from pending and records the reviewing admin", () => {
    const r = resolverSolicitud(solicitudesDemo, "sol-001", "aprobada", "adm-2");
    expect(pendientes(r)).toHaveLength(0);
    expect(r[0]).toMatchObject({ estado: "aprobada", revisadaPor: "adm-2" });
  });

  it("an already rejected request cannot be approved afterwards", () => {
    const rechazada = resolverSolicitud(solicitudesDemo, "sol-001", "rechazada", "adm-1");
    expect(resolverSolicitud(rechazada, "sol-001", "aprobada", "adm-2")[0]?.estado).toBe(
      "rechazada",
    );
  });
});

function faltante(overrides: Partial<Faltante> = {}): Faltante {
  return {
    id: "f-1",
    display_name: "Omeprazol 20 mg",
    ingredient: "omeprazol",
    status: "active",
    version: 3,
    observation_count: 2,
    reporters: ["Pato"],
    data_origin: "captured",
    created_at: "2026-11-05T10:00:00Z",
    reported_by: "u-1",
    reported_by_name: "Pato",
    branch_label: "Parque Lantaño",
    declared_quantity: "2",
    declared_unit: "box",
    requested_quantity: "2",
    requested_unit: "box",
    requested_quantity_origin: "explicit",
    target_quantity: null,
    quantity_unit: null,
    quantity_status: "unknown",
    needs_quantity: true,
    reported_at: "2026-11-05T10:00:00Z",
    cancelled_at: null,
    last_raw_text: null,
    ...overrides,
  };
}

describe("bandeja real de faltantes", () => {
  it("presenta el estado real que entrega el backend", () => {
    expect(etiquetaEstadoFaltante("active")).toBe("Pendiente");
    expect(etiquetaEstadoFaltante("cancelled")).toBe("Cancelado");
    expect(etiquetaEstadoFaltante("fulfilled")).toBe("Cumplido");
  });

  it("parte de la cantidad solicitada cuando todavía no hay cantidad objetivo", () => {
    const f = faltante();
    expect(cantidadDeReferencia(f)).toBe(2);
    expect(siguienteCantidad(f, 1)).toBe(3);
  });

  it("usa la cantidad objetivo cuando ya está definida y nunca baja de 1", () => {
    const f = faltante({ target_quantity: "5", quantity_unit: "unit" });
    expect(siguienteCantidad(f, 1)).toBe(6);
    expect(siguienteCantidad(f, -10)).toBe(1);
  });

  it("usa la cantidad escrita por la auxiliar aunque no declare unidad", () => {
    const f = faltante({
      requested_quantity: "10",
      requested_unit: null,
      declared_quantity: "10",
      declared_unit: null,
    });
    expect(cantidadReportadaExplicita(f)).toBe(10); // valor inicial de «A cotizar»
    expect(unidadDeAjuste(f)).toBe("unit"); // genérica: no supone caja ni comprimido
    expect(siguienteCantidad(f, 1)).toBe(11); // + desde 10, no desde 1
    expect(siguienteCantidad(f, -1)).toBe(9);
  });

  it("la unidad genérica de D-147 no es una cantidad reportada por la auxiliar", () => {
    const f = faltante({
      requested_quantity: "1",
      requested_unit: "unit",
      declared_quantity: "1",
      declared_unit: "unit",
      requested_quantity_origin: "default",
    });
    expect(cantidadReportadaExplicita(f)).toBeNull();
  });

  it("sin cantidad informada no se inventa un valor inicial ni una unidad", () => {
    const f = faltante({
      requested_quantity: null,
      requested_unit: null,
      declared_quantity: null,
      declared_unit: null,
    });
    expect(cantidadReportadaExplicita(f)).toBeNull();
    expect(unidadDeAjuste(f)).toBeNull(); // nada que ajustar todavía
  });

  it("solo ajusta con una unidad que el backend acepta, sin inventarla", () => {
    expect(unidadDeAjuste(faltante({ quantity_unit: "unit" }))).toBe("unit");
    expect(unidadDeAjuste(faltante({ quantity_unit: null, requested_unit: "box" }))).toBe("box");
    expect(
      unidadDeAjuste(
        faltante({ quantity_unit: null, requested_unit: "caja", declared_unit: "docena" }),
      ),
    ).toBeNull();
  });

  it("fija 1 con la unidad genérica solo cuando nadie declaró una unidad comercial", () => {
    const sinUnidad = faltante({ quantity_unit: null, requested_unit: null, declared_unit: null });
    // Reporte sin cantidad ni unidad + oferta sin unidad (FarmaLoop): 1 `unit`, no una caja supuesta.
    expect(unidadParaAsociar(sinUnidad, null)).toBe("unit");
    expect(unidadParaAsociar({ ...sinUnidad, quantity_unit: "unit" }, null)).toBe("unit");
    // Una unidad comercial solo se usa si el reporte la declaró y la oferta coincide.
    expect(unidadParaAsociar({ ...sinUnidad, requested_unit: "box" }, "box")).toBe("box");
    expect(unidadParaAsociar({ ...sinUnidad, quantity_unit: "unit" }, "box")).toBeNull();
    expect(unidadParaAsociar({ ...sinUnidad, requested_unit: "box" }, null)).toBeNull();
    expect(unidadParaAsociar(sinUnidad, "box")).toBeNull();
  });

  it("el sondeo no pisa una fila más nueva que la respuesta recibida", () => {
    const previo = faltante({ version: 5, target_quantity: "3", quantity_unit: "box" });
    const recibido = faltante({ version: 4, target_quantity: "1", quantity_unit: "box" });
    expect(fusionarFaltantes([previo], [recibido])[0]?.target_quantity).toBe("3");
  });

  it("conserva la fila mientras hay una mutación en curso", () => {
    const previo = faltante({ version: 3, target_quantity: null });
    const recibido = faltante({ version: 4, target_quantity: "1", quantity_unit: "box" });
    const fusion = fusionarFaltantes([previo], [recibido], new Set(["f-1"]));
    expect(fusion[0]?.target_quantity).toBeNull();
    expect(fusion[0]?.version).toBe(3);
  });

  it("oculta de la bandeja solo lo que el backend declara cubierto por un carrito activo", () => {
    const pendiente = faltante({ id: "f-1", replenishment_state: "pending", quoted_quantity: "0" });
    const enCarrito = faltante({
      id: "f-2",
      replenishment_state: "in_quote",
      quoted_quantity: "1",
    });
    const sinDatos = faltante({ id: "f-3" });
    expect(visiblesEnBandeja([pendiente, enCarrito, sinDatos]).map((f) => f.id)).toEqual([
      "f-1",
      "f-3",
    ]);
    // Si el backend antiguo no envía el estado, la cantidad cotizada decide; sin dato, se muestra.
    expect(visiblesEnBandeja([faltante({ quoted_quantity: "2" })])).toHaveLength(0);
  });

  it("aplica la cantidad guardada sin perder autor ni sucursal", () => {
    const previo = faltante();
    const resultado = aplicarCambioCantidad(previo, {
      target_quantity: "4",
      quantity_unit: "box",
      version: 4,
      reported_by_name: null,
      branch_label: null,
    });
    expect(resultado.target_quantity).toBe("4");
    expect(resultado.version).toBe(4);
    expect(resultado.reported_by_name).toBe("Pato");
    expect(resultado.branch_label).toBe("Parque Lantaño");
  });
});

describe("presentación de nombres extensos", () => {
  it("usa el encabezado y los detalles del backend sin perder información", () => {
    const partes = partesDelFaltante(
      faltante({
        display_name: "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido x 30",
        display_parts: {
          name: "Tramadol clorhidrato paracetamol",
          details: ["37.5 mg", "325 mg", "comprimido", "x 30"],
        },
      }),
    );
    expect(partes.titulo).toBe("Tramadol clorhidrato paracetamol");
    expect(partes.detalles).toEqual(["37.5 mg", "325 mg", "comprimido", "x 30"]);
    expect([partes.titulo, ...partes.detalles].join(" ")).toBe(
      "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido x 30",
    );
  });

  it("recurre a display_name cuando el backend no entrega display_parts", () => {
    expect(partesDelFaltante(faltante({ display_parts: null }))).toEqual({
      titulo: "Omeprazol 20 mg",
      detalles: [],
    });
    expect(partesDelFaltante(faltante())).toEqual({
      titulo: "Omeprazol 20 mg",
      detalles: [],
    });
  });

  it("descarta detalles vacíos y cae al nombre completo si falta el encabezado", () => {
    expect(
      partesDelFaltante(faltante({ display_parts: { name: "  ", details: ["20 mg"] } })),
    ).toEqual({ titulo: "Omeprazol 20 mg", detalles: [] });
    expect(
      partesDelFaltante(
        faltante({ display_parts: { name: "Omeprazol", details: [" 20 mg ", ""] } }),
      ).detalles,
    ).toEqual(["20 mg"]);
  });
});

describe("consulta enviada a las cadenas", () => {
  it("usa el nombre comercial corto que entrega el backend", () => {
    const f = faltante({
      display_name: "Predual comprimido x 10",
      display_parts: { name: "Predual", details: ["comprimido", "x 10"] },
      search_query: "Predual",
    });
    expect(consultaDeBusqueda(f)).toBe("Predual");
  });

  it("cae al encabezado del nombre si el backend anterior no trae search_query", () => {
    const f = faltante({
      display_name: "Predual comprimido x 10",
      display_parts: { name: "Predual", details: ["comprimido", "x 10"] },
    });
    expect(consultaDeBusqueda(f)).toBe("Predual");
  });

  it("cae al nombre completo solo cuando no hay encabezado", () => {
    expect(consultaDeBusqueda(faltante({ display_parts: null }))).toBe("Omeprazol 20 mg");
  });

  it("ignora un search_query vacío y no inventa una consulta", () => {
    const f = faltante({ search_query: "   " });
    expect(consultaDeBusqueda(f)).toBe("Omeprazol 20 mg");
  });
});

describe("consulta completa con respaldo corto", () => {
  const conNombreLargo = faltante({
    display_name: "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido x 30",
    display_parts: {
      name: "Tramadol clorhidrato paracetamol",
      details: ["37.5 mg", "325 mg", "comprimido", "x 30"],
    },
    search_query: "Tramadol",
  });

  it("prefiere search_query_full y conserva los datos registrados", () => {
    const f = {
      ...conNombreLargo,
      search_query_full: "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido 30",
    };
    expect(consultaCompletaDeBusqueda(f)).toBe(
      "Tramadol clorhidrato paracetamol 37.5 mg 325 mg comprimido 30",
    );
    // La consulta corta no cambia: sigue siendo el respaldo por fuente.
    expect(consultaDeBusqueda(f)).toBe("Tramadol");
  });

  it("cae a la consulta corta si un backend anterior no envía search_query_full", () => {
    expect(consultaCompletaDeBusqueda(conNombreLargo)).toBe("Tramadol");
    expect(consultaCompletaDeBusqueda({ ...conNombreLargo, search_query_full: "   " })).toBe(
      "Tramadol",
    );
  });

  it("recorta por palabra al límite aceptado sin dejar consultas a medias", () => {
    // Cada tramo mide 12 caracteres: el corte cae exactamente en un espacio.
    const palabra = "ibuprofeno40";
    const larga = Array.from({ length: 30 }, () => palabra).join(" ");
    const consulta = consultaCompletaDeBusqueda({
      ...conNombreLargo,
      search_query_full: larga,
    });

    expect(consulta.length).toBeLessThanOrEqual(MAX_CONSULTA_BUSQUEDA);
    expect(consulta).toBe(consulta.trimEnd());
    expect(consulta.split(" ")).toHaveLength(
      Math.floor((MAX_CONSULTA_BUSQUEDA + 1) / (palabra.length + 1)),
    );
    expect(larga.startsWith(consulta)).toBe(true);
  });

  it("corta seco cuando no hay espacios para recortar", () => {
    const sinEspacios = "x".repeat(MAX_CONSULTA_BUSQUEDA + 50);
    expect(consultaCompletaDeBusqueda({ ...conNombreLargo, search_query_full: sinEspacios })).toBe(
      "x".repeat(MAX_CONSULTA_BUSQUEDA),
    );
  });
});

describe("búsqueda y carrito", () => {
  it("finds Losartán by partial name and dose without accents", () => {
    expect(buscarProducto("losartan 50")?.id).toBe("losartan");
  });

  it("cart total adds only complete lines and counts pending ones", () => {
    const r = totalCarrito([
      { productoId: "losartan", proveedor: "Proveedor Y", cantidad: 10 },
      { productoId: "paracetamol", proveedor: "Proveedor Y", cantidad: 5 },
    ]);
    expect(r).toEqual({ total: 20500, pendientes: 1 });
  });
});
