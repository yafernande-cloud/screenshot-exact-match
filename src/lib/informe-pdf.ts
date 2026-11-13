/**
 * Orden de compra en PDF.
 *
 * El documento se construye solo con la orden congelada que devuelve el backend al finalizar:
 * no consulta ofertas actuales, no recalcula precios y no modifica ninguna cotización. Las
 * funciones de agrupación y formato son puras para poder probarlas sin abrir una ventana.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { describirCantidad, formatearCantidad, formatearDinero } from "@/lib/catalogo";
import {
  describirCantidades,
  resumenDeInforme,
  type Dinero,
  type InformeCotizacion,
  type ItemInforme,
  type ProveedorInforme,
} from "@/lib/cotizacion-api";

const VERDE: [number, number, number] = [23, 132, 95]; // #17845F
const AZUL: [number, number, number] = [39, 113, 138]; // #27718A
const TEXTO: [number, number, number] = [48, 60, 64];
const SUAVE: [number, number, number] = [242, 248, 246];
const BORDE: [number, number, number] = [220, 230, 227];
const MARGEN = 14;
const MARGEN_INFERIOR = 18;
const TOPE_SEGUNDA_PAGINA = 24;

type DocumentoTabla = jsPDF & { lastAutoTable?: { finalY?: number } };

export interface GrupoProveedorInforme {
  supplier: ProveedorInforme;
  items: ItemInforme[];
}

function fechaLarga(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "fecha no informada";
  return fecha.toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
}

function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "fecha no informada";
  return fecha.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
}

function nombreProveedor(nombre: string | null): string {
  return nombre?.trim() || "Proveedor sin nombre";
}

/** Nombre visible del producto; si no hay nombre se usa el código, nunca uno inventado. */
export function nombreProductoInforme(item: ItemInforme): string {
  const nombre = item.product.name?.trim();
  if (nombre) return nombre;
  const codigo = item.product.code?.trim();
  return codigo ? `Código ${codigo}` : "Producto sin nombre";
}

/** Datos publicados del producto que acompañan la fila del PDF. */
export function detalleProductoInforme(item: ItemInforme): string {
  const partes = [item.product.laboratory, item.product.presentation]
    .map((valor) => valor?.trim())
    .filter((valor): valor is string => Boolean(valor));
  const codigo = item.product.code?.trim();
  if (codigo) partes.push(`Código ${codigo}`);
  return partes.join(" · ") || "Sin datos publicados";
}

/** Cantidad con unidad solo si está informada; una unidad NULL se muestra como la cifra sola. */
export function cantidadInforme(item: ItemInforme): string {
  return describirCantidad(item.quantity.value, item.quantity.unit) ?? item.quantity.value;
}

/** Fila de la tabla, con los importes congelados tal como los entregó el backend. */
export function filaInforme(item: ItemInforme): string[] {
  return [
    `${nombreProductoInforme(item)}\n${detalleProductoInforme(item)}`,
    nombreProveedor(item.supplier_name),
    cantidadInforme(item),
    formatearDinero(item.unit_price) ?? "Sin precio",
    formatearDinero(item.subtotal) ?? "Pendiente",
  ];
}

/** Agrupa por proveedor conservando el orden del informe y sus subtotales originales. */
export function agruparLineasPorProveedor(informe: InformeCotizacion): GrupoProveedorInforme[] {
  const itemsPorProveedor = new Map<string, ItemInforme[]>();
  for (const item of informe.items) {
    const lista = itemsPorProveedor.get(item.supplier_id) ?? [];
    lista.push(item);
    itemsPorProveedor.set(item.supplier_id, lista);
  }

  const grupos: GrupoProveedorInforme[] = [];
  for (const supplier of informe.suppliers) {
    const items = itemsPorProveedor.get(supplier.supplier_id) ?? [];
    if (items.length > 0) {
      grupos.push({ supplier, items });
      itemsPorProveedor.delete(supplier.supplier_id);
    }
  }

  // Un informe congelado siempre debería traer sus proveedores, pero si falta uno no se pierde
  // ninguna línea: se muestra como un grupo sin subtotal calculado.
  for (const [supplierId, items] of itemsPorProveedor) {
    if (items.length === 0) continue;
    grupos.push({
      supplier: {
        supplier_id: supplierId,
        supplier_name: items[0]?.supplier_name ?? null,
        line_count: items.length,
        subtotal: null,
      },
      items,
    });
  }
  return grupos;
}

