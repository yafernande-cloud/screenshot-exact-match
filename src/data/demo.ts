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

export interface Cadena {
  id: CadenaId; precio: number; presentacion: string; fecha: string;
  nombreComercial: string; fabricante?: string; descripcion: string;
  /** Atributos de la ficha: farmacéuticos o comerciales según el producto */
  atributos: [string, string][];
  /** Solo una fotografía confiable del producto exacto; si no, se muestra "Imagen no disponible" */
  imagen?: string;
}
export interface Proveedor {
  nombre: string;
  logo?: string;
  precioUnitario: number | null;
  minimo: number | null;
  presentacion: string;
  disponibilidad: string | null;
  condiciones: string;
  /** Ficha comercial: solo lo que el proveedor informa; lo ausente se muestra como «No informado» */
  producto?: string;
  laboratorio?: string;
  iva?: "incluido" | "no incluido";
  descuento?: string;
  despacho?: string;
  pago?: string;
  otros?: string;
  estado: Estado;
  /** Datos que faltan para calcular un costo total */
  faltantes: string[];
}
export interface Producto { id: string; nombre: string; presentacion: string; categoria: string; cadenas: Cadena[]; proveedores: Proveedor[] }

export const productos: Producto[] = [
  {
    id: "losartan", nombre: "Losartán 50 mg", presentacion: "Caja 30 comprimidos", categoria: "Medicamento",
    cadenas: [
      { id: "cruzverde", precio: 4990, presentacion: "Caja 30 comp.", fecha: "2026-10-27" , nombreComercial: "Losartán (B) 50 mg 30 comprimidos recubiertos", fabricante: "Laboratorio Chile", descripcion: "Antihipertensivo bioequivalente. Venta bajo receta médica.", atributos: [["Principio activo", "Losartán potásico"], ["Forma", "Comprimido recubierto"], ["Dosis", "50 mg"], ["Presentación", "30 comprimidos"]] },
      { id: "salcobrand", precio: 5490, presentacion: "Caja 30 comp.", fecha: "2026-10-26" , nombreComercial: "Losartán Potásico 50 mg x 30 comprimidos recubiertos", fabricante: "Laboratorio Mintlab", descripcion: "Medicamento para la hipertensión arterial. Venta bajo receta médica.", atributos: [["Principio activo", "Losartán potásico"], ["Forma", "Comprimido recubierto"], ["Dosis", "50 mg"], ["Presentación", "30 comprimidos"]] },
      { id: "ahumada", precio: 4590, presentacion: "Caja 30 comp.", fecha: "2026-10-25" , nombreComercial: "Losartán (B) 50 mg caja 30 comprimidos", fabricante: "Laboratorio Andrómaco", descripcion: "Bioequivalente indicado en hipertensión. Venta bajo receta médica.", atributos: [["Principio activo", "Losartán potásico"], ["Forma", "Comprimido recubierto"], ["Dosis", "50 mg"], ["Presentación", "30 comprimidos"]] },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes", precioUnitario: 2100, minimo: 20, presentacion: "Caja 30 comp.", disponibilidad: "En stock", condiciones: "Despacho 48 h incluido · IVA incluido", laboratorio: "Laboratorio Chile", despacho: "Despacho 48 h incluido", iva: "incluido", descuento: "3% por pago al contado", estado: "completa", faltantes: [] },
      { nombre: "Droguería Pacífico", precioUnitario: 1950, minimo: null, presentacion: "Caja 30 comp.", disponibilidad: null, condiciones: "Pago a 30 días", laboratorio: "Laboratorio Andrómaco", pago: "Pago a 30 días", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA", "Cantidad mínima de compra"] },
      { nombre: "Proveedor Y", precioUnitario: 2050, minimo: 10, presentacion: "Caja 30 comp.", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", laboratorio: "Laboratorio Mintlab", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
      { nombre: "Laboratorio Sur", precioUnitario: null, minimo: null, presentacion: "Caja 30 comp.", disponibilidad: null, condiciones: "Sin información comercial", otros: "Sin información comercial", estado: "pendiente", faltantes: ["Precio unitario", "Disponibilidad", "Costo de despacho", "Condiciones de compra"] },
    ],
  },
  {
    id: "paracetamol", nombre: "Paracetamol 500 mg", presentacion: "Caja 16 comprimidos", categoria: "Medicamento",
    cadenas: [
      { id: "cruzverde", precio: 1290, presentacion: "Caja 16 comp.", fecha: "2026-10-27" , nombreComercial: "Paracetamol 500 mg 16 comprimidos", fabricante: "Laboratorio Chile", descripcion: "Analgésico y antipirético. Venta directa.", atributos: [["Principio activo", "Paracetamol"], ["Forma", "Comprimido"], ["Dosis", "500 mg"], ["Presentación", "16 comprimidos"]] },
      { id: "salcobrand", precio: 1490, presentacion: "Caja 16 comp.", fecha: "2026-10-27" , nombreComercial: "Paracetamol 500 mg x 16 comprimidos", fabricante: "Laboratorio Mintlab", descripcion: "Alivio del dolor leve a moderado y la fiebre. Venta directa.", atributos: [["Principio activo", "Paracetamol"], ["Forma", "Comprimido"], ["Dosis", "500 mg"], ["Presentación", "16 comprimidos"]] },
      { id: "ahumada", precio: 990, presentacion: "Caja 16 comp.", fecha: "2026-10-24" , nombreComercial: "Paracetamol 500 mg caja 16 comprimidos", fabricante: "Laboratorio Saval", descripcion: "Analgésico y antipirético de uso común. Venta directa.", atributos: [["Principio activo", "Paracetamol"], ["Forma", "Comprimido"], ["Dosis", "500 mg"], ["Presentación", "16 comprimidos"]] },
    ],
    proveedores: [
      { nombre: "Distribuidora Andes", precioUnitario: 380, minimo: 100, presentacion: "Caja 16 comp.", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", laboratorio: "Laboratorio Saval", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
      { nombre: "Proveedor X", precioUnitario: 360, minimo: 20, presentacion: "Caja 16 comp.", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", laboratorio: "Laboratorio Chile", despacho: "Despacho incluido", iva: "incluido", descuento: "5% de descuento sobre 50 unidades", estado: "completa", faltantes: [] },
      { nombre: "Proveedor Y", precioUnitario: 340, minimo: null, presentacion: "Caja 16 comp.", disponibilidad: "En stock", condiciones: "Despacho por confirmar", laboratorio: "Laboratorio Mintlab", despacho: "Despacho por confirmar", estado: "parcial", faltantes: ["Cantidad mínima de compra", "Costo de despacho"] },
      { nombre: "Droguería Pacífico", precioUnitario: 350, minimo: 50, presentacion: "Caja 16 comp.", disponibilidad: "Stock limitado", condiciones: "Despacho semanal", despacho: "Despacho semanal", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA"] },
    ],
  },
  {
    id: "shampoo", nombre: "Shampoo Hidratante Suave", presentacion: "Frasco 400 ml", categoria: "Cuidado personal",
    cadenas: [
      { id: "cruzverde", precio: 5990, presentacion: "400 ml", fecha: "2026-10-26" , nombreComercial: "Shampoo Hidratante Suave Aloe 400 ml", fabricante: "Marca Demo Cosmética", descripcion: "Shampoo para uso diario, cabello normal a seco.", atributos: [["Tipo de cabello", "Normal a seco"], ["Contenido", "400 ml"], ["Formato", "Frasco"]] },
      { id: "salcobrand", precio: 6490, presentacion: "400 ml", fecha: "2026-10-25" , nombreComercial: "Shampoo Hidratante Suave Avena 400 ml", fabricante: "Marca Demo Cosmética", descripcion: "Fórmula suave con avena, sin sulfatos.", atributos: [["Tipo de cabello", "Todo tipo"], ["Contenido", "400 ml"], ["Formato", "Frasco"]] },
      { id: "ahumada", precio: 6190, presentacion: "400 ml", fecha: "2026-10-24" , nombreComercial: "Shampoo Hidratante Suave 400 ml", fabricante: "Marca Demo Cosmética", descripcion: "Limpieza suave e hidratación para uso frecuente.", atributos: [["Tipo de cabello", "Normal"], ["Contenido", "400 ml"], ["Formato", "Frasco"]] },
    ],
    proveedores: [
      { nombre: "Cosmética Total", precioUnitario: 2800, minimo: 12, presentacion: "400 ml", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
      { nombre: "Distribuidora Andes", precioUnitario: null, minimo: null, presentacion: "400 ml", disponibilidad: null, condiciones: "Precio por confirmar", otros: "Precio por confirmar", estado: "pendiente", faltantes: ["Precio unitario", "Disponibilidad", "Costo de despacho"] },
    ],
  },
  {
    id: "cepillo", nombre: "Cepillo de pelo desenredante", presentacion: "1 unidad", categoria: "Accesorios",
    cadenas: [
      { id: "cruzverde", precio: 3990, presentacion: "1 unidad", fecha: "2026-10-22" , nombreComercial: "Cepillo desenredante cerdas flexibles", fabricante: "Marca Demo Accesorios", descripcion: "Cepillo para desenredar sin tirones, cabello húmedo o seco.", atributos: [["Material", "Plástico y nylon"], ["Tamaño", "Mediano"], ["Contenido", "1 unidad"]] },
      { id: "ahumada", precio: 3490, presentacion: "1 unidad", fecha: "2026-10-21" , nombreComercial: "Cepillo de pelo desenredante ovalado", fabricante: "Marca Demo Accesorios", descripcion: "Diseño ergonómico, apto para todo tipo de cabello.", atributos: [["Material", "Plástico"], ["Tamaño", "Grande"], ["Contenido", "1 unidad"]] },
    ],
    proveedores: [
      { nombre: "Accesorios Beauty", precioUnitario: 1500, minimo: 24, presentacion: "1 unidad", disponibilidad: "En stock", condiciones: "Pago contado", pago: "Pago contado", estado: "parcial", faltantes: ["Costo de despacho"] },
    ],
  },
  {
    id: "vet", nombre: "Antiparasitario canino", presentacion: "Pipeta 10–20 kg", categoria: "Veterinario",
    cadenas: [
      { id: "salcobrand", precio: 8990, presentacion: "1 pipeta", fecha: "2026-10-26" , nombreComercial: "Pipeta antiparasitaria perros 10 a 20 kg", fabricante: "Laboratorio Demo Vet", descripcion: "Control de pulgas y garrapatas. Uso veterinario externo.", atributos: [["Especie", "Perro"], ["Peso", "10–20 kg"], ["Forma", "Pipeta tópica"], ["Contenido", "1 pipeta"]] },
      { id: "cruzverde", precio: 9490, presentacion: "1 pipeta", fecha: "2026-10-20" , nombreComercial: "Antiparasitario externo canino pipeta M", fabricante: "Laboratorio Demo Vet", descripcion: "Protección mensual contra parásitos externos. Uso veterinario.", atributos: [["Especie", "Perro"], ["Peso", "10–20 kg"], ["Forma", "Pipeta tópica"], ["Contenido", "1 pipeta"]] },
    ],
    proveedores: [
      { nombre: "VetDistribución", precioUnitario: 4900, minimo: 6, presentacion: "1 pipeta", disponibilidad: "En stock", condiciones: "Despacho 72 h incluido · IVA incluido", despacho: "Despacho 72 h incluido", iva: "incluido", estado: "completa", faltantes: [] },
      { nombre: "Droguería Pacífico", precioUnitario: 4600, minimo: null, presentacion: "1 pipeta", disponibilidad: null, condiciones: "Sin condiciones informadas", otros: "Sin condiciones informadas", estado: "parcial", faltantes: ["Costo de despacho", "Si el precio incluye IVA", "Cantidad mínima de compra"] },
    ],
  },
  {
    id: "nivea", nombre: "Crema Nivea 1 litro", presentacion: "Frasco 1 L", categoria: "Cuidado personal",
    cadenas: [],
    proveedores: [
      { nombre: "Proveedor X", precioUnitario: 6900, minimo: 6, presentacion: "Frasco 1 L", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
    ],
  },
  {
    id: "fructis", nombre: "Shampoo Fructis", presentacion: "Frasco 350 ml", categoria: "Cuidado personal",
    cadenas: [],
    proveedores: [
      { nombre: "Proveedor Y", precioUnitario: 2900, minimo: null, presentacion: "Frasco 350 ml", disponibilidad: "En stock", condiciones: "IVA incluido", iva: "incluido", estado: "parcial", faltantes: ["Cantidad mínima de compra"] },
    ],
  },
  {
    id: "encrespador", nombre: "Encrespador", presentacion: "1 unidad", categoria: "Accesorios",
    cadenas: [],
    proveedores: [
      { nombre: "Proveedor Y", precioUnitario: 8500, minimo: 1, presentacion: "1 unidad", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
    ],
  },
  {
    id: "alcohol", nombre: "Alcohol al 70%", presentacion: "Botella 1 L", categoria: "Insumos",
    cadenas: [],
    proveedores: [
      { nombre: "Proveedor Z", precioUnitario: null, minimo: null, presentacion: "Botella 1 L", disponibilidad: null, condiciones: "Oferta pendiente de revisión", otros: "Oferta pendiente de revisión", estado: "pendiente", faltantes: ["Precio unitario", "Disponibilidad", "Cantidad mínima de compra"] },
      { nombre: "Proveedor X", precioUnitario: 1800, minimo: 12, presentacion: "Botella 1 L", disponibilidad: "En stock", condiciones: "Despacho incluido · IVA incluido", despacho: "Despacho incluido", iva: "incluido", estado: "completa", faltantes: [] },
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

/* ---------- Datos de demostración para Historial, Proveedores y Telegram ---------- */

export interface CotizacionHistorial {
  id: string; fecha: string; proveedor: string; productos: number; total: number | null;
  estado: "Enviada" | "Borrador" | "Respondida";
}
export const historialDemo: CotizacionHistorial[] = [
  { id: "COT-0012", fecha: "2026-10-28", proveedor: "Proveedor X", productos: 4, total: 48600, estado: "Respondida" },
  { id: "COT-0011", fecha: "2026-10-24", proveedor: "Distribuidora Andes", productos: 6, total: 132400, estado: "Enviada" },
  { id: "COT-0010", fecha: "2026-10-21", proveedor: "Proveedor Y", productos: 3, total: null, estado: "Borrador" },
  { id: "COT-0009", fecha: "2026-10-15", proveedor: "Droguería Pacífico", productos: 5, total: null, estado: "Enviada" },
  { id: "COT-0008", fecha: "2026-10-09", proveedor: "Cosmética Total", productos: 2, total: 33600, estado: "Respondida" },
];

export interface ProveedorAdmin { nombre: string; contacto: string; telefono: string; activo: boolean }
export const proveedoresAdminDemo: ProveedorAdmin[] = Array.from(
  new Set(productos.flatMap((p) => p.proveedores.map((o) => o.nombre))),
).map((nombre, i) => ({
  nombre,
  contacto: `ventas@${nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "")}.demo`,
  telefono: `+56 9 0000 00${String(i + 10)}`,
  activo: nombre !== "Laboratorio Sur",
}));

export interface AccesoTelegram { nombre: string; usuario: string; rol: "Administrador" | "Consulta" }
export const accesosTelegramDemo: AccesoTelegram[] = [
  { nombre: "Yarella Fernández", usuario: "@yarella_demo", rol: "Administrador" },
  { nombre: "Químico farmacéutico", usuario: "@qf_demo", rol: "Consulta" },
];
