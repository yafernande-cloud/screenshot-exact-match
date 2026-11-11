import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearCantidad } from "@/lib/catalogo";
import {
  UNIDADES_VENTA,
  esConflictoDeVersion,
  etiquetaBasePrecio,
  etiquetaEstadoImportacion,
  etiquetaFormato,
  etiquetaUnidad,
  guardarPerfilImportacion,
  importarListaDePrecios,
  mensajeDeErrorProveedores,
  nuevaClaveIdempotencia,
  obtenerPerfilImportacion,
  revisarImportacion,
  type DatosPerfil,
  type Fuente,
  type PerfilImportacion,
  type ResultadoImportacion,
  type RevisionImportacion,
} from "@/lib/proveedores-api";

/**
 * Flujo de un solo botón: elegir el archivo y presionar «Cargar lista de precios».
 *
 * El backend detecta hoja, cabecera y columnas y revisa con el mismo motor de E8. Si falta un dato
 * indispensable se pregunta en lenguaje sencillo; si hay filas rechazadas no se importa nada sin
 * autorización explícita. «Carga exitosa» solo aparece después de la respuesta real de E8.
 */
type Etapa =
  | "inicial"
  | "analizando"
  | "preguntas"
  | "rechazos"
  | "bloqueado"
  | "importando"
  | "exito"
  | "error";

/** Lectura del formato de precios que eligió la persona (D-151). */
type FormatoElegido = {
  decimal_separator: string;
  thousands_separator: string | null;
};

type Respuestas = {
  currency: string;
  price_basis: string;
  default_sale_unit: string;
  unidades: Record<string, string>;
  /** Valor publicado en la lista → base de precio confirmada para ESTE proveedor. */
  bases: Record<string, string>;
  /** `null` mientras el archivo no tenga un formato ambiguo o nadie lo haya confirmado. */
  formatoPrecio: FormatoElegido | null;
  crearFaltantes: boolean;
};

type Pregunta =
  "moneda" | "base" | "bases" | "unidad_defecto" | "unidades" | "formato_precio" | "crear";

const ETIQUETA_ORIGEN: Record<string, string> = {
  saved: "Mapeo guardado del proveedor",
  detected: "Detectado del archivo",
  request: "Datos confirmados en pantalla",
};

function textoDeOpcion(opciones: Record<string, unknown>, clave: string): string {
  const valor = opciones[clave];
  return typeof valor === "string" ? valor : "";
}

function mapaDeTextos(valor: unknown): Record<string, string> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).filter(
      (entrada): entrada is [string, string] => typeof entrada[1] === "string",
    ),
  );
}

function formatoDePerfil(opciones: Record<string, unknown>): FormatoElegido | null {
  if (opciones["price_format_confirmed"] !== true) return null;
  const miles = opciones["thousands_separator"];
  return {
    decimal_separator: textoDeOpcion(opciones, "decimal_separator") || ".",
    thousands_separator: typeof miles === "string" ? miles : null,
  };
}

function respuestasIniciales(revision: RevisionImportacion): Respuestas {
  const perfil = revision.profile;
  const opciones = perfil?.options ?? {};
  return {
    currency: textoDeOpcion(opciones, "currency"),
    price_basis: textoDeOpcion(opciones, "price_basis"),
    default_sale_unit: textoDeOpcion(opciones, "default_sale_unit"),
    unidades: { ...(perfil?.units ?? {}) },
    bases: mapaDeTextos(opciones["basis_values"]),
    formatoPrecio: formatoDePerfil(opciones),
    crearFaltantes: opciones["create_missing_items"] === true,
  };
}

/** El archivo admite más de una lectura del precio y nadie eligió todavía. */
function formatoAmbiguo(revision: RevisionImportacion): boolean {
  return revision.price_format?.requires_confirmation === true;
}

/** Datos que no se pueden resolver con una pregunta: el archivo no trae la columna. */
function columnasEstructurales(revision: RevisionImportacion): string[] {
  return revision.missing_columns.filter((rol) => rol === "sku" || rol === "price");
}

/**
 * Preguntas realmente necesarias: solo cuando el archivo no trae el dato y el mapeo tampoco lo
 * declara. Nunca se ofrece inventar moneda, base ni unidades.
 */
