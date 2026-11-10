import { useCallback, useEffect, useState } from "react";
import { AlertCircle, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAPELES_COLUMNA,
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
  previsualizarImportacion,
  revisarImportacion,
  type DatosPerfil,
  type Fuente,
  type PerfilImportacion,
  type ResultadoImportacion,
  type RevisionImportacion,
  type VistaPreviaImportacion,
} from "@/lib/proveedores-api";

type Opciones = {
  currency: string;
  price_basis: string;
  decimal_separator: string;
  thousands_separator: string;
  default_sale_unit: string;
  pack_base_unit: string;
  create_missing_items: boolean;
};

type Paso = 1 | 2 | 3;

const OPCIONES_VACIAS: Opciones = {
  currency: "",
  price_basis: "",
  decimal_separator: ".",
  thousands_separator: "",
  default_sale_unit: "",
  pack_base_unit: "",
  create_missing_items: false,
};

const CLAVES_DE_LA_PANTALLA = new Set([
  "currency",
  "price_basis",
  "decimal_separator",
  "thousands_separator",
  "default_sale_unit",
  "pack_base_unit",
  "create_missing_items",
]);

function opcionesDePerfil(perfil: PerfilImportacion | null): Opciones {
  if (!perfil) return { ...OPCIONES_VACIAS };
  const o = perfil.options ?? {};
  const texto = (clave: string, porDefecto = ""): string =>
    typeof o[clave] === "string" ? (o[clave] as string) : porDefecto;
  return {
    currency: texto("currency"),
    price_basis: texto("price_basis"),
    decimal_separator: texto("decimal_separator", "."),
    thousands_separator: texto("thousands_separator"),
    default_sale_unit: texto("default_sale_unit"),
    pack_base_unit: texto("pack_base_unit"),
    create_missing_items: o["create_missing_items"] === true,
  };
}

function opcionesExtraDePerfil(perfil: PerfilImportacion | null): Record<string, unknown> {
  if (!perfil) return {};
  return Object.fromEntries(
    Object.entries(perfil.options ?? {}).filter(([clave]) => !CLAVES_DE_LA_PANTALLA.has(clave)),
  );
}

function normalizarCabecera(valor: string | null | undefined): string {
  return (valor ?? "").trim().toLocaleLowerCase("es");
}

/**
 * Aplica el mapeo guardado **por nombre de columna**. Si el archivo ya no trae alguna de esas
 * columnas, se informa en vez de aplicar posiciones viejas a un archivo distinto.
 */
function columnasDesdePerfil(
  perfil: PerfilImportacion | null,
  cabeceras: (string | null)[],
): { columnas: Record<string, string>; incompatibles: string[] } {
  if (!perfil) return { columnas: {}, incompatibles: [] };
  const columnas: Record<string, string> = {};
  const incompatibles: string[] = [];
  for (const [papel, especificacion] of Object.entries(perfil.columns ?? {})) {
    if (especificacion.header) {
      const indice = cabeceras.findIndex(
        (cabecera) => normalizarCabecera(cabecera) === normalizarCabecera(especificacion.header),
      );
      if (indice >= 0) columnas[papel] = String(indice + 1);
      else incompatibles.push(especificacion.header);
      continue;
    }
    if (typeof especificacion.position === "number") {
      columnas[papel] = String(especificacion.position);
    }
  }
  return { columnas, incompatibles };
}

function columnasSugeridas(vista: VistaPreviaImportacion): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [papel, especificacion] of Object.entries(vista.suggested_columns ?? {})) {
    if (typeof especificacion.position === "number") {
      resultado[papel] = String(especificacion.position);
    }
  }
  return resultado;
}

function valorDeCelda(fila: { values: unknown[] }, posicion: string | undefined): unknown {
  if (!posicion) return null;
  const indice = Number(posicion) - 1;
  return Number.isInteger(indice) && indice >= 0 ? fila.values[indice] : null;
}

/** Texto de una celda tal como lo ve la vista previa; sirve para traducir unidades. */
function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return "";
}