/** Texto legible de un aviso; el informe puede traerlo como texto o como objeto de precio. */
function textoAviso(aviso: unknown): string {
  if (typeof aviso === "string") return aviso;
  if (aviso && typeof aviso === "object") {
    const objeto = aviso as Record<string, unknown>;
    const estado = typeof objeto["price_state"] === "string" ? objeto["price_state"] : "";
    const causas = Array.isArray(objeto["causes"])
      ? objeto["causes"]
          .map((causa) => (typeof causa === "string" ? causa : String(causa)))
          .join(", ")
      : "";
    return [estado, causas].filter(Boolean).join(" · ") || "Aviso de la orden de compra";
  }
  return String(aviso);
}

export function nombreArchivoInforme(informe: InformeCotizacion): string {
  const etiqueta = informe.label?.trim() || `COT-${String(informe.number).padStart(6, "0")}`;
  return `Orden-de-Compra-${etiqueta.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`;
}

function asegurarEspacio(doc: jsPDF, y: number, necesario: number): number {
  const alto = doc.internal.pageSize.getHeight();
  return y + necesario > alto - MARGEN_INFERIOR ? TOPE_SEGUNDA_PAGINA : y;
}

function escribirParrafos(doc: jsPDF, y: number, parrafos: string[], ancho: number): number {
  const alto = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXTO);
  for (const parrafo of parrafos) {
    const lineas = doc.splitTextToSize(parrafo, ancho);
    for (const linea of lineas) {
      if (y > alto - MARGEN_INFERIOR - 4) {
        doc.addPage();
        y = TOPE_SEGUNDA_PAGINA;
      }
      doc.text(linea, MARGEN, y);
      y += 4.2;
    }
    y += 1.5;
  }
  return y;
}

function dibujarSeccion(
  doc: jsPDF,
  y: number,
  titulo: string,
  parrafos: string[],
  ancho: number,
): number {
  y = asegurarEspacio(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...AZUL);
  doc.text(titulo, MARGEN, y);
  y += 5;
  y = escribirParrafos(doc, y, parrafos, ancho);
  return y + 3;
}

function dibujarCabecera(doc: jsPDF, informe: InformeCotizacion, ancho: number): number {
  const anchoUtil = ancho - MARGEN * 2;

  doc.setFillColor(...AZUL);
  doc.rect(0, 0, ancho, 5, "F");
  doc.setFillColor(...VERDE);
  doc.rect(0, 5, ancho, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...AZUL);
  doc.text("ORDEN DE COMPRA", MARGEN, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(92, 104, 108);
  doc.text("Orden de compra. No es una factura tributaria.", MARGEN, 22.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...VERDE);
  doc.text(`Orden de compra ${informe.label}`, ancho - MARGEN, 17, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(92, 104, 108);
  doc.text(`N.º ${informe.number}`, ancho - MARGEN, 22, { align: "right" });
  doc.text(`Finalizado: ${fechaLarga(informe.finalized_at)}`, ancho - MARGEN, 26.5, {
    align: "right",
  });

  let yIzquierda = 30;
  if (informe.title?.trim()) {
    const lineas = doc.splitTextToSize(informe.title.trim(), anchoUtil - 80);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...TEXTO);
    doc.text(lineas, MARGEN, yIzquierda);
    yIzquierda += lineas.length * 4.2;
  }

  const yLinea = Math.max(yIzquierda + 2, 32);
  doc.setDrawColor(...VERDE);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, yLinea, ancho - MARGEN, yLinea);

  const yResumen = yLinea + 4;
  doc.setFillColor(...SUAVE);
  doc.roundedRect(MARGEN, yResumen, anchoUtil, 14, 2, 2, "F");

  const resumen = resumenDeInforme(informe);
  const columnas: Array<[string, string]> = [
    ["PROVEEDORES", String(informe.suppliers.length)],
    ["REFERENCIAS", String(resumen.referencias)],
    ["PRODUCTOS DISTINTOS", String(resumen.productosDistintos)],
    ["MONEDA", informe.currency || "No informada"],
  ];
  columnas.forEach(([rotulo, valor], indice) => {
    const x = MARGEN + 5 + indice * (anchoUtil / 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(105, 118, 122);
    doc.text(rotulo, x, yResumen + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...AZUL);
    doc.text(valor, x, yResumen + 10.5);
  });

  // Cantidades por unidad comercial: se enumeran cuando hay más de una y nunca se suman entre sí.
  // La unidad desconocida va entre paréntesis, igual que en «Ver vista», sin alterar el valor.
  const cantidades = describirCantidades(resumen, "parentesis");
  if (cantidades) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(92, 104, 108);
    doc.text(`Cantidades solicitadas: ${cantidades}`, MARGEN, yResumen + 19);
    return yResumen + 24;
  }
  return yResumen + 20;
}