function preguntasPendientes(revision: RevisionImportacion, respuestas: Respuestas): Pregunta[] {
  const columnas = revision.profile?.columns ?? {};
  const codigos = new Set(revision.problems.map((problema) => problema.code));
  const pendientes: Pregunta[] = [];

  // Un precio como «2.490» admite dos lecturas ($2,49 o $2.490): no se importa hasta que una
  // persona elija. El backend también rechaza la importación real mientras no esté confirmado.
  if (formatoAmbiguo(revision) && !respuestas.formatoPrecio) {
    pendientes.push("formato_precio");
  }
  if (revision.missing_columns.includes("sale_unit") && !respuestas.default_sale_unit) {
    pendientes.push("unidad_defecto");
  }
  if (!columnas["currency"] && !respuestas.currency && codigos.has("INVALID_CURRENCY")) {
    pendientes.push("moneda");
  }
  if (!columnas["basis"] && !respuestas.price_basis && codigos.has("INVALID_BASIS")) {
    pendientes.push("base");
  }
  if (revision.unrecognised_bases.some((base) => !respuestas.bases[base.text])) {
    pendientes.push("bases");
  }
  if (revision.unrecognised_units.some((unidad) => !respuestas.unidades[unidad.text])) {
    pendientes.push("unidades");
  }
  if (codigos.has("UNMAPPED_PRODUCT") && !respuestas.crearFaltantes) {
    pendientes.push("crear");
  }
  return pendientes;
}

/** Aplica las respuestas sobre el mapeo efectivo de la revisión, sin completar nada más. */
function datosConRespuestas(
  revision: RevisionImportacion,
  respuestas: Respuestas,
): DatosPerfil | null {
  const perfil = revision.profile;
  if (!perfil) return null;

  const unidades = Object.fromEntries(
    Object.entries({ ...perfil.units, ...respuestas.unidades }).filter(
      ([texto, unidad]) => texto.trim() !== "" && unidad !== "",
    ),
  );

  const bases = Object.fromEntries(
    Object.entries({ ...mapaDeTextos(perfil.options["basis_values"]), ...respuestas.bases }).filter(
      ([texto, base]) => texto.trim() !== "" && base !== "",
    ),
  );

  const opciones: Record<string, unknown> = {
    ...perfil.options,
    create_missing_items: respuestas.crearFaltantes,
  };
  if (respuestas.currency.trim()) opciones["currency"] = respuestas.currency.trim().toUpperCase();
  if (respuestas.price_basis) opciones["price_basis"] = respuestas.price_basis;
  if (respuestas.default_sale_unit) {
    opciones["default_sale_unit"] = respuestas.default_sale_unit;
  }
  if (Object.keys(bases).length > 0) opciones["basis_values"] = bases;
  if (respuestas.formatoPrecio) {
    // La elección de la persona es evidencia explícita: queda en el perfil del proveedor y la
    // importación real deja de pedir confirmación para este formato.
    opciones["decimal_separator"] = respuestas.formatoPrecio.decimal_separator;
    opciones["thousands_separator"] = respuestas.formatoPrecio.thousands_separator;
    opciones["price_format_confirmed"] = true;
  }

  return {
    file_format: perfil.file_format,
    sheet: perfil.sheet,
    header_row: perfil.header_row,
    columns: perfil.columns,
    units: unidades,
    options: opciones,
  };
}

function tituloDeProblema(codigo: string): string {
  switch (codigo) {
    case "UNKNOWN_UNIT":
      return "Unidad sin traducir";
    case "UNMAPPED_PRODUCT":
      return "Producto sin vínculo en el catálogo";
    case "INVALID_PRICE":
    case "MISSING_REQUIRED_FIELD":
      return "Datos incompletos o inválidos";
    case "INVALID_CURRENCY":
      return "Falta la moneda";
    case "INVALID_BASIS":
      return "Falta la base del precio";
    case "INVALID_QUANTITY":
      return "Cantidad inválida";
    default:
      return "Problema en la fila";
  }
}

function nombreDeRol(rol: string): string {
  switch (rol) {
    case "sku":
      return "la columna con el código del producto";
    case "price":
      return "la columna con el precio";
    case "sale_unit":
      return "la columna con la unidad de venta";
    default:
      return `la columna «${rol}»`;
  }
}