function etiquetaEstadoFila(estado: string): string {
  switch (estado) {
    case "ready":
      return "Listo";
    case "review":
      return "Revisar condiciones";
    default:
      return "Con problema";
  }
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
  const [analizando, setAnalizando] = useState(false);
  const [vista, setVista] = useState<VistaPreviaImportacion | null>(null);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  const [avisoCompatibilidad, setAvisoCompatibilidad] = useState<string | null>(null);
  const [hoja, setHoja] = useState<string | null>(null);
  const [filaEncabezado, setFilaEncabezado] = useState(1);
  const [columnas, setColumnas] = useState<Record<string, string>>({});
  const [opciones, setOpciones] = useState<Opciones>({ ...OPCIONES_VACIAS });
  const [opcionesExtra, setOpcionesExtra] = useState<Record<string, unknown>>({});
  const [unidades, setUnidades] = useState<Record<string, string>>({});
  const [paso, setPaso] = useState<Paso>(1);
  const [revision, setRevision] = useState<RevisionImportacion | null>(null);
  const [datosRevisados, setDatosRevisados] = useState<DatosPerfil | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [errorRevision, setErrorRevision] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const idBase = `importar-${fuente.source_id}`;

  useEffect(() => {
    let vigente = true;
    setCargandoPerfil(true);
    obtenerPerfilImportacion(fuente.source_id)
      .then((respuesta) => {
        if (!vigente) return;
        setPerfil(respuesta.profile);
        setVersionPerfil(respuesta.version);
        setOpciones(opcionesDePerfil(respuesta.profile));
        setOpcionesExtra(opcionesExtraDePerfil(respuesta.profile));
        setUnidades(respuesta.profile?.units ?? {});
      })
      .catch((error: unknown) => {
        if (vigente) {
          toast.error(mensajeDeErrorProveedores(error, "No pudimos cargar el mapeo guardado."));
        }
      })
      .finally(() => {
        if (vigente) setCargandoPerfil(false);
      });
    return () => {
      vigente = false;
    };
  }, [fuente.source_id]);

  const aplicarVista = useCallback(
    (
      nueva: VistaPreviaImportacion,
      perfilVigente: PerfilImportacion | null,
      reiniciarOpciones: boolean,
    ) => {
      setVista(nueva);
      setHoja(nueva.sheet);
      setFilaEncabezado(nueva.header_row);
      setRevision(null);
      setDatosRevisados(null);
      setErrorRevision(null);
      setPaso(1);

      const mismoFormato = perfilVigente?.file_format === nueva.file_format;
      const desdePerfil = mismoFormato ? columnasDesdePerfil(perfilVigente, nueva.headers) : null;
      if (desdePerfil && desdePerfil.incompatibles.length > 0) {
        // El archivo cambió: se parte de las columnas sugeridas en vez de aplicar posiciones
        // viejas, y se avisa para que la persona confirme el mapeo.
        setColumnas(columnasSugeridas(nueva));
        setAvisoCompatibilidad(
          `El archivo cambió de columnas: el mapeo guardado esperaba ${desdePerfil.incompatibles
            .map((nombre) => `«${nombre}»`)
            .join(", ")}. Revisa el mapeo antes de continuar.`,
        );
      } else {
        setColumnas(desdePerfil ? desdePerfil.columnas : columnasSugeridas(nueva));
        setAvisoCompatibilidad(null);
      }

      if (reiniciarOpciones) {
        if (mismoFormato && perfilVigente) {
          setOpciones(opcionesDePerfil(perfilVigente));
          setOpcionesExtra(opcionesExtraDePerfil(perfilVigente));
          setUnidades(perfilVigente.units ?? {});
        } else {
          setOpciones({
            ...OPCIONES_VACIAS,
            decimal_separator: nueva.suggested_options.decimal_separator ?? ".",
          });
          setOpcionesExtra({});
          setUnidades({});
        }
      }
    },
    [],
  );

  const analizar = useCallback(
    async (
      archivoElegido: File,
      hojaElegida: string | null,
      filaElegida: number | undefined,
      perfilVigente: PerfilImportacion | null,
      reiniciarOpciones = false,
    ) => {
      setAnalizando(true);
      setErrorVista(null);
      try {
        const nueva = await previsualizarImportacion(fuente.source_id, archivoElegido, {
          hoja: hojaElegida,
          filaEncabezado: filaElegida,
        });
        aplicarVista(nueva, perfilVigente, reiniciarOpciones);
      } catch (error) {
        setVista(null);
        setErrorVista(
          mensajeDeErrorProveedores(
            error,
            "No pudimos leer el archivo. Revisa que sea .xlsx, .xls o .csv.",
          ),
        );
      } finally {
        setAnalizando(false);
      }
    },
    [aplicarVista, fuente.source_id],
  );

  const elegirArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = evento.target.files?.[0] ?? null;
    setArchivo(elegido);
    setResultado(null);
    setVista(null);
    setRevision(null);
    setDatosRevisados(null);
    setErrorVista(null);
    setErrorRevision(null);
    setAvisoCompatibilidad(null);
    setPaso(1);
    if (!elegido) return;
    setClaveIdempotencia(nuevaClaveIdempotencia());
    void analizar(elegido, null, undefined, perfil, true);
  };

  const cambiarHoja = (nuevaHoja: string) => {
    if (!archivo) return;
    setResultado(null);
    void analizar(archivo, nuevaHoja, undefined, perfil);
  };

  const releerConEncabezado = () => {
    if (!archivo) return;
    setResultado(null);
    void analizar(archivo, hoja, filaEncabezado, perfil);
  };

  const columnasDelArchivo = vista
    ? vista.headers
        .map((cabecera, indice) => ({
          valor: String(indice + 1),
          etiqueta: cabecera
            ? `Columna ${indice + 1} · ${cabecera}`
            : `Columna ${indice + 1} (sin nombre)`,
        }))
        .filter((columna) => columna.etiqueta)
    : [];

  /** Valores de unidad vistos en la muestra más los ya traducidos en el perfil. */
  const valoresDeUnidad = (() => {
    const vistos = new Set<string>();
    if (vista) {
      for (const fila of vista.sample_rows) {
        const texto = textoDeCelda(valorDeCelda(fila, columnas["sale_unit"]));
        if (texto) vistos.add(texto);
      }
    }
    for (const clave of Object.keys(unidades)) {
      if (clave) vistos.add(clave);
    }
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  })();

  /**
   * Arma el mapeo que está en pantalla.
   *
   * `requiereObligatorios` es `false` al revisar: así la revisión puede mostrar que falta la
   * moneda o la base en vez de bloquear. Al confirmar sí se exigen, porque no se inventan.
   */
  const construirDatos = (
    requiereObligatorios: boolean,
  ): { datos: DatosPerfil | null; problema: string | null } => {
    if (!archivo || !vista) {
      return { datos: null, problema: "Primero elige el archivo de la lista de precios." };
    }
    if (!columnas["sku"]) {
      return { datos: null, problema: "Asigna la columna del código del producto." };
    }
    if (!columnas["price"]) {
      return { datos: null, problema: "Asigna la columna del precio." };
    }
    if (!columnas["sale_unit"] && !opciones.default_sale_unit) {
      return {
        datos: null,
        problema:
          "Asigna la columna de la unidad de venta o elige una unidad por defecto para las filas que no la traen.",
      };
    }
    if (requiereObligatorios) {
      if (!columnas["currency"] && !/^[A-Za-z]{3}$/.test(opciones.currency.trim())) {
        return {
          datos: null,
          problema:
            "Indica la moneda de la lista con su código de 3 letras (por ejemplo CLP), o asigna una columna de moneda.",
        };
      }
      if (!columnas["basis"] && !opciones.price_basis) {
        return {
          datos: null,
          problema: "Indica si el precio es por unidad de venta o por unidad base.",
        };
      }
      if (columnas["pack"] && !opciones.pack_base_unit) {
        return { datos: null, problema: "Asigna el contenido por envase e indica su unidad base." };
      }
    }
    if (
      opciones.thousands_separator &&
      opciones.thousands_separator === opciones.decimal_separator
    ) {
      return {
        datos: null,
        problema: "El separador de miles y el decimal no pueden ser el mismo carácter.",
      };
    }

    // Se guarda el nombre de la columna junto con su posición: la próxima lista se lee por nombre
    // y no por posición, para no aplicar un mapeo viejo a un archivo con otro orden.
    const columnasLimpias: Record<string, { header?: string; position: number }> = {};
    for (const [papel, posicion] of Object.entries(columnas)) {
      const numero = Number(posicion);
      if (Number.isInteger(numero) && numero >= 1) {
        const cabecera = vista.headers[numero - 1];
        columnasLimpias[papel] = cabecera
          ? { header: cabecera, position: numero }
          : { position: numero };
      }
    }

    const unidadesLimpias: Record<string, string> = {};
    for (const [texto, unidad] of Object.entries(unidades)) {
      if (texto.trim() && unidad) unidadesLimpias[texto.trim()] = unidad;
    }

    const opcionesLimpias: Record<string, unknown> = {
      ...opcionesExtra,
      decimal_separator: opciones.decimal_separator || ".",
      create_missing_items: opciones.create_missing_items,
    };
    if (opciones.currency.trim())
      opcionesLimpias["currency"] = opciones.currency.trim().toUpperCase();
    if (opciones.price_basis) opcionesLimpias["price_basis"] = opciones.price_basis;
    if (opciones.thousands_separator) {
      opcionesLimpias["thousands_separator"] = opciones.thousands_separator;
    }
    if (opciones.default_sale_unit) {
      opcionesLimpias["default_sale_unit"] = opciones.default_sale_unit;
    }
    if (columnas["pack"]) opcionesLimpias["pack_base_unit"] = opciones.pack_base_unit;

    return {
      datos: {
        file_format: vista.file_format,
        sheet: vista.file_format === "csv" ? null : hoja,
        header_row: filaEncabezado,
        columns: columnasLimpias,
        units: unidadesLimpias,
        options: opcionesLimpias,
      },
      problema: null,
    };
  };

  const datosActuales = archivo && vista ? construirDatos(false).datos : null;
  const revisionDesactualizada =
    revision !== null &&
    datosActuales !== null &&
    JSON.stringify(datosActuales) !== JSON.stringify(datosRevisados);

  const revisar = async () => {
    const { datos, problema } = construirDatos(false);
    if (!datos) {
      toast.error(problema ?? "Revisa el mapeo antes de continuar.");
      return;
    }
    setRevisando(true);
    setErrorRevision(null);
    try {
      const nueva = await revisarImportacion(fuente.source_id, archivo!, datos, {
        hoja,
        filaEncabezado,
      });
      setRevision(nueva);
      setDatosRevisados(datos);
      setPaso(2);
    } catch (error) {
      setErrorRevision(
        mensajeDeErrorProveedores(error, "No pudimos revisar la planilla. Inténtalo otra vez."),
      );
    } finally {
      setRevisando(false);
    }
  };

  const guardarMapeo = async (datos: DatosPerfil): Promise<boolean> => {
    try {
      const guardado = await guardarPerfilImportacion(fuente.source_id, datos, versionPerfil);
      setPerfil(guardado);
      setVersionPerfil(guardado.version);
      setDatosRevisados(datos);
      return true;
    } catch (error) {
      toast.error(mensajeDeErrorProveedores(error, "No pudimos guardar el mapeo de columnas."));
      if (esConflictoDeVersion(error)) {
        try {
          const respuesta = await obtenerPerfilImportacion(fuente.source_id);
          setPerfil(respuesta.profile);
          setVersionPerfil(respuesta.version);
        } catch {
          // El mensaje del conflicto ya invita a revisar y volver a intentar.
        }
      }
      return false;
    }
  };

  const confirmarImportacion = async () => {
    if (!archivo) {
      toast.error("Primero elige el archivo de la lista de precios.");
      return;
    }
    if (!revision) {
      toast.error("Primero revisa la planilla.");
      return;
    }
    if (revisionDesactualizada) {
      toast.error("La revisión quedó desactualizada. Actualízala antes de importar.");
      setPaso(2);
      return;
    }
    if (revision.rows_accepted === 0) {
      toast.error("La revisión no dejó filas para importar. Corrige el archivo o el mapeo.");
      return;
    }
    const { datos, problema } = construirDatos(true);
    if (!datos) {
      toast.error(problema ?? "Falta información obligatoria para importar.");
      return;
    }

    setOcupado(true);
    try {
      // Se guarda el mapeo revisado antes de importar: el archivo debe leerse con las columnas
      // que la persona acaba de ver, no con un perfil anterior.
      if (!(await guardarMapeo(datos))) return;
      const salida = await importarListaDePrecios({
        supplierId: proveedorId,
        sourceId: fuente.source_id,
        archivo,
        idempotencyKey: claveIdempotencia || nuevaClaveIdempotencia(),
      });
      setResultado(salida);
      if (salida.status === "failed") {
        toast.error("No se aceptó ninguna fila. Revisa el archivo y el mapeo.");
      } else if (salida.rows_rejected > 0) {
        toast.info(
          `Se aceptaron ${salida.rows_accepted} filas y se rechazaron ${salida.rows_rejected}.`,
        );
      } else {
        toast.success(`Se importaron ${salida.rows_accepted} filas.`);
      }
      await onImportado();
    } catch (error) {
      toast.error(mensajeDeErrorProveedores(error, "No pudimos importar la lista de precios."));
    } finally {
      setOcupado(false);
    }
  };

  const reiniciar = () => {
    setArchivo(null);
    setVista(null);
    setRevision(null);
    setDatosRevisados(null);
    setResultado(null);
    setErrorVista(null);
    setErrorRevision(null);
    setAvisoCompatibilidad(null);
    setClaveIdempotencia("");
    setPaso(1);
  };

  if (cargandoPerfil) {
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        Cargando la configuración de la lista…
      </p>
    );
  }

  const listos = revision ? revision.rows_accepted - revision.rows_needs_review : 0;
  const faltanMoneda =
    revision !== null &&
    !columnas["currency"] &&
    revision.problems.some((p) => p.code === "INVALID_CURRENCY");
  const faltanBase =
    revision !== null &&
    !columnas["basis"] &&
    revision.problems.some((p) => p.code === "INVALID_BASIS");
  const unidadSinTraducir = revision?.unrecognised_units ?? [];
  const productosSinVinculo = revision?.problems.find((p) => p.code === "UNMAPPED_PRODUCT");

  return (
    <div className="mt-3 space-y-4 rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-brand-green" />
        <p className="text-sm font-medium">Cargar lista de precios</p>
        <Badge variant="outline">
          {perfil ? `Mapeo guardado (versión ${perfil.version})` : "Sin mapeo guardado"}
        </Badge>
      </div>

      <ol
        className="flex flex-wrap items-center gap-2 text-xs"
        aria-label="Pasos de la importación"
      >
        {[
          { numero: 1 as Paso, texto: "Seleccionar archivo" },
          { numero: 2 as Paso, texto: "Revisar productos" },
          { numero: 3 as Paso, texto: "Confirmar importación" },
        ].map((item) => (
          <li
            key={item.numero}
            aria-current={paso === item.numero ? "step" : undefined}
            className={
              paso === item.numero
                ? "rounded-full bg-brand-green/10 px-3 py-1 font-medium text-foreground"
                : "rounded-full px-3 py-1 text-muted-foreground"
            }
          >
            {item.numero}. {item.texto}
          </li>
        ))}
      </ol>

      {paso === 1 && (
        <>
          <p className="text-xs text-muted-foreground">
            Se aceptan archivos .xlsx, .xls y .csv. Primero se lee el archivo y se muestra lo que se
            entendió; nada se importa hasta que lo confirmes.
          </p>

          <div>
            <Label htmlFor={`${idBase}-archivo`}>Archivo de la lista de precios</Label>
            <Input
              id={`${idBase}-archivo`}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={elegirArchivo}
              className="mt-1 cursor-pointer"
            />
          </div>

          {analizando && (
            <p role="status" className="text-sm text-muted-foreground">
              Leyendo el archivo…
            </p>
          )}

          {errorVista && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No pudimos leer el archivo</AlertTitle>
              <AlertDescription>{errorVista}</AlertDescription>
            </Alert>
          )}

          {avisoCompatibilidad && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>El mapeo guardado no calza con este archivo</AlertTitle>
              <AlertDescription>{avisoCompatibilidad}</AlertDescription>
            </Alert>
          )}

          {vista && (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Formato detectado</p>
                  <p className="text-sm font-medium">{etiquetaFormato(vista.file_format)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Filas con datos</p>
                  <p className="text-sm font-medium">{vista.row_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hoja leída</p>
                  <p className="text-sm font-medium">{vista.sheet ?? "Sin hojas (CSV)"}</p>
                </div>
                {vista.sheets.length > 1 && (
                  <div className="min-w-[180px]">
                    <Label htmlFor={`${idBase}-hoja`} className="text-xs">
                      Hoja
                    </Label>
                    <select
                      id={`${idBase}-hoja`}
                      value={hoja ?? vista.sheets[0] ?? ""}
                      onChange={(evento) => cambiarHoja(evento.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    >
                      {vista.sheets.map((nombre) => (
                        <option key={nombre} value={nombre}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <Label htmlFor={`${idBase}-fila`} className="text-xs">
                    Fila de encabezado
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id={`${idBase}-fila`}
                      type="number"
                      min={1}
                      max={1000}
                      value={filaEncabezado}
                      onChange={(evento) => setFilaEncabezado(Number(evento.target.value) || 1)}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={releerConEncabezado}
                      disabled={analizando}
                    >
                      Volver a leer
                    </Button>
                  </div>
                </div>
              </div>

              <details className="rounded-xl border bg-muted/20 p-3" open={!vista}>
                <summary className="cursor-pointer text-sm font-medium">
                  Configuración avanzada (columnas y opciones técnicas)
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Columnas de la lista</p>
                    <p className="text-xs text-muted-foreground">
                      Normalmente ya vienen asignadas. Cámbialas solo si la lista no se entendió
                      bien: no se inventan datos.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {PAPELES_COLUMNA.map((papel) => {
                        const obligatorio =
                          papel.obligatorio &&
                          !(papel.value === "sale_unit" && opciones.default_sale_unit);
                        const id = `${idBase}-rol-${papel.value}`;
                        return (
                          <div key={papel.value}>
                            <Label htmlFor={id} className="text-sm">
                              {papel.label}
                              {obligatorio ? " (obligatorio)" : " (opcional)"}
                            </Label>
                            <select
                              id={id}
                              value={columnas[papel.value] ?? ""}
                              onChange={(evento) =>
                                setColumnas((previas) => ({
                                  ...previas,
                                  [papel.value]: evento.target.value,
                                }))
                              }
                              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                            >
                              <option value="">Sin asignar</option>
                              {columnasDelArchivo.map((columna) => (
                                <option key={columna.valor} value={columna.valor}>
                                  {columna.etiqueta}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-muted-foreground">{papel.ayuda}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {columnas["sale_unit"] && valoresDeUnidad.length > 0 && (
                    <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                      <p className="text-sm font-medium">Traducción de unidades</p>
                      <p className="text-xs text-muted-foreground">
                        La unidad debe ser caja, paquete, unidad o botella. Traduce los textos
                        vistos; las filas con una unidad sin traducir se rechazan.
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {valoresDeUnidad.map((texto) => {
                          const id = `${idBase}-unidad-${texto}`;
                          return (
                            <div key={texto} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm" title={texto}>
                                «{texto}»
                              </span>
                              <select
                                id={id}
                                aria-label={`Traducción de la unidad ${texto}`}
                                value={unidades[texto] ?? ""}
                                onChange={(evento) =>
                                  setUnidades((previas) => ({
                                    ...previas,
                                    [texto]: evento.target.value,
                                  }))
                                }
                                className="flex h-9 min-w-[150px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                              >
                                <option value="">Sin traducir</option>
                                {UNIDADES_VENTA.map((unidad) => (
                                  <option key={unidad.value} value={unidad.value}>
                                    {unidad.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Datos que no vienen en el archivo</p>
                    <p className="text-xs text-muted-foreground">
                      Solo se usan cuando la columna correspondiente no está mapeada. Moneda y base
                      del precio son obligatorias si el archivo no las trae.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor={`${idBase}-moneda`} className="text-sm">
                          Moneda de la lista
                        </Label>
                        <Input
                          id={`${idBase}-moneda`}
                          value={opciones.currency}
                          onChange={(evento) =>
                            setOpciones((previas) => ({
                              ...previas,
                              currency: evento.target.value,
                            }))
                          }
                          placeholder="Ej. CLP"
                          maxLength={3}
                          className="mt-1 uppercase"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${idBase}-base`} className="text-sm">
                          Base del precio
                        </Label>
                        <select
                          id={`${idBase}-base`}
                          value={opciones.price_basis}
                          onChange={(evento) =>
                            setOpciones((previas) => ({
                              ...previas,
                              price_basis: evento.target.value,
                            }))
                          }
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                        >
                          <option value="">Sin definir</option>
                          <option value="per_commercial_unit">
                            {etiquetaBasePrecio("per_commercial_unit")}
                          </option>
                          <option value="per_base_unit">
                            {etiquetaBasePrecio("per_base_unit")}
                          </option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${idBase}-unidad-defecto`} className="text-sm">
                          Unidad de venta por defecto
                        </Label>
                        <select
                          id={`${idBase}-unidad-defecto`}
                          value={opciones.default_sale_unit}
                          onChange={(evento) =>
                            setOpciones((previas) => ({
                              ...previas,
                              default_sale_unit: evento.target.value,
                            }))
                          }
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                        >
                          <option value="">Sin definir</option>
                          {UNIDADES_VENTA.map((unidad) => (
                            <option key={unidad.value} value={unidad.value}>
                              {unidad.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${idBase}-decimal`} className="text-sm">
                          Separador decimal
                        </Label>
                        <select
                          id={`${idBase}-decimal`}
                          value={opciones.decimal_separator}
                          onChange={(evento) =>
                            setOpciones((previas) => ({
                              ...previas,
                              decimal_separator: evento.target.value,
                            }))
                          }
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                        >
                          <option value=".">Punto (1234.56)</option>
                          <option value=",">Coma (1234,56)</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${idBase}-miles`} className="text-sm">
                          Separador de miles
                        </Label>
                        <select
                          id={`${idBase}-miles`}
                          value={opciones.thousands_separator}
                          onChange={(evento) =>
                            setOpciones((previas) => ({
                              ...previas,
                              thousands_separator: evento.target.value,
                            }))
                          }
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                        >
                          <option value="">Sin separador de miles</option>
                          <option value=".">Punto</option>
                          <option value=",">Coma</option>
                          <option value=" ">Espacio</option>
                        </select>
                      </div>
                      {columnas["pack"] && (
                        <div>
                          <Label htmlFor={`${idBase}-unidad-pack`} className="text-sm">
                            Unidad base del contenido
                          </Label>
                          <select
                            id={`${idBase}-unidad-pack`}
                            value={opciones.pack_base_unit}
                            onChange={(evento) =>
                              setOpciones((previas) => ({
                                ...previas,
                                pack_base_unit: evento.target.value,
                              }))
                            }
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                          >
                            <option value="">Sin definir</option>
                            {UNIDADES_VENTA.map((unidad) => (
                              <option key={unidad.value} value={unidad.value}>
                                {unidad.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`${idBase}-crear`}
                        checked={opciones.create_missing_items}
                        onCheckedChange={(valor) =>
                          setOpciones((previas) => ({
                            ...previas,
                            create_missing_items: valor === true,
                          }))
                        }
                      />
                      <div>
                        <Label htmlFor={`${idBase}-crear`} className="text-sm font-normal">
                          Crear productos nuevos para los códigos que no estén en el catálogo
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Se usa el nombre que publica la lista. Sin esta opción, esas filas se
                          rechazan como «producto sin vínculo».
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              {errorRevision && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No pudimos revisar la planilla</AlertTitle>
                  <AlertDescription>{errorRevision}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void revisar()} disabled={revisando}>
                  <Upload className="h-4 w-4" />
                  {revisando ? "Revisando…" : "Revisar productos"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Revisar no guarda ni importa nada: muestra qué productos se entendieron y qué
                problemas hay.
              </p>
            </>
          )}
        </>
      )}

      {paso === 2 && revision && (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Revisa los productos</p>
            <p className="text-xs text-muted-foreground">
              De {revision.rows_total} filas, {revision.rows_accepted} se pueden importar y{" "}
              {revision.rows_rejected} tienen problemas. Nada se ha importado todavía.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{listos} listos</Badge>
            {revision.rows_needs_review > 0 && (
              <Badge variant="outline">{revision.rows_needs_review} por revisar</Badge>
            )}
            {revision.rows_rejected > 0 && (
              <Badge variant="destructive">{revision.rows_rejected} con problemas</Badge>
            )}
            <Badge variant="outline">
              {revision.profile_source === "saved"
                ? `Mapeo guardado (versión ${revision.profile_version})`
                : "Mapeo de esta pantalla"}
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Precio</th>
                  <th className="px-3 py-2">Unidad</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {revision.rows.map((fila) => (
                  <tr key={fila.row} className="border-t align-top">
                    <td className="px-3 py-2 text-muted-foreground">{fila.row}</td>
                    <td className="px-3 py-2">{fila.sku ?? "—"}</td>
                    <td className="px-3 py-2">
                      {fila.name ?? "—"}
                      {fila.problem && (
                        <p className="text-xs text-destructive">{fila.problem.message}</p>
                      )}
                      {fila.warnings.length > 0 && (
                        <p className="text-xs text-muted-foreground">{fila.warnings.join(" ")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {fila.price ? `${fila.price} ${fila.currency ?? ""}`.trim() : "—"}
                      {fila.price_basis && (
                        <p className="text-xs text-muted-foreground">
                          {etiquetaBasePrecio(fila.price_basis)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {fila.sale_unit ? etiquetaUnidad(fila.sale_unit) : "—"}
                      {fila.sale_unit_text && (
                        <p className="text-xs text-muted-foreground">{fila.sale_unit_text}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          fila.status === "rejected"
                            ? "destructive"
                            : fila.status === "review"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {etiquetaEstadoFila(fila.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {revision.rows_truncated && (
            <p className="text-xs text-muted-foreground">
              La tabla muestra las primeras {revision.rows.length} filas; los conteos y los
              problemas consideran el archivo completo.
            </p>
          )}

          {revision.problems.length > 0 && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">Qué impide importar algunas filas</p>
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
              <p className="text-xs text-muted-foreground">
                Esas filas no se importarán. Corrige el archivo original y vuelve a cargarlo si
                quieres incluirlas.
              </p>
            </div>
          )}

          {(faltanMoneda || faltanBase || unidadSinTraducir.length > 0 || productosSinVinculo) && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">Necesitamos confirmar algunos datos</p>
              <p className="text-xs text-muted-foreground">
                Son datos obligatorios que el archivo no trae con certeza. No se completan solos.
              </p>

              {faltanMoneda && (
                <div>
                  <Label htmlFor={`${idBase}-moneda-revision`} className="text-sm">
                    ¿En qué moneda están los precios? (código de 3 letras)
                  </Label>
                  <Input
                    id={`${idBase}-moneda-revision`}
                    value={opciones.currency}
                    onChange={(evento) =>
                      setOpciones((previas) => ({ ...previas, currency: evento.target.value }))
                    }
                    placeholder="Ej. CLP"
                    maxLength={3}
                    className="mt-1 w-32 uppercase"
                  />
                </div>
              )}

              {faltanBase && (
                <div>
                  <Label htmlFor={`${idBase}-base-revision`} className="text-sm">
                    ¿El precio es por unidad de venta o por unidad base?
                  </Label>
                  <select
                    id={`${idBase}-base-revision`}
                    value={opciones.price_basis}
                    onChange={(evento) =>
                      setOpciones((previas) => ({
                        ...previas,
                        price_basis: evento.target.value,
                      }))
                    }
                    className="mt-1 flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="">Sin definir</option>
                    <option value="per_commercial_unit">
                      {etiquetaBasePrecio("per_commercial_unit")}
                    </option>
                    <option value="per_base_unit">{etiquetaBasePrecio("per_base_unit")}</option>
                  </select>
                </div>
              )}

              {unidadSinTraducir.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm">Traduce las unidades que la lista usa:</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {unidadSinTraducir.map((unidad) => (
                      <div key={unidad.text} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm" title={unidad.text}>
                          «{unidad.text}» · {unidad.count} {unidad.count === 1 ? "fila" : "filas"}
                        </span>
                        <select
                          aria-label={`Traducción de la unidad ${unidad.text} para la revisión`}
                          value={unidades[unidad.text] ?? ""}
                          onChange={(evento) =>
                            setUnidades((previas) => ({
                              ...previas,
                              [unidad.text]: evento.target.value,
                            }))
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

              {productosSinVinculo && !opciones.create_missing_items && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`${idBase}-crear-revision`}
                    checked={opciones.create_missing_items}
                    onCheckedChange={(valor) =>
                      setOpciones((previas) => ({
                        ...previas,
                        create_missing_items: valor === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor={`${idBase}-crear-revision`} className="text-sm font-normal">
                      Crear productos nuevos para los códigos que no están en el catálogo (
                      {productosSinVinculo.count}{" "}
                      {productosSinVinculo.count === 1 ? "fila" : "filas"})
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se usará únicamente el nombre que publica la lista. No se vinculan productos
                      por parecido de nombre.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {errorRevision && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No pudimos revisar la planilla</AlertTitle>
              <AlertDescription>{errorRevision}</AlertDescription>
            </Alert>
          )}

          {revisionDesactualizada && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>La revisión está desactualizada</AlertTitle>
              <AlertDescription>
                Cambiaste el mapeo o algún dato. Actualiza la revisión para ver los conteos reales
                antes de confirmar.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(1)} disabled={revisando}>
              Volver al archivo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void revisar()}
              disabled={revisando}
            >
              {revisando ? "Actualizando…" : "Actualizar revisión"}
            </Button>
            <Button
              type="button"
              onClick={() => setPaso(3)}
              disabled={revisando || revisionDesactualizada || revision.rows_accepted === 0}
            >
              Continuar
            </Button>
          </div>
          {revision.rows_accepted === 0 && (
            <p className="text-xs text-destructive">
              No hay filas válidas para importar. Corrige el archivo o el mapeo y vuelve a revisar.
            </p>
          )}
        </>
      )}

      {paso === 3 && revision && !resultado && (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Confirma la importación</p>
            <p className="text-xs text-muted-foreground">
              Se importarán {revision.rows_accepted} de {revision.rows_total} filas. El mapeo
              revisado quedará guardado para las próximas listas de este proveedor.
            </p>
          </div>

          <ul className="space-y-1 text-sm">
            <li>
              {listos} {listos === 1 ? "producto listo" : "productos listos"} para importar.
            </li>
            {revision.rows_needs_review > 0 && (
              <li>
                {revision.rows_needs_review} filas con condiciones comerciales quedarán marcadas
                para revisión; no se inventan condiciones.
              </li>
            )}
            {revision.rows_rejected > 0 && (
              <li className="text-muted-foreground">
                {revision.rows_rejected} filas con problemas no se importarán.
              </li>
            )}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(2)} disabled={ocupado}>
              Volver a la revisión
            </Button>
            <Button type="button" onClick={() => void confirmarImportacion()} disabled={ocupado}>
              <Upload className="h-4 w-4" />
              {ocupado ? "Importando…" : "Confirmar importación"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Un archivo idéntico no se vuelve a procesar: el sistema devuelve el resultado original
            para no duplicar precios.
          </p>
        </>
      )}

      {resultado && (
        <div className="space-y-2 rounded-xl border p-3" role="status">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{etiquetaEstadoImportacion(resultado.status)}</p>
            <Badge variant="outline">
              {resultado.rows_accepted} de {resultado.rows_total} filas aceptadas
            </Badge>
            {resultado.rows_rejected > 0 && (
              <Badge variant="destructive">{resultado.rows_rejected} rechazadas</Badge>
            )}
          </div>
          {resultado.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
              {resultado.errors.slice(0, 20).map((error) => (
                <li key={`${error.row}-${error.code}-${error.message}`}>
                  Fila {error.row}: {error.message} ({error.code})
                </li>
              ))}
            </ul>
          )}
          {resultado.errors.length > 20 && (
            <p className="text-xs text-muted-foreground">
              Se muestran los primeros 20 motivos de {resultado.errors.length}.
            </p>
          )}
          <Button type="button" variant="outline" onClick={reiniciar}>
            Cargar otra lista
          </Button>
        </div>
      )}

      {perfil && !archivo && (
        <p className="text-xs text-muted-foreground">
          Hay un mapeo guardado para {etiquetaFormato(perfil.file_format)}
          {perfil.sheet ? `, hoja «${perfil.sheet}»` : ""}. Elige el archivo para revisarlo o
          importarlo.
        </p>
      )}

      {!perfil && !archivo && (
        <p className="text-xs text-muted-foreground">
          Esta fuente todavía no tiene mapeo. Elige el archivo del proveedor para empezar.
        </p>
      )}

      {perfil && !archivo && perfil.options["default_sale_unit"] != null && (
        <p className="text-xs text-muted-foreground">
          Unidad por defecto guardada: {etiquetaUnidad(String(perfil.options["default_sale_unit"]))}
          .
        </p>
      )}

      {perfil && !archivo && unidades && Object.keys(unidades).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Unidades traducidas en el mapeo:{" "}
          {Object.entries(unidades)
            .map(([texto, unidad]) => `${texto} → ${etiquetaUnidad(unidad)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
