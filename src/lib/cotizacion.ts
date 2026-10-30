import { productos, type Producto, type Proveedor } from "@/data/demo";

/** Una línea del carrito: un producto en el carrito de un proveedor. */
export interface Linea { productoId: string; proveedor: string; cantidad: number }

export const carritoInicial: Linea[] = [
  { productoId: "paracetamol", proveedor: "Proveedor X", cantidad: 20 },
  { productoId: "nivea", proveedor: "Proveedor X", cantidad: 3 },
  { productoId: "losartan", proveedor: "Proveedor Y", cantidad: 10 },
  { productoId: "fructis", proveedor: "Proveedor Y", cantidad: 4 },
  { productoId: "encrespador", proveedor: "Proveedor Y", cantidad: 2 },
  { productoId: "alcohol", proveedor: "Proveedor Z", cantidad: 2 },
];

export function buscarOferta(productoId: string, proveedor: string): { producto: Producto; oferta: Proveedor } | null {
  const producto = productos.find((p) => p.id === productoId);
  const oferta = producto?.proveedores.find((o) => o.nombre === proveedor);
  return producto && oferta ? { producto, oferta } : null;
}

/** Proveedores que tienen una oferta de demostración para el producto. */
export const proveedoresCon = (productoId: string) =>
  productos.find((p) => p.id === productoId)?.proveedores.map((o) => o.nombre) ?? [];

/** Agrega o actualiza la cantidad, sin duplicar el producto en el mismo proveedor. */
export function agregar(lineas: Linea[], productoId: string, proveedor: string, cantidad: number): Linea[] {
  if (!buscarOferta(productoId, proveedor)) return lineas;
  const q = Math.max(1, Math.floor(cantidad));
  const existe = lineas.some((l) => l.productoId === productoId && l.proveedor === proveedor);
  return existe
    ? lineas.map((l) => (l.productoId === productoId && l.proveedor === proveedor ? { ...l, cantidad: q } : l))
    : [...lineas, { productoId, proveedor, cantidad: q }];
}

export function cambiarCantidad(lineas: Linea[], productoId: string, proveedor: string, cantidad: number): Linea[] {
  return lineas.map((l) => (l.productoId === productoId && l.proveedor === proveedor ? { ...l, cantidad: Math.max(1, Math.floor(cantidad)) } : l));
}

export const quitar = (lineas: Linea[], productoId: string, proveedor: string) =>
  lineas.filter((l) => !(l.productoId === productoId && l.proveedor === proveedor));

export const vaciar = (lineas: Linea[], proveedor: string) => lineas.filter((l) => l.proveedor !== proveedor);

/** Mueve un producto a otro proveedor solo si ese proveedor tiene una oferta para el producto. */
export function mover(lineas: Linea[], productoId: string, desde: string, hacia: string): Linea[] {
  if (desde === hacia || !buscarOferta(productoId, hacia)) return lineas;
  const linea = lineas.find((l) => l.productoId === productoId && l.proveedor === desde);
  if (!linea) return lineas;
  const destino = lineas.find((l) => l.productoId === productoId && l.proveedor === hacia);
  const sinOrigen = quitar(lineas, productoId, desde);
  return destino
    ? sinOrigen.map((l) => (l === destino ? { ...l, cantidad: l.cantidad + linea.cantidad } : l))
    : [...sinOrigen, { ...linea, proveedor: hacia }];
}

export type EstadoLinea =
  | { ok: true; subtotal: number }
  | { ok: false; motivo: "no-verificada" | "sin-precio" | "incompleta" | "bajo-minimo"; texto: string };

export function evaluarLinea(l: Linea): EstadoLinea {
  const r = buscarOferta(l.productoId, l.proveedor);
  if (!r) return { ok: false, motivo: "incompleta", texto: "Oferta no encontrada" };
  const o = r.oferta;
  if (o.estado === "pendiente") return { ok: false, motivo: "no-verificada", texto: "Oferta pendiente de revisión" };
  if (o.precioUnitario === null) return { ok: false, motivo: "sin-precio", texto: "Sin precio informado" };
  if (o.minimo !== null && l.cantidad < o.minimo) return { ok: false, motivo: "bajo-minimo", texto: `No cumple el mínimo de ${o.minimo} unidades` };
  if (o.estado !== "completa") return { ok: false, motivo: "incompleta", texto: "Condiciones comerciales pendientes" };
  return { ok: true, subtotal: o.precioUnitario * l.cantidad };
}

/** Subtotal del proveedor solo cuando todas sus líneas tienen información completa. */
export function subtotalProveedor(lineas: Linea[], proveedor: string): number | null {
  const propias = lineas.filter((l) => l.proveedor === proveedor);
  if (propias.length === 0) return null;
  let total = 0;
  for (const l of propias) {
    const e = evaluarLinea(l);
    if (!e.ok) return null;
    total += e.subtotal;
  }
  return total;
}

export function agrupar(lineas: Linea[]): { proveedor: string; lineas: Linea[] }[] {
  const orden: string[] = [];
  for (const l of lineas) if (!orden.includes(l.proveedor)) orden.push(l.proveedor);
  return orden.sort((a, b) => a.localeCompare(b, "es")).map((proveedor) => ({ proveedor, lineas: lineas.filter((l) => l.proveedor === proveedor) }));
}

/** Resumen general: nunca entrega un total definitivo si algún carrito está incompleto. */
export function resumen(lineas: Linea[]) {
  const grupos = agrupar(lineas);
  const subtotales = grupos.map((g) => subtotalProveedor(lineas, g.proveedor));
  const confirmado = subtotales.reduce<number>((a, s) => a + (s ?? 0), 0);
  const pendientes = subtotales.filter((s) => s === null).length;
  return { productos: lineas.length, proveedores: grupos.length, confirmado, pendientes, total: pendientes === 0 && grupos.length > 0 ? confirmado : null };
}