function dibujarEncabezadoProveedor(
  doc: jsPDF,
  grupo: GrupoProveedorInforme,
  y: number,
  ancho: number,
): number {
  const anchoUtil = ancho - MARGEN * 2;
  doc.setFillColor(237, 245, 243);
  doc.roundedRect(MARGEN, y, anchoUtil, 9, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...AZUL);
  const nombre = doc.splitTextToSize(
    nombreProveedor(grupo.supplier.supplier_name),
    anchoUtil - 78,
  )[0];
  doc.text(nombre ?? "Proveedor sin nombre", MARGEN + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(92, 104, 108);
  const cantidad = grupo.items.length;
  const subtotal = formatearDinero(grupo.supplier.subtotal) ?? "Subtotal pendiente";
  doc.text(
    `${cantidad} ${cantidad === 1 ? "referencia" : "referencias"} · ${subtotal}`,
    ancho - MARGEN - 4,
    y + 6,
    { align: "right" },
  );
  return y + 12;
}

function dibujarTotales(
  doc: jsPDF,
  grupos: GrupoProveedorInforme[],
  y: number,
  ancho: number,
  total: Dinero | null,
): number {
  y = asegurarEspacio(doc, y, 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...AZUL);
  doc.text("Subtotales por proveedor", MARGEN, y);
  y += 6;

  doc.setFontSize(8.5);
  for (const grupo of grupos) {
    if (y > doc.internal.pageSize.getHeight() - MARGEN_INFERIOR - 8) {
      doc.addPage();
      y = TOPE_SEGUNDA_PAGINA;
    }
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXTO);
    doc.text(nombreProveedor(grupo.supplier.supplier_name), MARGEN + 2, y);
    doc.text(formatearDinero(grupo.supplier.subtotal) ?? "Subtotal pendiente", ancho - MARGEN, y, {
      align: "right",
    });
    y += 4.8;
  }

  if (y > doc.internal.pageSize.getHeight() - MARGEN_INFERIOR - 12) {
    doc.addPage();
    y = TOPE_SEGUNDA_PAGINA;
  }
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.2);
  doc.line(MARGEN, y, ancho - MARGEN, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...AZUL);
  doc.text("Total general", MARGEN, y);
  doc.setTextColor(...VERDE);
  doc.text(formatearDinero(total) ?? "No calculable", ancho - MARGEN, y, { align: "right" });
  return y + 9;
}

function dibujarPies(doc: jsPDF, informe: InformeCotizacion, ancho: number): void {
  const totalPaginas = doc.getNumberOfPages();
  const alto = doc.internal.pageSize.getHeight();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);

    if (pagina > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...AZUL);
      doc.text(`Orden de compra ${informe.label}`, MARGEN, 11);
      doc.setTextColor(105, 118, 122);
      doc.text(fechaCorta(informe.finalized_at), ancho - MARGEN, 11, { align: "right" });
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.2);
      doc.line(MARGEN, 14, ancho - MARGEN, 14);
    }

    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, alto - 15, ancho - MARGEN, alto - 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 134);
    doc.text("Orden de compra. No es una factura tributaria.", MARGEN, alto - 10);
    doc.text(`Página ${pagina} de ${totalPaginas}`, ancho - MARGEN, alto - 10, {
      align: "right",
    });
  }
}

