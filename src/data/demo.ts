import cruzVerde from "@/assets/cruz-verde.png.asset.json";
import salcobrand from "@/assets/salcobrand.svg.asset.json";
import ahumada from "@/assets/ahumada.png.asset.json";

export type Estado = "completa" | "parcial" | "pendiente";
export type CadenaId = "cruzverde" | "salcobrand" | "ahumada";

export const cadenasInfo: Record<CadenaId, { nombre: string; logo: string }> = {
  cruzverde: { nombre: "Cruz Verde", logo: cruzVerde.url },
  salcobrand: { nombre: "Salcobrand", logo: salcobrand.url },
  ahumada: { nombre: "Farmacias Ahumada", logo: ahumada.url },
};

export interface Cadena { id: CadenaId; precio: number; presentacion: string; fecha: string }
export interface Proveedor {
  nombre: string;
  logo?: string;
  precioUnitario: number | null;
  minimo: number | null;
  presentacion: string;
  disponibilidad: string | null;
  condiciones: string;
  estado: Estado;
  /** Datos que faltan para calcular un costo total */
  faltantes: string[];
}
export interface Producto { id: string; nombre: string; presentacion: string; categoria: string; cadenas: Cadena[]; proveedores: Proveedor[] }

export const productos: Producto[] = [
  {
    id: "losartan", nombre: "Losartán 50 mg", presentacion: "Caja 30 comprimidos", categoria: "Medicamento",
    cadenas: [
      { id: "cruzverde", precio: 4990, presentacion: "Caja 30 comp.", fecha: "2026-10-27" },
      { id: "salcobrand", precio: 5490, presentacion: "Caja 30 comp.", fecha: "2026-10-26" },
      { id: "ahumada", precio: 4590, presentacion: "Caja 30 comp.", fecha: "2026-10-25" },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes", precioUnitario: 2100, minimo: 20, presentacion: "Caja 30 comp.", disponibilidad: "En stock", condiciones: "Despacho 48 h incluido · IVA incluido", estado: "completa", faltantes: [] },
      { nombre: "Droguería Pacífico", precioUnitario: 1950, minimo: null, presentacion: "Caja 30 comp.", disponibilidad: null, condiciones: "Pago a 30 días", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA", "Cantidad mínima de compra"] },
      { nombre: "Laboratorio Sur", precioUnitario: null, minimo: null, presentacion: "Caja 30 comp.", disponibilidad: null, condiciones: "Sin información comercial", estado: "pendiente", faltantes: ["Precio unitario", "Disponibilidad", "Costo de despacho", "Condiciones de compra"] },
    ],
  },
  {
    id: "paracetamol", nombre: "Paracetamol 500 mg", presentacion: "Caja 16 comprimidos", categoria: "Medicamento",
    cadenas: [
      { id: "cruzverde", precio: 1290, presentacion: "Caja 16 comp.", fecha: "2026-10-27" },
      { id: "salcobrand", precio: 1490, presentacion: "Caja 16 comp.", fecha: "2026-10-27" },
      { id: "ahumada", precio: 990, presentacion: "Caja 16 comp.", fecha: "2026-10-24" },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes", precioUnitario: 380, minimo: 100, presentacion: "Caja 16 comp.", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", estado: "completa", faltantes: [] },
      { nombre: "Droguería Pacífico", precioUnitario: 350, minimo: 50, presentacion: "Caja 16 comp.", disponibilidad: "Stock limitado", condiciones: "Despacho semanal", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA"] },
    ],
  },
  {
    id: "shampoo", nombre: "Shampoo Hidratante Suave", presentacion: "Frasco 400 ml", categoria: "Cuidado personal",
    cadenas: [
      { id: "cruzverde", precio: 5990, presentacion: "400 ml", fecha: "2026-10-26" },
      { id: "salcobrand", precio: 6490, presentacion: "400 ml", fecha: "2026-10-25" },
      { id: "ahumada", precio: 6190, presentacion: "400 ml", fecha: "2026-10-24" },
    ],
    proveedores: [
      { nombre: "Cosmética Total", precioUnitario: 2800, minimo: 12, presentacion: "400 ml", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", estado: "completa", faltantes: [] },
      { nombre: "Distribuidora Andes", precioUnitario: null, minimo: null, presentacion: "400 ml", disponibilidad: null, condiciones: "Precio por confirmar", estado: "pendiente", faltantes: ["Precio unitario", "Disponibilidad", "Costo de despacho"] },
    ],
  },
  {
    id: "cepillo", nombre: "Cepillo de pelo desenredante", presentacion: "1 unidad", categoria: "Accesorios",
    cadenas: [
      { id: "cruzverde", precio: 3990, presentacion: "1 unidad", fecha: "2026-10-22" },
      { id: "ahumada", precio: 3490, presentacion: "1 unidad", fecha: "2026-10-21" },
    ],
    proveedores: [
      { nombre: "Accesorios Beauty", precioUnitario: 1500, minimo: 24, presentacion: "1 unidad", disponibilidad: "En stock", condiciones: "Pago contado", estado: "parcial", faltantes: ["Costo de despacho"] },
    ],
  },
  {
    id: "vet", nombre: "Antiparasitario canino", presentacion: "Pipeta 10–20 kg", categoria: "Veterinario",
    cadenas: [
      { id: "salcobrand", precio: 8990, presentacion: "1 pipeta", fecha: "2026-10-26" },
      { id: "cruzverde", precio: 9490, presentacion: "1 pipeta", fecha: "2026-10-20" },
    ],
    proveedores: [
      { nombre: "VetDistribución", precioUnitario: 4900, minimo: 6, presentacion: "1 pipeta", disponibilidad: "En stock", condiciones: "Despacho 72 h incluido · IVA incluido", estado: "completa", faltantes: [] },
      { nombre: "Droguería Pacífico", precioUnitario: 4600, minimo: null, presentacion: "1 pipeta", disponibilidad: null, condiciones: "Sin condiciones informadas", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA", "Cantidad mínima de compra"] },
    ],
  },
];

export const clp = (n: number) => "$" + n.toLocaleString("es-CL");

/** Total referencial solo si la información está completa y se cumple el mínimo. */
export function totalProveedor(p: Proveedor, cantidad: number): { total: number } | { pendiente: string } {
  if (p.estado !== "completa" || p.precioUnitario === null) return { pendiente: "Total pendiente: falta información" };
  if (p.minimo !== null && cantidad < p.minimo) return { pendiente: `Total pendiente: mínimo ${p.minimo} unidades` };
  return { total: p.precioUnitario * cantidad };
}
