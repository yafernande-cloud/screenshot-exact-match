export type Estado = "verificada" | "parcial" | "pendiente";
export interface Cadena { nombre: string; precio: number; presentacion: string; fecha: string }
export interface Proveedor { nombre: string; precio: number | null; presentacion: string; disponibilidad: string | null; condiciones: string; estado: Estado }
export interface Producto { id: string; nombre: string; presentacion: string; categoria: string; cadenas: Cadena[]; proveedores: Proveedor[] }

export const productos: Producto[] = [
  {
    id: "losartan", nombre: "Losartán 50 mg", presentacion: "Caja 30 comprimidos", categoria: "Medicamento",
    cadenas: [
      { nombre: "Farmacia Norte (demo)", precio: 4990, presentacion: "Caja 30 comp.", fecha: "2026-10-27" },
      { nombre: "Salud Express (demo)", precio: 5490, presentacion: "Caja 30 comp.", fecha: "2026-10-26" },
      { nombre: "Botica Central (demo)", precio: 4590, presentacion: "Caja 30 comp.", fecha: "2026-10-25" },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes (demo)", precio: 2100, presentacion: "Caja 30 comp.", disponibilidad: "En stock", condiciones: "Pedido mínimo $80.000 · despacho 48 h", estado: "verificada" },
      { nombre: "Droguería Pacífico (demo)", precio: 1950, presentacion: "Caja 30 comp.", disponibilidad: null, condiciones: "Pago a 30 días", estado: "parcial" },
      { nombre: "Laboratorio Sur (demo)", precio: null, presentacion: "Caja 30 comp.", disponibilidad: "Consultar", condiciones: "Sin información de despacho", estado: "pendiente" },
    ],
  },
  {
    id: "paracetamol", nombre: "Paracetamol 500 mg", presentacion: "Caja 16 comprimidos", categoria: "Medicamento",
    cadenas: [
      { nombre: "Farmacia Norte (demo)", precio: 1290, presentacion: "Caja 16 comp.", fecha: "2026-10-27" },
      { nombre: "Salud Express (demo)", precio: 1490, presentacion: "Caja 16 comp.", fecha: "2026-10-27" },
      { nombre: "Botica Central (demo)", precio: 990, presentacion: "Caja 16 comp.", fecha: "2026-10-24" },
      { nombre: "Farmacia Vecina (demo)", precio: 1190, presentacion: "Caja 16 comp.", fecha: "2026-10-23" },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes (demo)", precio: 380, presentacion: "Caja 16 comp.", disponibilidad: "En stock", condiciones: "Descuento 5% sobre 100 unidades", estado: "verificada" },
      { nombre: "Droguería Pacífico (demo)", precio: 350, presentacion: "Caja 16 comp.", disponibilidad: "Stock limitado", condiciones: "Despacho semanal", estado: "verificada" },
    ],
  },
  {
    id: "shampoo", nombre: "Shampoo Hidratante Suave", presentacion: "Frasco 400 ml", categoria: "Cuidado personal",
    cadenas: [
      { nombre: "Farmacia Norte (demo)", precio: 5990, presentacion: "400 ml", fecha: "2026-10-26" },
      { nombre: "Salud Express (demo)", precio: 6490, presentacion: "400 ml", fecha: "2026-10-25" },
    ],
    proveedores: [
      { nombre: "Cosmética Total (demo)", precio: 2800, presentacion: "400 ml", disponibilidad: "En stock", condiciones: "Caja de 12 unidades", estado: "verificada" },
      { nombre: "Distribuidora Andes (demo)", precio: null, presentacion: "400 ml", disponibilidad: null, condiciones: "Precio por confirmar", estado: "pendiente" },
    ],
  },
  {
    id: "cepillo", nombre: "Cepillo de pelo desenredante", presentacion: "1 unidad", categoria: "Accesorios",
    cadenas: [
      { nombre: "Farmacia Norte (demo)", precio: 3990, presentacion: "1 unidad", fecha: "2026-10-22" },
      { nombre: "Botica Central (demo)", precio: 3490, presentacion: "1 unidad", fecha: "2026-10-21" },
    ],
    proveedores: [
      { nombre: "Accesorios Beauty (demo)", precio: 1500, presentacion: "1 unidad", disponibilidad: "En stock", condiciones: "Pedido mínimo 24 unidades", estado: "parcial" },
    ],
  },
  {
    id: "vet", nombre: "Antiparasitario canino (demo)", presentacion: "Pipeta 10–20 kg", categoria: "Veterinario",
    cadenas: [
      { nombre: "Salud Express (demo)", precio: 8990, presentacion: "1 pipeta", fecha: "2026-10-26" },
      { nombre: "Farmacia Vecina (demo)", precio: 9490, presentacion: "1 pipeta", fecha: "2026-10-20" },
    ],
    proveedores: [
      { nombre: "VetDistribución (demo)", precio: 4900, presentacion: "1 pipeta", disponibilidad: "En stock", condiciones: "Despacho 72 h", estado: "verificada" },
      { nombre: "Droguería Pacífico (demo)", precio: 4600, presentacion: "1 pipeta", disponibilidad: null, condiciones: "Sin condiciones informadas", estado: "parcial" },
    ],
  },
];

export const clp = (n: number) => "$" + n.toLocaleString("es-CL");