/** Construye el documento A4; no modifica el informe recibido. */
export function construirInformePdf(informe: InformeCotizacion): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const anchoUtil = ancho - MARGEN * 2;

  let y = dibujarCabecera(doc, informe, ancho);
  const grupos = agruparLineasPorProveedor(informe);

  if (grupos.length === 0) {
    y = dibujarSeccion(
      doc,
      y,
      "Referencias",
      ["La orden de compra no contiene productos."],
      anchoUtil,
    );
  } else {
    for (const grupo of grupos) {
      y = asegurarEspacio(doc, y, 30);
      y = dibujarEncabezadoProveedor(doc, grupo, y, ancho);
      autoTable(doc, {
        startY: y,
        head: [["Producto", "Proveedor", "Cantidad", "Precio unit.", "Subtotal"]],
        body: grupo.items.map(filaInforme),
        margin: {
          top: TOPE_SEGUNDA_PAGINA,
          right: MARGEN,
          bottom: MARGEN_INFERIOR,
          left: MARGEN,
        },
        theme: "grid",
        showHead: "everyPage",
        rowPageBreak: "avoid",
        styles: {
          font: "helvetica",
          fontSize: 8.2,
          cellPadding: 2.2,
          textColor: TEXTO,
          lineColor: BORDE,
          lineWidth: 0.1,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: AZUL,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [247, 251, 249] },
        columnStyles: {
          0: { cellWidth: 82 },
          1: { cellWidth: 32 },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 26, halign: "right" },
          4: { cellWidth: 22, halign: "right" },
        },
      });
      const finalY = (doc as DocumentoTabla).lastAutoTable?.finalY;
      y = (finalY ?? y) + 8;
    }
  }

  // El total y las secciones secundarias no se dibujan encima del pie de página.
  if (y > alto - MARGEN_INFERIOR - 40) {
    doc.addPage();
    y = TOPE_SEGUNDA_PAGINA;
  }
  y = dibujarTotales(doc, grupos, y, ancho, informe.total);

  const liberados = informe.release?.released ?? [];
  const pendientes = informe.release?.pending ?? [];

  y = dibujarSeccion(
    doc,
    y,
    "Faltantes liberados",
    [
      liberados.length === 0
        ? "Sin faltantes liberados."
        : `${liberados.length} ${liberados.length === 1 ? "faltante liberado" : "faltantes liberados"}: ${liberados
            .map(
              (faltante) =>
                describirCantidad(faltante.quantity, faltante.quantity_unit) ?? faltante.quantity,
            )
            .join(
              ", ",
            )}. Una vez liberados, la misma persona puede volver a reportarlos por Telegram como un faltante independiente; el historial anterior se conserva.`,
    ],
    anchoUtil,
  );

  const detallePendientes = pendientes
    .map((faltante) => {
      const partes: string[] = [];
      if (faltante.allocated_quantity && faltante.target_quantity) {
        return `cubierto ${formatearCantidad(faltante.allocated_quantity) ?? faltante.allocated_quantity} de ${formatearCantidad(faltante.target_quantity) ?? faltante.target_quantity}`;
      }
      if (faltante.allocated_quantity) {
        return `cubierto ${formatearCantidad(faltante.allocated_quantity) ?? faltante.allocated_quantity}`;
      }
      if (faltante.target_quantity) {
        return `pedido ${formatearCantidad(faltante.target_quantity) ?? faltante.target_quantity}`;
      }
      return "";
    })
    .filter(Boolean);

  y = dibujarSeccion(
    doc,
    y,
    "Faltantes pendientes",
    [
      pendientes.length === 0
        ? "Sin faltantes pendientes."
        : `${pendientes.length} ${pendientes.length === 1 ? "faltante pendiente" : "faltantes pendientes"}: la cobertura de lo cotizado todavía no completa la cantidad pedida.${detallePendientes.length > 0 ? ` ${detallePendientes.join("; ")}.` : ""}`,
    ],
    anchoUtil,
  );

  const avisos = (informe.warnings ?? []).map(textoAviso).filter(Boolean);
  if (avisos.length > 0) {
    y = dibujarSeccion(doc, y, "Avisos de la orden de compra", avisos, anchoUtil);
  }

  if (informe.note?.trim()) {
    dibujarSeccion(doc, y, "Nota", [informe.note.trim()], anchoUtil);
  }

  dibujarPies(doc, informe, ancho);
  return doc;
}

/** Genera el archivo PDF listo para abrir o descargar. */
export function generarInformePdf(informe: InformeCotizacion): Blob {
  return construirInformePdf(informe).output("blob");
}

/** Descarga explícita: solo se llama desde una acción visible de la persona. */
export function descargarInformePdf(url: string, nombreArchivo: string): void {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.rel = "noopener";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}