export function ImportadorLista({
  proveedorId,
  fuente,
  onImportado,
}: {
  proveedorId: string;
  fuente: Fuente;
  onImportado: () => Promise<void>;
}) {
  const [cargandoPerfil, setCargandoPerfil] = useState(true);
  const [perfil, setPerfil] = useState<PerfilImportacion | null>(null);
  const [versionPerfil, setVersionPerfil] = useState(0);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [claveIdempotencia, setClaveIdempotencia] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("inicial");
  const [revision, setRevision] = useState<RevisionImportacion | null>(null);
  const [respuestas, setRespuestas] = useState<Respuestas | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idBase = `importar-${fuente.source_id}`;

  useEffect(() => {
    let vigente = true;
    setCargandoPerfil(true);
    obtenerPerfilImportacion(fuente.source_id)
      .then((respuesta) => {
        if (!vigente) return;
        setPerfil(respuesta.profile);
        setVersionPerfil(respuesta.version);
      })
      .catch((fallo: unknown) => {
        if (vigente) {
          toast.error(mensajeDeErrorProveedores(fallo, "No pudimos cargar el mapeo guardado."));
        }
      })
      .finally(() => {
        if (vigente) setCargandoPerfil(false);
      });
    return () => {
      vigente = false;
    };
  }, [fuente.source_id]);

  const reiniciar = () => {
    setArchivo(null);
    setClaveIdempotencia("");
    setEtapa("inicial");
    setRevision(null);
    setRespuestas(null);
    setResultado(null);
    setError(null);
  };

  const elegirArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = evento.target.files?.[0] ?? null;
    setArchivo(elegido);
    setEtapa("inicial");
    setRevision(null);
    setRespuestas(null);
    setResultado(null);
    setError(null);
    if (elegido) setClaveIdempotencia(nuevaClaveIdempotencia());
  };

  /** Guarda el mapeo revisado para que E8 lea exactamente la misma hoja y columnas. */
  const guardarEfectivo = async (
    datos: DatosPerfil,
    revisionVigente: RevisionImportacion,
  ): Promise<boolean> => {
    let version =
      revisionVigente.profile_source === "saved" ? revisionVigente.profile_version : null;
    if (version === null) {
      try {
        const respuesta = await obtenerPerfilImportacion(fuente.source_id);
        setPerfil(respuesta.profile);
        setVersionPerfil(respuesta.version);
        version = respuesta.version;
      } catch {
        version = versionPerfil;
      }
    }

    for (let intento = 0; intento < 2; intento += 1) {
      try {
        const guardado = await guardarPerfilImportacion(fuente.source_id, datos, version);
        setPerfil(guardado);
        setVersionPerfil(guardado.version);
        return true;
      } catch (fallo) {
        if (esConflictoDeVersion(fallo) && intento === 0) {
          try {
            const respuesta = await obtenerPerfilImportacion(fuente.source_id);
            setPerfil(respuesta.profile);
            setVersionPerfil(respuesta.version);
            version = respuesta.version;
            continue;
          } catch {
            // Sin versión fresca no se reintenta a ciegas.
          }
        }
        toast.error(
          mensajeDeErrorProveedores(fallo, "No pudimos guardar la configuración de la lista."),
        );
        return false;
      }
    }
    return false;
  };

  const importar = async (revisionVigente: RevisionImportacion, respuestasVigentes: Respuestas) => {
    if (!archivo) return;
    const datos = datosConRespuestas(revisionVigente, respuestasVigentes);
    if (!datos) {
      setError("No pudimos preparar la importación. Inténtalo otra vez.");
      setEtapa("error");
      return;
    }

    setEtapa("importando");
    setError(null);
    try {
      if (!(await guardarEfectivo(datos, revisionVigente))) {
        setError("No pudimos guardar la configuración de la lista, así que no se importó nada.");
        setEtapa("error");
        return;
      }

      const salida = await importarListaDePrecios({
        supplierId: proveedorId,
        sourceId: fuente.source_id,
        archivo,
        idempotencyKey: claveIdempotencia || nuevaClaveIdempotencia(),
      });
      setResultado(salida);

      try {
        await onImportado();
      } catch {
        // La importación ya está confirmada por el backend; refrescar es solo cortesía.
      }

      if (salida.status === "failed" || salida.rows_accepted === 0) {
        setError("El servidor no aceptó ninguna fila. Revisa el archivo y vuelve a intentarlo.");
        setEtapa("error");
        return;
      }

      setEtapa("exito");
      // Las condiciones comerciales no se procesan todavía. El sobre de E8 no las cuenta, pero la
      // revisión previa sí: se conserva ese número para avisar a quien carga la lista.
      const pendientes = revisionVigente.rows_needs_review;
      const avisoPendientes =
        pendientes > 0
          ? ` ${pendientes} ${pendientes === 1 ? "informa" : "informan"} condiciones comerciales del proveedor.`
          : "";
      const base =
        salida.rows_rejected > 0
          ? `Se cargaron ${salida.rows_accepted} productos; ${salida.rows_rejected} quedaron fuera.`
          : `Se cargaron ${salida.rows_accepted} productos.`;
      toast.success(`${base}${avisoPendientes}`);
    } catch (fallo) {
      setError(
        mensajeDeErrorProveedores(
          fallo,
          "No pudimos importar la lista de precios. Inténtalo otra vez.",
        ),
      );
      setEtapa("error");
    }
  };

  const evaluar = (nueva: RevisionImportacion) => {
    const iniciales = respuestasIniciales(nueva);
    setRevision(nueva);
    setRespuestas(iniciales);

    if (columnasEstructurales(nueva).length > 0) {
      setEtapa("bloqueado");
      return;
    }
    if (preguntasPendientes(nueva, iniciales).length > 0) {
      setEtapa("preguntas");
      return;
    }
    if (nueva.rows_rejected > 0) {
      setEtapa(nueva.rows_accepted > 0 ? "rechazos" : "bloqueado");
      return;
    }
    if (nueva.rows_accepted > 0) {
      void importar(nueva, iniciales);
      return;
    }
    setEtapa("bloqueado");
  };

  const cargar = async () => {
    if (!archivo) {
      setError("Primero elige el archivo de la lista de precios.");
      setEtapa("error");
      return;
    }
    setEtapa("analizando");
    setError(null);
    setResultado(null);
    try {
      const nueva = await revisarImportacion(fuente.source_id, archivo, undefined, { auto: true });
      evaluar(nueva);
    } catch (fallo) {
      setError(
        mensajeDeErrorProveedores(
          fallo,
          "No pudimos leer la lista. Revisa que sea .xlsx, .xls o .csv.",
        ),
      );
      setEtapa("error");
    }
  };

  const volverARevisar = async () => {
    if (!archivo || !revision || !respuestas) return;
    const datos = datosConRespuestas(revision, respuestas);
    if (!datos) return;

    setEtapa("analizando");
    setError(null);
    try {
      const nueva = await revisarImportacion(fuente.source_id, archivo, datos, {
        auto: true,
        hoja: datos.sheet,
        filaEncabezado: datos.header_row,
      });
      evaluar(nueva);
    } catch (fallo) {
      setError(
        mensajeDeErrorProveedores(fallo, "No pudimos revisar la lista. Inténtalo otra vez."),
      );
      setEtapa("error");
    }
  };

  if (cargandoPerfil) {
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        Cargando la configuración de la lista…
      </p>
    );
  }

  const ocupado = etapa === "analizando" || etapa === "importando";
  const pendientes = revision && respuestas ? preguntasPendientes(revision, respuestas) : [];
  const puedeResponder = pendientes.length === 0;
  const estructurales = revision ? columnasEstructurales(revision) : [];
  const mapeo = revision?.profile;

  return (
    <div className="mt-3 space-y-4 rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-brand-green" />
        <p className="text-sm font-medium">Cargar lista de precios</p>
        <Badge variant="outline">
          {perfil ? `Mapeo guardado (versión ${perfil.version})` : "Sin mapeo guardado"}
        </Badge>
      </div>

      <div>
        <Label htmlFor={`${idBase}-archivo`}>Archivo de la lista de precios</Label>
        <Input
          id={`${idBase}-archivo`}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={elegirArchivo}
          disabled={ocupado}
          className="mt-1 cursor-pointer"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Se aceptan .xlsx, .xls y .csv. Buscamos solos la hoja y las columnas de la lista.
        </p>
      </div>

      {(etapa === "inicial" || etapa === "error") && (
        <Button type="button" onClick={() => void cargar()} disabled={!archivo || ocupado}>
          <Upload className="h-4 w-4" />
          Cargar lista de precios
        </Button>
      )}

      {etapa === "analizando" && (
        <p role="status" className="text-sm text-muted-foreground">
          Leyendo y revisando la lista…
        </p>
      )}

      {etapa === "importando" && (
        <p role="status" className="text-sm text-muted-foreground">
          Importando los productos…
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No se pudo completar la carga</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {etapa === "preguntas" && revision && respuestas && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Necesitamos un dato para continuar</p>
            <p className="text-xs text-muted-foreground">
              La lista no trae esta información con certeza. No la completamos solos.
            </p>
          </div>

          {pendientes.includes("formato_precio") && revision.price_format && (
            <fieldset className="space-y-2">
              <legend className="text-sm">
                Los precios del archivo se pueden leer de más de una forma. ¿Cuál es la correcta?
              </legend>
              <p className="text-xs text-muted-foreground">
                {revision.price_format.message ??
                  "No importamos hasta que lo confirmes: una lectura equivocada cambia el precio real."}
              </p>
              <div className="space-y-2">
                {revision.price_format.interpretations.map((interpretacion) => {
                  const elegido =
                    respuestas.formatoPrecio?.decimal_separator ===
                      interpretacion.decimal_separator &&
                    (respuestas.formatoPrecio?.thousands_separator ?? null) ===
                      (interpretacion.thousands_separator ?? null);
                  const moneda = respuestas.currency.trim().toUpperCase();
                  return (
                    <label
                      key={`${interpretacion.key}-${interpretacion.decimal_separator}`}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${
                        elegido ? "border-brand-green bg-brand-green/5" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${idBase}-formato-precio`}
                        className="mt-1"
                        checked={elegido}
                        onChange={() =>
                          setRespuestas({
                            ...respuestas,
                            formatoPrecio: {
                              decimal_separator: interpretacion.decimal_separator,
                              thousands_separator: interpretacion.thousands_separator,
                            },
                          })
                        }
                      />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">{interpretacion.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {interpretacion.description}
                        </span>
                        {interpretacion.examples.length > 0 && (
                          <span className="block text-xs">
                            {interpretacion.examples
                              .map((ejemplo) => {
                                const cifra = formatearCantidad(ejemplo.amount) ?? ejemplo.amount;
                                return `«${ejemplo.raw}» = ${cifra}${moneda ? ` ${moneda}` : ""}`;
                              })
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {pendientes.includes("unidad_defecto") && (
            <div>
              <Label htmlFor={`${idBase}-unidad-defecto`} className="text-sm">
                La lista no indica cómo se vende cada producto. ¿Cuál corresponde a todos?
              </Label>
              <select
                id={`${idBase}-unidad-defecto`}
                value={respuestas.default_sale_unit}
                onChange={(evento) =>
                  setRespuestas({ ...respuestas, default_sale_unit: evento.target.value })
                }
                className="mt-1 flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Elige una unidad</option>
                {UNIDADES_VENTA.map((unidad) => (
                  <option key={unidad.value} value={unidad.value}>
                    {unidad.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {pendientes.includes("moneda") && (
            <div>
              <Label htmlFor={`${idBase}-moneda`} className="text-sm">
                ¿En qué moneda están los precios? (código de 3 letras)
              </Label>
              <Input
                id={`${idBase}-moneda`}
                value={respuestas.currency}
                onChange={(evento) =>
                  setRespuestas({ ...respuestas, currency: evento.target.value })
                }
                placeholder="Ej. CLP"
                maxLength={3}
                className="mt-1 w-32 uppercase"
              />
            </div>
          )}

          {pendientes.includes("base") && (
            <div>
              <Label htmlFor={`${idBase}-base`} className="text-sm">
                ¿El precio es por el envase que se vende o por cada unidad suelta que contiene?
              </Label>
              <select
                id={`${idBase}-base`}
                value={respuestas.price_basis}
                onChange={(evento) =>
                  setRespuestas({ ...respuestas, price_basis: evento.target.value })
                }
                className="mt-1 flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Elige una opción</option>
                <option value="per_commercial_unit">Por el envase que se vende</option>
                <option value="per_base_unit">Por cada unidad suelta que contiene</option>
              </select>
            </div>
          )}

          {pendientes.includes("bases") && (
            <div className="space-y-2">
              <p className="text-sm">
                La lista indica cómo se aplica el precio. ¿Qué significa para este proveedor?
              </p>
              <p className="text-xs text-muted-foreground">
                Se guarda solo para este proveedor; no se aplica a otros.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {revision.unrecognised_bases.map((base) => (
                  <div key={base.text} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm" title={base.text}>
                      «{base.text}» · {base.count} {base.count === 1 ? "fila" : "filas"}
                    </span>
                    <select
                      aria-label={`Significado de la base de precio ${base.text}`}
                      value={respuestas.bases[base.text] ?? ""}
                      onChange={(evento) =>
                        setRespuestas({
                          ...respuestas,
                          bases: { ...respuestas.bases, [base.text]: evento.target.value },
                        })
                      }
                      className="flex h-9 min-w-[210px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    >
                      <option value="">Elige una opción</option>
                      <option value="per_commercial_unit">Por el envase que se vende</option>
                      <option value="per_base_unit">Por cada unidad suelta que contiene</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendientes.includes("unidades") && (
            <div className="space-y-2">
              <p className="text-sm">Traduce las unidades que usa la lista:</p>
              <div className="grid gap-2 md:grid-cols-2">
                {revision.unrecognised_units.map((unidad) => (
                  <div key={unidad.text} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm" title={unidad.text}>
                      «{unidad.text}» · {unidad.count} {unidad.count === 1 ? "fila" : "filas"}
                    </span>
                    <select
                      aria-label={`Traducción de la unidad ${unidad.text}`}
                      value={respuestas.unidades[unidad.text] ?? ""}
                      onChange={(evento) =>
                        setRespuestas({
                          ...respuestas,
                          unidades: {
                            ...respuestas.unidades,
                            [unidad.text]: evento.target.value,
                          },
                        })
                      }
                      className="flex h-9 min-w-[150px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    >
                      <option value="">Sin traducir</option>
                      {UNIDADES_VENTA.map((opcion) => (
                        <option key={opcion.value} value={opcion.value}>
                          {opcion.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendientes.includes("crear") && (
            <div className="flex items-start gap-2">
              <Checkbox
                id={`${idBase}-crear`}
                checked={respuestas.crearFaltantes}
                onCheckedChange={(valor) =>
                  setRespuestas({ ...respuestas, crearFaltantes: valor === true })
                }
              />
              <div>
                <Label htmlFor={`${idBase}-crear`} className="text-sm font-normal">
                  Crear productos nuevos para los códigos que no están en el catálogo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se usará únicamente el nombre que publica la lista. No se vinculan productos por
                  parecido de nombre.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void volverARevisar()}
              disabled={!puedeResponder || ocupado}
            >
              Continuar
            </Button>
            <Button type="button" variant="outline" onClick={reiniciar} disabled={ocupado}>
              Elegir otro archivo
            </Button>
          </div>
        </div>
      )}

      {etapa === "bloqueado" && revision && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {estructurales.length > 0
              ? "No encontramos los datos necesarios en el archivo"
              : "No hay productos que se puedan cargar"}
          </AlertTitle>
          <AlertDescription>
            {estructurales.length > 0 ? (
              <>
                La lista no trae {estructurales.map(nombreDeRol).join(" ni ")}. Revisa que el
                archivo sea la lista de precios del proveedor y que esas columnas tengan nombre en
                la primera fila. No asignamos columnas por posición a ciegas.
              </>
            ) : revision.rows_rejected > 0 ? (
              <>
                Ninguna de las {revision.rows_total} filas se puede importar tal como está. Los
                motivos aparecen en los detalles técnicos. Corrige el archivo original y vuelve a
                cargarlo.
              </>
            ) : (
              <>La lista no tiene filas con datos. Revisa el archivo y vuelve a cargarlo.</>
            )}
          </AlertDescription>
        </Alert>
      )}

      {etapa === "rechazos" && revision && (
        <div className="space-y-3">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Hay {revision.rows_rejected} filas con problemas</AlertTitle>
            <AlertDescription>
              Se pueden cargar {revision.rows_accepted} de {revision.rows_total}. No se importará
              nada hasta que lo autorices.
            </AlertDescription>
          </Alert>

          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <p className="text-sm font-medium">Qué impide cargar esas filas</p>
            <ul className="space-y-2 text-sm">
              {revision.problems.map((problema) => (
                <li key={`${problema.code}-${problema.fields.join("-")}`}>
                  <p className="font-medium">
                    {tituloDeProblema(problema.code)} · {problema.count}{" "}
                    {problema.count === 1 ? "fila" : "filas"}
                  </p>
                  <p className="text-xs text-muted-foreground">{problema.message}</p>
                  {problema.sample_rows.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Por ejemplo, fila{problema.sample_rows.length === 1 ? "" : "s"}{" "}
                      {problema.sample_rows.join(", ")}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void importar(revision, respuestas ?? respuestasIniciales(revision))}
              disabled={ocupado}
            >
              Importar solo {revision.rows_accepted}{" "}
              {revision.rows_accepted === 1 ? "producto correcto" : "productos correctos"} (
              {revision.rows_rejected} {revision.rows_rejected === 1 ? "quedará" : "quedarán"}{" "}
              fuera)
            </Button>
            <Button type="button" variant="outline" onClick={reiniciar} disabled={ocupado}>
              Elegir otro archivo
            </Button>
          </div>
        </div>
      )}

      {etapa === "exito" && resultado && (
        <div className="space-y-2 rounded-xl border border-brand-green/40 bg-brand-green/5 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-brand-green" />
            <p className="text-sm font-medium">
              {resultado.rows_rejected === 0 ? "Carga exitosa" : "Carga completada"}
            </p>
          </div>
          <p className="text-sm">
            {resultado.rows_accepted}{" "}
            {resultado.rows_accepted === 1 ? "producto procesado" : "productos procesados"}.
          </p>
          {resultado.rows_rejected > 0 && (
            <p className="text-xs text-muted-foreground">
              {resultado.rows_rejected}{" "}
              {resultado.rows_rejected === 1 ? "fila quedó" : "filas quedaron"} fuera; no se
              modificaron.
            </p>
          )}
          {revision && revision.rows_needs_review > 0 && (
            <div
              role="note"
              className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {revision.rows_needs_review}{" "}
              {revision.rows_needs_review === 1
                ? "producto informa condiciones comerciales del proveedor"
                : "productos informan condiciones comerciales del proveedor"}
              . El precio se guardó; las condiciones se muestran junto a la oferta y no se presenta
              como verificada.
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            La respuesta del servidor no distingue productos nuevos de precios actualizados.
          </p>
          {resultado.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {resultado.errors.slice(0, 20).map((fallo) => (
                <li key={`${fallo.row}-${fallo.code}-${fallo.message}`}>
                  Fila {fallo.row}: {fallo.message} ({fallo.code})
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" onClick={reiniciar}>
            Cargar otra lista
          </Button>
        </div>
      )}

      {revision && (
        <details className="rounded-xl border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Detalles técnicos (para diagnóstico)
          </summary>
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>Formato: {etiquetaFormato(revision.file_format)}</p>
              <p>Hoja leída: {revision.sheet ?? "Sin hojas (CSV)"}</p>
              <p>Fila de encabezado: {revision.header_row}</p>
              <p>Origen del mapeo: {ETIQUETA_ORIGEN[revision.profile_source]}</p>
              <p>Versión del mapeo: {revision.profile_version}</p>
              <p>
                Formato de precios: separador decimal «
                {revision.price_format?.decimal_separator ?? "."}» · separador de miles{" "}
                {revision.price_format?.thousands_separator
                  ? `«${revision.price_format.thousands_separator}»`
                  : "no declarado"}
                {revision.price_format?.requires_confirmation ? " · sin confirmar" : ""}
              </p>
              <p className="truncate">Huella del archivo: {revision.file_hash.slice(0, 16)}…</p>
            </div>

            <div>
              <p className="font-medium text-foreground">Columnas del mapeo efectivo</p>
              <ul className="mt-1 space-y-1">
                {mapeo
                  ? Object.entries(mapeo.columns).map(([rol, columna]) => (
                      <li key={rol}>
                        {PAPEL_ETIQUETA[rol] ?? rol}:{" "}
                        {columna.header ?? (columna.position ? `columna ${columna.position}` : "—")}
                        {columna.position ? ` (posición ${columna.position})` : ""}
                      </li>
                    ))
                  : "Sin mapeo: falta información del archivo."}
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground">Unidades traducidas</p>
              <p className="mt-1">
                {mapeo && Object.keys(mapeo.units).length > 0
                  ? Object.entries(mapeo.units)
                      .map(([texto, unidad]) => `${texto} → ${etiquetaUnidad(unidad)}`)
                      .join(" · ")
                  : "Ninguna."}
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground">Bases de precio confirmadas</p>
              <p className="mt-1">
                {mapeo && Object.keys(mapaDeTextos(mapeo.options["basis_values"])).length > 0
                  ? Object.entries(mapaDeTextos(mapeo.options["basis_values"]))
                      .map(([texto, base]) => `«${texto}» → ${etiquetaBasePrecio(base as string)}`)
                      .join(" · ")
                  : "Ninguna."}
              </p>
            </div>

            {revision.ignored_columns.length > 0 && (
              <div>
                <p className="font-medium text-foreground">Columnas omitidas a propósito</p>
                <ul className="mt-1 space-y-1">
                  {revision.ignored_columns.map((columna) => (
                    <li key={`${columna.role}-${columna.header ?? ""}`}>
                      {PAPEL_ETIQUETA[columna.role] ?? columna.role}
                      {columna.header ? ` («${columna.header}»)` : ""}: {columna.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {revision.problems.length > 0 && (
              <div>
                <p className="font-medium text-foreground">Rechazos agrupados</p>
                <ul className="mt-1 space-y-1">
                  {revision.problems.map((problema) => (
                    <li key={`${problema.code}-${problema.fields.join("-")}`}>
                      {problema.code}: {problema.count} filas
                      {problema.sample_rows.length > 0
                        ? ` (ej. ${problema.sample_rows.join(", ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="font-medium text-foreground">Filas revisadas</p>
              <div className="mt-1 max-h-64 overflow-auto rounded-md border bg-background">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1">Fila</th>
                      <th className="px-2 py-1">Código</th>
                      <th className="px-2 py-1">Producto</th>
                      <th className="px-2 py-1">Precio</th>
                      <th className="px-2 py-1">Unidad</th>
                      <th className="px-2 py-1">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revision.rows.map((fila) => (
                      <tr key={fila.row} className="border-t">
                        <td className="px-2 py-1">{fila.row}</td>
                        <td className="px-2 py-1">{fila.sku ?? "—"}</td>
                        <td className="px-2 py-1">
                          {fila.name ?? "—"}
                          {fila.problem && (
                            <span className="block text-destructive">{fila.problem.message}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {fila.price ? `${fila.price} ${fila.currency ?? ""}`.trim() : "—"}
                        </td>
                        <td className="px-2 py-1">
                          {fila.sale_unit ? etiquetaUnidad(fila.sale_unit) : "—"}
                        </td>
                        <td className="px-2 py-1">{fila.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {revision.rows_truncated && (
                <p className="mt-1">
                  La tabla muestra las primeras {revision.rows.length} filas; los conteos consideran
                  el archivo completo.
                </p>
              )}
            </div>

            <div>
              <p className="font-medium text-foreground">Resultado del servidor</p>
              <p className="mt-1">
                {resultado
                  ? `${etiquetaEstadoImportacion(resultado.status)} · ${resultado.rows_accepted} aceptadas · ${resultado.rows_rejected} rechazadas`
                  : "Todavía no se importó nada."}
              </p>
            </div>
          </div>
        </details>
      )}

      {!archivo && (
        <p className="text-xs text-muted-foreground">
          {perfil
            ? `Hay un mapeo guardado para ${etiquetaFormato(perfil.file_format)}${
                perfil.sheet ? `, hoja «${perfil.sheet}»` : ""
              }. Se reutiliza solo si calza por nombre de columna.`
            : "Esta fuente todavía no tiene mapeo. Se detectará del archivo la primera vez."}
        </p>
      )}
    </div>
  );
}

const PAPEL_ETIQUETA: Record<string, string> = {
  sku: "Código del producto",
  name: "Nombre o descripción",
  price: "Precio",
  sale_unit: "Unidad de venta",
  currency: "Moneda",
  basis: "Base del precio",
  pack: "Unidades por envase",
  minimum: "Compra mínima",
  multiple: "Múltiplo de compra",
  stock: "Stock",
  observed_at: "Fecha del precio",
  conditions: "Condiciones",
};
