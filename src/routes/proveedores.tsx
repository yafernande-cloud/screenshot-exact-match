import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  FileSpreadsheet,
  Globe,
  Layers,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";

import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { ImportadorLista } from "@/components/proveedores/ImportadorLista";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mensajeMotivo } from "@/lib/proveedores-en-vivo";
import {
  CAPACIDADES_FUENTE,
  actualizarFuente,
  actualizarProveedor,
  crearFuente,
  crearProveedor,
  esConflictoDeVersion,
  esFuenteApi,
  esFuenteDeArchivo,
  etiquetaBasePrecio,
  etiquetaCapacidad,
  etiquetaEstadoFuente,
  etiquetaEstadoPortal,
  etiquetaEstadoRevision,
  etiquetaTipoFuente,
  etiquetaUnidad,
  listarFuentes,
  listarOfertasProveedor,
  listarProveedores,
  mensajeDeErrorProveedores,
  obtenerEstadoConexionFuente,
  proveedorUsaPortal,
  type CapacidadFuente,
  type EstadoConexionFuente,
  type Fuente,
  type OfertaImportada,
  type Proveedor,
} from "@/lib/proveedores-api";

export const Route = createFileRoute("/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores · Cotizador para farmacia" },
      { name: "description", content: "Administra los proveedores y las fuentes de sus precios." },
      { property: "og:title", content: "Proveedores · Cotizador para farmacia" },
      {
        property: "og:description",
        content: "Administra los proveedores y las fuentes de sus precios.",
      },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary" },
    ],
  }),
  component: Proveedores,
});

type Modalidad = "portal" | "lista" | "ambas";

/** Estado de la lectura del perfil de conector de una fuente API. */
type EstadoConexionCargado = { perfil: EstadoConexionFuente | null; error: string | null };

const ETIQUETA_ESTADO_CONEXION: Record<EstadoConexionFuente["state"], string> = {
  connected: "Conectado",
  not_configured: "Sin conexión",
  error: "Error de conexión",
  requires_intervention: "Requiere revisión",
};

/** Mismos colores de estado que la pantalla de proveedores en vivo. */
const ESTILO_ESTADO_CONEXION: Record<EstadoConexionFuente["state"], string> = {
  connected: "border-brand-green/40 text-brand-green",
  not_configured: "border-muted-foreground/30 text-muted-foreground",
  error: "border-destructive/40 text-destructive",
  requires_intervention: "border-amber-500/50 text-amber-700",
};

function porNombre<T extends { name: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL");
}

/** Texto comparable: sin distinguir mayúsculas, minúsculas ni tildes. */
function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Fecha y hora de la última respuesta registrada, no una comprobación en este momento. */
function fechaHoraCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function precioLegible(monto: string, moneda: string): string {
  const numero = Number(monto);
  if (!Number.isFinite(numero)) return `${monto} ${moneda}`;
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda }).format(numero);
  } catch {
    return `${numero.toLocaleString("es-CL")} ${moneda}`;
  }
}

function urlValida(valor: string): boolean {
  if (!valor.trim()) return true;
  try {
    const url = new URL(valor.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [conexiones, setConexiones] = useState<Record<string, EstadoConexionCargado>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  /**
   * Lee el estado real de las fuentes API. Un fallo en una fuente no oculta las demás ni rompe la
   * pantalla: esa fuente queda con su propio aviso, sin suponer que está conectada.
   */
  const cargarConexiones = useCallback(async (todas: Fuente[]) => {
    const api = todas.filter(esFuenteApi);
    if (api.length === 0) {
      setConexiones({});
      return;
    }
    const entradas = await Promise.all(
      api.map(async (fuente) => {
        try {
          const perfil = await obtenerEstadoConexionFuente(fuente.source_id);
          return [fuente.source_id, { perfil, error: null }] as const;
        } catch (error) {
          return [
            fuente.source_id,
            {
              perfil: null,
              error: mensajeDeErrorProveedores(
                error,
                "No pudimos leer el estado de la conexión. Inténtalo otra vez.",
              ),
            },
          ] as const;
        }
      }),
    );
    setConexiones(Object.fromEntries(entradas));
  }, []);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const [proveedoresApi, fuentesApi] = await Promise.all([
        listarProveedores(),
        listarFuentes(),
      ]);
      setProveedores(porNombre(proveedoresApi));
      setFuentes(porNombre(fuentesApi));
      // La lista se muestra de inmediato; cada fuente API informa su conexión al llegar.
      setCargando(false);
      await cargarConexiones(fuentesApi);
    } catch (error) {
      setErrorCarga(
        mensajeDeErrorProveedores(error, "No pudimos cargar los proveedores. Inténtalo otra vez."),
      );
    } finally {
      setCargando(false);
    }
  }, [cargarConexiones]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recargar = useCallback(async () => {
    setCargando(true);
    await cargar();
  }, [cargar]);

  /**
   * Refleja en pantalla lo que el backend confirmó. Si el proveedor o la fuente ya existía se
   * reemplaza; nunca se agrega una copia.
   */
  const guardarProveedor = useCallback((proveedor: Proveedor) => {
    setProveedores((previos) => {
      const existe = previos.some((p) => p.supplier_id === proveedor.supplier_id);
      const siguiente = existe
        ? previos.map((p) => (p.supplier_id === proveedor.supplier_id ? proveedor : p))
        : [...previos, proveedor];
      return porNombre(siguiente);
    });
  }, []);

  const guardarFuente = useCallback((fuente: Fuente) => {
    setFuentes((previas) => {
      const existe = previas.some((f) => f.source_id === fuente.source_id);
      const siguiente = existe
        ? previas.map((f) => (f.source_id === fuente.source_id ? fuente : f))
        : [...previas, fuente];
      return porNombre(siguiente);
    });
  }, []);

  const proveedorCreado = useCallback(
    (proveedor: Proveedor, fuente: Fuente | null) => {
      guardarProveedor(proveedor);
      if (fuente) guardarFuente(fuente);
    },
    [guardarFuente, guardarProveedor],
  );

  const activos = proveedores.filter((p) => p.status === "active").length;
  // El filtro es local: trabaja sobre lo ya cargado y no consulta al servidor.
  const termino = normalizarTexto(busqueda);
  const filtroActivo = termino !== "";
  const filtrados = filtroActivo
    ? proveedores.filter((proveedor) => normalizarTexto(proveedor.name).includes(termino))
    : proveedores;

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-6 pb-24">
        <EncabezadoPagina
          titulo="Proveedores"
          bajada="Registra a quién le compras y cómo obtienes sus precios: por su portal web, con una lista de precios, o ambos."
        />

        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Agregar proveedor</h2>
            <p className="text-sm text-muted-foreground">
              Primero el nombre y luego cómo obtienes sus precios. El código interno y las notas son
              opcionales.
            </p>
          </div>
          <FormularioNuevoProveedor onCreado={proveedorCreado} onRecargar={recargar} />
        </section>

        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Truck className="h-5 w-5 text-brand-green" />
            <h2 className="text-lg font-semibold">Proveedores registrados</h2>
            {!cargando && !errorCarga && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {activos} activos de {proveedores.length}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => void recargar()}
              disabled={cargando}
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>

          {!cargando && !errorCarga && proveedores.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex w-full items-center gap-2 rounded-full border bg-background px-4 py-2 sm:w-80">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Buscar proveedor por nombre..."
                  aria-label="Buscar proveedor por nombre"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
              {filtroActivo && (
                <p role="status" className="text-sm text-muted-foreground">
                  {filtrados.length} de {proveedores.length} proveedores coinciden
                </p>
              )}
            </div>
          )}

          {cargando ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Cargando proveedores…
            </p>
          ) : errorCarga ? (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No pudimos cargar los proveedores</AlertTitle>
              <AlertDescription>
                <p>{errorCarga}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void recargar()}
                >
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : proveedores.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Todavía no hay proveedores registrados. Agrega el primero para empezar.
            </p>
          ) : filtrados.length === 0 ? (
            <p className="mt-4 py-6 text-sm text-muted-foreground">No se encontraron proveedores</p>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((proveedor) => (
                <TarjetaProveedor
                  key={proveedor.supplier_id}
                  proveedor={proveedor}
                  fuentes={fuentes.filter((f) => f.supplier_id === proveedor.supplier_id)}
                  conexiones={conexiones}
                  onProveedorGuardado={guardarProveedor}
                  onFuenteGuardada={guardarFuente}
                  onRecargar={recargar}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function OpcionModalidad({
  valor,
  actual,
  titulo,
  descripcion,
  onCambio,
}: {
  valor: Modalidad;
  actual: Modalidad;
  titulo: string;
  descripcion: string;
  onCambio: (valor: Modalidad) => void;
}) {
  const marcada = actual === valor;
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${
        marcada ? "border-brand-green bg-brand-green/5" : "bg-background hover:bg-muted/40"
      }`}
    >
      <input
        type="radio"
        name="modalidad-proveedor"
        value={valor}
        checked={marcada}
        onChange={() => onCambio(valor)}
        className="mt-1 accent-primary"
      />
      <span>
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{descripcion}</span>
      </span>
    </label>
  );
}

function FormularioNuevoProveedor({
  onCreado,
  onRecargar,
}: {
  onCreado: (proveedor: Proveedor, fuente: Fuente | null) => void;
  onRecargar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("lista");
  const [portalUrl, setPortalUrl] = useState("");
  const [portalUsuario, setPortalUsuario] = useState("");
  const [portalClave, setPortalClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [notas, setNotas] = useState("");
  const [verOpcionales, setVerOpcionales] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const usaPortal = modalidad === "portal" || modalidad === "ambas";
  const usaLista = modalidad === "lista" || modalidad === "ambas";

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe el nombre del proveedor.");
      return;
    }
    if (usaPortal) {
      if (!urlValida(portalUrl)) {
        toast.error("La dirección del portal debe empezar con http:// o https://.");
        return;
      }
      const usuario = portalUsuario.trim();
      if (Boolean(usuario) !== Boolean(portalClave)) {
        toast.error("Escribe el usuario y la contraseña del portal juntos, o deja ambos vacíos.");
        return;
      }
      if (usuario && !portalUrl.trim()) {
        toast.error("Escribe la dirección del portal para guardar el usuario y la contraseña.");
        return;
      }
    }

    setEnviando(true);
    try {
      const datos: Parameters<typeof crearProveedor>[0] = {
        name: limpio,
        supplier_code: codigo,
        notes: notas,
      };
      if (usaPortal) {
        datos.portal_url = portalUrl;
        datos.portal_username = portalUsuario.trim() || null;
        datos.portal_password = portalClave || null;
      }
      const proveedor = await crearProveedor(datos);

      setNombre("");
      setPortalUrl("");
      setPortalUsuario("");
      setPortalClave("");
      setCodigo("");
      setNotas("");

      if (!usaLista) {
        onCreado(proveedor, null);
        toast.success(`${proveedor.name} quedó registrado.`);
        return;
      }

      // La modalidad «lista de precios» crea la fuente que después recibirá el archivo. Todavía no
      // hay precios: la fuente queda sin cargas hasta que se importe la primera planilla.
      try {
        const fuente = await crearFuente({
          name: `Lista de precios · ${proveedor.name}`.slice(0, 200),
          supplier_id: proveedor.supplier_id,
          capabilities: ["product_detail", "price"],
        });
        onCreado(proveedor, fuente);
        toast.success(
          `${proveedor.name} quedó registrado. Carga su lista de precios en la tarjeta del proveedor.`,
        );
      } catch (error) {
        onCreado(proveedor, null);
        if (esConflictoDeVersion(error)) await onRecargar();
        toast.error(
          `El proveedor quedó registrado, pero no pudimos crear su fuente de precios. ${mensajeDeErrorProveedores(error, "Inténtalo otra vez desde su tarjeta.")}`,
        );
      }
    } catch (error) {
      toast.error(
        mensajeDeErrorProveedores(error, "No pudimos registrar el proveedor. Inténtalo otra vez."),
      );
      if (esConflictoDeVersion(error)) await onRecargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="md:max-w-xl">
        <Label htmlFor="nuevo-proveedor-nombre">Nombre del proveedor</Label>
        <Input
          id="nuevo-proveedor-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Distribuidora Andes"
          className="mt-1"
          maxLength={200}
          required
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿Cómo obtienes sus precios?</legend>
        <div className="grid gap-2 md:grid-cols-3">
          <OpcionModalidad
            valor="portal"
            actual={modalidad}
            titulo="Portal web"
            descripcion="Tiene un sitio de compras con usuario y contraseña."
            onCambio={setModalidad}
          />
          <OpcionModalidad
            valor="lista"
            actual={modalidad}
            titulo="Lista de precios"
            descripcion="Envía un archivo Excel o CSV con productos y precios."
            onCambio={setModalidad}
          />
          <OpcionModalidad
            valor="ambas"
            actual={modalidad}
            titulo="Portal y lista"
            descripcion="Usa su portal y además entrega listas de precios."
            onCambio={setModalidad}
          />
        </div>
      </fieldset>

      {usaPortal && (
        <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 md:grid-cols-3">
          <div>
            <Label htmlFor="nuevo-proveedor-portal-url">Dirección del portal</Label>
            <Input
              id="nuevo-proveedor-portal-url"
              type="url"
              value={portalUrl}
              onChange={(e) => setPortalUrl(e.target.value)}
              placeholder="https://compras.proveedor.cl"
              className="mt-1"
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="nuevo-proveedor-portal-usuario">Usuario del portal</Label>
            <Input
              id="nuevo-proveedor-portal-usuario"
              value={portalUsuario}
              onChange={(e) => setPortalUsuario(e.target.value)}
              autoComplete="username"
              className="mt-1"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="nuevo-proveedor-portal-clave">Contraseña del portal</Label>
            <Input
              id="nuevo-proveedor-portal-clave"
              type="password"
              value={portalClave}
              onChange={(e) => setPortalClave(e.target.value)}
              autoComplete="new-password"
              className="mt-1"
              maxLength={500}
            />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            La contraseña se guarda cifrada y no se vuelve a mostrar. Guardar estos datos no conecta
            el portal: todavía no existe un conector que inicie sesión.
          </p>
        </div>
      )}

      {usaLista && (
        <p className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Al registrar el proveedor se crea su fuente de precios. Después podrás cargar el archivo
          .xlsx, .xls o .csv desde su tarjeta y revisar la vista previa antes de importar.
        </p>
      )}

      <div className="rounded-2xl border p-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0"
          onClick={() => setVerOpcionales((valor) => !valor)}
        >
          {verOpcionales ? "Ocultar datos internos" : "Datos internos (opcional)"}
        </Button>
        {verOpcionales && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="nuevo-proveedor-codigo">Código interno (opcional)</Label>
              <Input
                id="nuevo-proveedor-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. AND-01"
                className="mt-1"
                maxLength={60}
              />
            </div>
            <div>
              <Label htmlFor="nuevo-proveedor-notas">Notas (opcional)</Label>
              <Input
                id="nuevo-proveedor-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. Contacto comercial, condiciones acordadas"
                className="mt-1"
                maxLength={2000}
              />
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={enviando}>
        <Plus className="h-4 w-4" />
        {enviando ? "Agregando…" : "Agregar proveedor"}
      </Button>
    </form>
  );
}

/** Modalidad en palabras de la persona que compra: sin `source.mode` ni nombres técnicos. */
function resumenModalidad({
  tieneLista,
  tieneConexion,
  usaPortal,
}: {
  tieneLista: boolean;
  tieneConexion: boolean;
  usaPortal: boolean;
}): string {
  const partes: string[] = [];
  if (tieneLista) partes.push("Lista de precios Excel");
  if (tieneConexion) partes.push("Consulta en vivo");
  if (usaPortal) partes.push("Portal de compras");
  return partes.length > 0 ? partes.join(" · ") : "Sin fuentes de precios configuradas";
}

/** Estado de carga de la lista de precios, solo con datos reales. */
function resumenLista(fuentesArchivo: Fuente[]): string | null {
  if (fuentesArchivo.length === 0) return null;
  const cargas = fuentesArchivo
    .map((fuente) => fuente.last_success_at)
    .filter((iso): iso is string => Boolean(iso))
    .sort()
    .reverse();
  return cargas[0] ? `Última lista cargada: ${fechaCorta(cargas[0])}` : "Sin archivo cargado";
}

/** Estado de conexión de las fuentes en vivo, tal como lo informa cada perfil. */
function resumenConexion(
  fuentesApi: Fuente[],
  conexiones: Record<string, EstadoConexionCargado>,
): string | null {
  if (fuentesApi.length === 0) return null;
  const estados = fuentesApi.map((fuente) => {
    const dato = conexiones[fuente.source_id];
    if (!dato) return "Leyendo el estado de la conexión…";
    if (dato.error) return "Estado de conexión no disponible";
    return ETIQUETA_ESTADO_CONEXION[dato.perfil?.state ?? "not_configured"];
  });
  return [...new Set(estados)].join(" · ");
}

function TarjetaProveedor({
  proveedor,
  fuentes,
  conexiones,
  onProveedorGuardado,
  onFuenteGuardada,
  onRecargar,
}: {
  proveedor: Proveedor;
  fuentes: Fuente[];
  conexiones: Record<string, EstadoConexionCargado>;
  onProveedorGuardado: (proveedor: Proveedor) => void;
  onFuenteGuardada: (fuente: Fuente) => void;
  onRecargar: () => Promise<void>;
}) {
  const activo = proveedor.status === "active";
  const [ocupado, setOcupado] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [fuenteParaImportar, setFuenteParaImportar] = useState<string | null>(null);
  const [nombre, setNombre] = useState(proveedor.name);
  const [codigo, setCodigo] = useState(proveedor.supplier_code ?? "");
  const [notas, setNotas] = useState(proveedor.internal_notes ?? "");
  const [refrescoOfertas, setRefrescoOfertas] = useState(0);
  const [portalAbierto, setPortalAbierto] = useState(false);
  const usaPortal = proveedorUsaPortal(proveedor);
  const cerrarPanel = useCallback(() => {
    setPanelAbierto(false);
    setFuenteParaImportar(null);
  }, []);
  // El panel de configuración se cierra con Escape, además del botón explícito.
  useEffect(() => {
    if (!panelAbierto) return;
    const alPresionar = (event: KeyboardEvent) => {
      if (event.key === "Escape") cerrarPanel();
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [panelAbierto, cerrarPanel]);
  const mostrarPortal = usaPortal || portalAbierto;
  const fuentesApi = fuentes.filter(esFuenteApi);
  const fuentesArchivo = fuentes.filter(esFuenteDeArchivo);
  const modalidad = resumenModalidad({
    tieneLista: fuentesArchivo.length > 0,
    tieneConexion: fuentesApi.length > 0,
    usaPortal,
  });
  const estadoLista = resumenLista(fuentesArchivo);
  const estadoConexion = resumenConexion(fuentesApi, conexiones);
  const idPanel = `panel-proveedor-${proveedor.supplier_id}`;

  const avisar = (error: unknown, fallback: string) => {
    toast.error(mensajeDeErrorProveedores(error, fallback));
    if (esConflictoDeVersion(error)) void onRecargar();
  };

  const abrirPanel = () => {
    setNombre(proveedor.name);
    setCodigo(proveedor.supplier_code ?? "");
    setNotas(proveedor.internal_notes ?? "");
    setFuenteParaImportar(null);
    setPanelAbierto(true);
  };

  /** Cargar Excel abre la misma configuración con el importador ya desplegado. */
  const abrirImportador = () => {
    setNombre(proveedor.name);
    setCodigo(proveedor.supplier_code ?? "");
    setNotas(proveedor.internal_notes ?? "");
    setFuenteParaImportar(fuentesArchivo[0]?.source_id ?? null);
    setPanelAbierto(true);
  };

  const alternarActivo = async (valor: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const actualizado = await actualizarProveedor(proveedor, {
        status: valor ? "active" : "inactive",
      });
      onProveedorGuardado(actualizado);
      toast.success(
        valor
          ? `${actualizado.name} quedó activo.`
          : `${actualizado.name} quedó inactivo. Su historial se conserva.`,
      );
    } catch (error) {
      avisar(error, "No pudimos cambiar el estado del proveedor. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const guardarEdicion = async (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("El nombre del proveedor no puede quedar vacío.");
      return;
    }
    setOcupado(true);
    try {
      const actualizado = await actualizarProveedor(proveedor, {
        name: limpio,
        supplier_code: codigo,
        notes: notas,
      });
      onProveedorGuardado(actualizado);
      toast.success("Cambios guardados.");
    } catch (error) {
      avisar(error, "No pudimos guardar los cambios. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const alImportar = async () => {
    setRefrescoOfertas((valor) => valor + 1);
    await onRecargar();
  };

  return (
    <li className="flex flex-col rounded-2xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{proveedor.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{modalidad}</p>
        </div>
        <Badge variant={activo ? "secondary" : "outline"}>{activo ? "Activo" : "Inactivo"}</Badge>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {estadoLista && (
          <p>
            <span className="text-muted-foreground">Estado de carga: </span>
            {estadoLista}
          </p>
        )}
        {estadoConexion && (
          <p>
            <span className="text-muted-foreground">Estado de conexión: </span>
            {estadoConexion}
          </p>
        )}
        {usaPortal && (
          <p>
            <span className="text-muted-foreground">Portal de compras: </span>
            {etiquetaEstadoPortal(proveedor.portal_status)}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {fuentesArchivo.length > 0 && (
          <Button type="button" size="sm" onClick={abrirImportador}>
            <FileSpreadsheet className="h-4 w-4" />
            Cargar Excel
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={abrirPanel}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>

      {panelAbierto && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cerrarPanel();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={idPanel}
            className="mx-auto my-2 w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-lg sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={idPanel} className="text-lg font-semibold">
                  Configuración de {proveedor.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Datos generales, fuentes de precios y portal. Los cambios se guardan contra el
                  servidor y se reflejan en la tarjeta.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar configuración"
                onClick={cerrarPanel}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              <form
                onSubmit={guardarEdicion}
                className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2"
              >
                <div className="md:col-span-2">
                  <Label htmlFor={`proveedor-nombre-${proveedor.supplier_id}`}>Nombre</Label>
                  <Input
                    id={`proveedor-nombre-${proveedor.supplier_id}`}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="mt-1"
                    maxLength={200}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`proveedor-codigo-${proveedor.supplier_id}`}>
                    Código interno del proveedor (opcional)
                  </Label>
                  <Input
                    id={`proveedor-codigo-${proveedor.supplier_id}`}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="mt-1"
                    maxLength={60}
                  />
                </div>
                <div>
                  <Label htmlFor={`proveedor-notas-${proveedor.supplier_id}`}>
                    Notas del proveedor (opcional)
                  </Label>
                  <Input
                    id={`proveedor-notas-${proveedor.supplier_id}`}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="mt-1"
                    maxLength={2000}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      checked={activo}
                      disabled={ocupado}
                      onCheckedChange={(valor) => {
                        if (typeof valor === "boolean") void alternarActivo(valor);
                      }}
                      aria-label={`Activar o desactivar ${proveedor.name}`}
                    />
                    {activo ? "Proveedor activo" : "Proveedor inactivo"}
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={ocupado}>
                      {ocupado ? "Guardando…" : "Guardar cambios"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cerrarPanel}
                      disabled={ocupado}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              </form>

              <SeccionFuentes
                proveedor={proveedor}
                fuentes={fuentes}
                conexiones={conexiones}
                onFuenteGuardada={onFuenteGuardada}
                onRecargar={alImportar}
                importarFuenteId={fuenteParaImportar}
              />

              {mostrarPortal ? (
                <SeccionPortal
                  proveedor={proveedor}
                  inicialmenteEditando={!usaPortal && portalAbierto}
                  onCerrar={portalAbierto && !usaPortal ? () => setPortalAbierto(false) : undefined}
                  onGuardado={onProveedorGuardado}
                  onRecargar={onRecargar}
                />
              ) : (
                <div className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Portal de compras</p>
                      <p className="text-xs text-muted-foreground">
                        Guarda la dirección y las credenciales cuando corresponda. No conecta el
                        portal.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPortalAbierto(true)}
                    >
                      <Globe className="h-4 w-4" />
                      Agregar portal
                    </Button>
                  </div>
                </div>
              )}

              {fuentesArchivo.length > 0 && (
                <PreciosImportados proveedor={proveedor} refresco={refrescoOfertas} />
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function SeccionPortal({
  proveedor,
  inicialmenteEditando = false,
  onCerrar,
  onGuardado,
  onRecargar,
}: {
  proveedor: Proveedor;
  inicialmenteEditando?: boolean;
  onCerrar?: (() => void) | undefined;
  onGuardado: (proveedor: Proveedor) => void;
  onRecargar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(inicialmenteEditando);
  const [url, setUrl] = useState(proveedor.portal_url ?? "");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const idBase = `portal-${proveedor.supplier_id}`;

  const avisar = (error: unknown, fallback: string) => {
    toast.error(mensajeDeErrorProveedores(error, fallback));
    if (esConflictoDeVersion(error)) void onRecargar();
  };

  const abrir = () => {
    setUrl(proveedor.portal_url ?? "");
    setUsuario("");
    setClave("");
    setEditando(true);
  };

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!urlValida(url)) {
      toast.error("La dirección del portal debe empezar con http:// o https://.");
      return;
    }
    const usuarioLimpio = usuario.trim();
    if (Boolean(usuarioLimpio) !== Boolean(clave)) {
      toast.error("Escribe el usuario y la contraseña juntos, o deja ambos vacíos.");
      return;
    }
    if (usuarioLimpio && !url.trim()) {
      toast.error("Escribe la dirección del portal para guardar el usuario y la contraseña.");
      return;
    }
    setOcupado(true);
    try {
      const cambios: Parameters<typeof actualizarProveedor>[1] = { portal_url: url };
      if (usuarioLimpio && clave) {
        cambios.portal_username = usuarioLimpio;
        cambios.portal_password = clave;
      }
      const actualizado = await actualizarProveedor(proveedor, cambios);
      onGuardado(actualizado);
      setEditando(false);
      setUsuario("");
      setClave("");
      toast.success(
        usuarioLimpio
          ? "Los datos del portal quedaron guardados. No significa que el portal esté conectado."
          : "La dirección del portal quedó guardada.",
      );
    } catch (error) {
      avisar(error, "No pudimos guardar los datos del portal. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const quitarCredenciales = async () => {
    setOcupado(true);
    try {
      const actualizado = await actualizarProveedor(proveedor, {
        portal_username: null,
        portal_password: null,
      });
      onGuardado(actualizado);
      setConfirmandoQuitar(false);
      toast.success("Se quitaron el usuario y la contraseña guardados.");
    } catch (error) {
      avisar(error, "No pudimos quitar las credenciales. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Globe className="h-4 w-4 text-brand-green" />
        <p className="text-sm font-medium">Portal de compras</p>
        <Badge variant={proveedor.portal_status === "credentials_saved" ? "secondary" : "outline"}>
          {etiquetaEstadoPortal(proveedor.portal_status)}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {onCerrar && !editando && (
            <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
              Ocultar
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (editando ? setEditando(false) : abrir())}
          >
            {editando ? "Cerrar" : proveedor.portal_url ? "Cambiar datos" : "Configurar portal"}
          </Button>
        </div>
      </div>

      {!editando && (
        <>
          {proveedor.portal_url ? (
            <p className="mt-2 break-all text-sm text-muted-foreground">{proveedor.portal_url}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Sin dirección configurada.</p>
          )}
          {proveedor.has_portal_credentials && (
            <p className="mt-1 text-xs text-muted-foreground">
              Hay usuario y contraseña guardados y cifrados. La API nunca los devuelve.
            </p>
          )}
          {proveedor.portal_status === "credentials_saved" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Guardar credenciales no conecta el portal: todavía no existe un conector que inicie
              sesión de compras.
            </p>
          )}
          {proveedor.has_portal_credentials && (
            <div className="mt-2">
              {confirmandoQuitar ? (
                <div
                  role="group"
                  aria-label="Confirmar quitar credenciales"
                  className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3"
                >
                  <p className="text-sm">
                    ¿Quitar el usuario y la contraseña guardados? La dirección se conserva.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void quitarCredenciales()}
                    disabled={ocupado}
                  >
                    Sí, quitar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmandoQuitar(false)}
                    disabled={ocupado}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 text-muted-foreground"
                  onClick={() => setConfirmandoQuitar(true)}
                >
                  Quitar credenciales
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {editando && (
        <form onSubmit={guardar} className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-3">
            <Label htmlFor={`${idBase}-url`}>Dirección del portal</Label>
            <Input
              id={`${idBase}-url`}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://compras.proveedor.cl"
              className="mt-1"
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor={`${idBase}-usuario`}>Usuario del portal</Label>
            <Input
              id={`${idBase}-usuario`}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              className="mt-1"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor={`${idBase}-clave`}>Contraseña del portal</Label>
            <Input
              id={`${idBase}-clave`}
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="new-password"
              className="mt-1"
              maxLength={500}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar datos"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditando(false)}
              disabled={ocupado}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            La contraseña se guarda cifrada y no se vuelve a mostrar. Deja usuario y contraseña
            vacíos si solo quieres cambiar la dirección.
          </p>
        </form>
      )}
    </div>
  );
}

function SeccionFuentes({
  proveedor,
  fuentes,
  conexiones,
  onFuenteGuardada,
  onRecargar,
  importarFuenteId,
}: {
  proveedor: Proveedor;
  fuentes: Fuente[];
  conexiones: Record<string, EstadoConexionCargado>;
  onFuenteGuardada: (fuente: Fuente) => void;
  onRecargar: () => Promise<void>;
  /** Fuente cuyo importador se despliega al abrir la configuración desde «Cargar Excel». */
  importarFuenteId?: string | null;
}) {
  const [agregandoFuente, setAgregandoFuente] = useState(false);
  const [creando, setCreando] = useState(false);

  const agregarLista = async () => {
    setCreando(true);
    try {
      const fuente = await crearFuente({
        name: `Lista de precios · ${proveedor.name}`.slice(0, 200),
        supplier_id: proveedor.supplier_id,
        capabilities: ["product_detail", "price"],
      });
      onFuenteGuardada(fuente);
      toast.success(`La fuente «${fuente.name}» quedó creada.`);
    } catch (error) {
      toast.error(mensajeDeErrorProveedores(error, "No pudimos crear la fuente de precios."));
      if (esConflictoDeVersion(error)) await onRecargar();
    } finally {
      setCreando(false);
    }
  };

  // Las de consulta en vivo primero: no dependen de un archivo, y así se leen antes que las listas.
  const ordenadas = [
    ...fuentes.filter(esFuenteApi),
    ...fuentes.filter(esFuenteDeArchivo),
    ...fuentes.filter((f) => !esFuenteApi(f) && !esFuenteDeArchivo(f)),
  ];

  return (
    <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-brand-green" />
        <p className="text-sm font-medium">Fuentes de precios</p>
        <span className="text-xs text-muted-foreground">
          {fuentes.length === 0
            ? "Sin fuentes todavía"
            : `${fuentes.length} ${fuentes.length === 1 ? "fuente" : "fuentes"}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setAgregandoFuente((valor) => !valor)}
        >
          <Plus className="h-4 w-4" />
          {agregandoFuente ? "Cerrar" : "Agregar fuente"}
        </Button>
      </div>

      {fuentes.length === 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            Este proveedor todavía no tiene una fuente de precios.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void agregarLista()}
            disabled={creando}
          >
            {creando ? "Creando…" : "Agregar lista de precios"}
          </Button>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {ordenadas.map((fuente) => (
            <FuenteItem
              key={fuente.source_id}
              proveedorId={proveedor.supplier_id}
              fuente={fuente}
              conexion={conexiones[fuente.source_id]}
              onGuardada={onFuenteGuardada}
              onRecargar={onRecargar}
              inicialmenteImportando={fuente.source_id === importarFuenteId}
            />
          ))}
        </ul>
      )}

      {agregandoFuente && (
        <FormularioNuevaFuente
          proveedor={proveedor}
          onCreada={(fuente) => {
            onFuenteGuardada(fuente);
            setAgregandoFuente(false);
          }}
          onCancelar={() => setAgregandoFuente(false)}
          onRecargar={onRecargar}
        />
      )}
    </div>
  );
}

function FormularioNuevaFuente({
  proveedor,
  onCreada,
  onCancelar,
  onRecargar,
}: {
  proveedor: Proveedor;
  onCreada: (fuente: Fuente) => void;
  onCancelar: () => void;
  onRecargar: () => Promise<void>;
}) {
  const nombrePorDefecto = `Lista de precios · ${proveedor.name}`.slice(0, 200);
  const [nombre, setNombre] = useState(nombrePorDefecto);
  const [capacidades, setCapacidades] = useState<CapacidadFuente[]>(["price"]);
  const [enviando, setEnviando] = useState(false);
  const idBase = `fuente-nueva-${proveedor.supplier_id}`;

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe un nombre para la fuente.");
      return;
    }
    setEnviando(true);
    try {
      const fuente = await crearFuente({
        name: limpio,
        supplier_id: proveedor.supplier_id,
        capabilities: capacidades,
      });
      onCreada(fuente);
      toast.success(`La fuente «${fuente.name}» quedó creada.`);
    } catch (error) {
      toast.error(
        mensajeDeErrorProveedores(error, "No pudimos crear la fuente. Inténtalo otra vez."),
      );
      if (esConflictoDeVersion(error)) await onRecargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mt-3 space-y-3 rounded-2xl border bg-background p-4">
      <div>
        <p className="text-sm font-medium">Nueva fuente de datos</p>
        <p className="text-xs text-muted-foreground">
          Recibirás su lista de precios como archivo Excel o CSV.
        </p>
      </div>
      <div>
        <Label htmlFor={`${idBase}-nombre`}>Nombre de la fuente</Label>
        <Input
          id={`${idBase}-nombre`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Lista de precios 2026"
          className="mt-1"
          maxLength={200}
          required
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">¿Qué información entrega?</p>
        <SelectorCapacidades
          idBase={idBase}
          seleccionadas={capacidades}
          onChange={setCapacidades}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? "Creando…" : "Crear fuente"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FuenteItem({
  proveedorId,
  fuente,
  conexion,
  onGuardada,
  onRecargar,
  inicialmenteImportando = false,
}: {
  proveedorId: string;
  fuente: Fuente;
  conexion: EstadoConexionCargado | undefined;
  onGuardada: (fuente: Fuente) => void;
  onRecargar: () => Promise<void>;
  inicialmenteImportando?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [importando, setImportando] = useState(inicialmenteImportando);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState(fuente.name);
  const [capacidades, setCapacidades] = useState<CapacidadFuente[]>(fuente.capabilities);
  const idBase = `fuente-${fuente.source_id}`;
  const esApi = esFuenteApi(fuente);
  const deArchivo = esFuenteDeArchivo(fuente);
  const perfil = conexion?.perfil ?? null;

  const avisar = (error: unknown, fallback: string) => {
    toast.error(mensajeDeErrorProveedores(error, fallback));
    if (esConflictoDeVersion(error)) void onRecargar();
  };

  const abrirEdicion = () => {
    setNombre(fuente.name);
    setCapacidades(fuente.capabilities);
    setEditando(true);
  };

  const alternarActiva = async (valor: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const actualizada = await actualizarFuente(fuente, { enabled: valor });
      onGuardada(actualizada);
      toast.success(
        valor
          ? `La fuente «${actualizada.name}» quedó activa.`
          : `La fuente «${actualizada.name}» quedó desactivada.`,
      );
    } catch (error) {
      avisar(error, "No pudimos cambiar el estado de la fuente. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("El nombre de la fuente no puede quedar vacío.");
      return;
    }
    setOcupado(true);
    try {
      const actualizada = await actualizarFuente(fuente, {
        name: limpio,
        capabilities: capacidades,
      });
      onGuardada(actualizada);
      setEditando(false);
      toast.success("Fuente actualizada.");
    } catch (error) {
      avisar(error, "No pudimos guardar la fuente. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className="rounded-xl border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{fuente.name}</p>
            <Badge variant="outline" className="gap-1">
              {esApi && <Radio className="h-3 w-3" />}
              {deArchivo && <FileSpreadsheet className="h-3 w-3" />}
              {etiquetaTipoFuente(fuente.mode)}
            </Badge>
            {esApi && perfil && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${ESTILO_ESTADO_CONEXION[perfil.state]}`}
              >
                {ETIQUETA_ESTADO_CONEXION[perfil.state]}
              </span>
            )}
            {deArchivo && (
              <span className="text-xs text-muted-foreground">
                {etiquetaEstadoFuente(fuente.status)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fuente.capabilities.length === 0
              ? "Sin información declarada"
              : fuente.capabilities.map((c) => etiquetaCapacidad(c)).join(" · ")}
          </p>
          {esApi && (
            <>
              {!conexion && (
                <p role="status" className="mt-1 text-xs text-muted-foreground">
                  Leyendo el estado de la conexión…
                </p>
              )}
              {conexion?.error && <p className="mt-1 text-xs text-destructive">{conexion.error}</p>}
              {perfil && (perfil.reason || perfil.state !== "connected") && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {mensajeMotivo(perfil.reason, perfil.state)}
                </p>
              )}
              {perfil?.last_success_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Última conexión exitosa registrada: {fechaHoraCorta(perfil.last_success_at)}
                </p>
              )}
            </>
          )}
          {!esApi && fuente.last_success_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Última carga: {fechaCorta(fuente.last_success_at)}
            </p>
          )}
          {!esApi && fuente.last_error && (
            <p className="mt-1 text-xs text-destructive">{fuente.last_error}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={fuente.enabled}
              disabled={ocupado}
              onCheckedChange={(valor) => {
                if (typeof valor === "boolean") void alternarActiva(valor);
              }}
              aria-label={`Activar o desactivar ${fuente.name}`}
            />
            {fuente.enabled ? "Activa" : "Desactivada"}
          </label>
          {deArchivo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportando((valor) => !valor)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {importando ? "Cerrar carga" : "Cargar lista"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (editando ? setEditando(false) : abrirEdicion())}
          >
            <Pencil className="h-4 w-4" />
            {editando ? "Cerrar" : "Editar"}
          </Button>
        </div>
      </div>

      {editando && (
        <form onSubmit={guardar} className="mt-3 space-y-3 rounded-xl border bg-muted/30 p-4">
          <div>
            <Label htmlFor={`${idBase}-nombre`}>Nombre de la fuente</Label>
            <Input
              id={`${idBase}-nombre`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1"
              maxLength={200}
              required
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">¿Qué información entrega?</p>
            <SelectorCapacidades
              idBase={idBase}
              seleccionadas={capacidades}
              onChange={setCapacidades}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditando(false)}
              disabled={ocupado}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {deArchivo && importando && (
        <ImportadorLista proveedorId={proveedorId} fuente={fuente} onImportado={onRecargar} />
      )}
    </li>
  );
}

function PreciosImportados({ proveedor, refresco }: { proveedor: Proveedor; refresco: number }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [ofertas, setOfertas] = useState<OfertaImportada[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setOfertas(await listarOfertasProveedor(proveedor.supplier_id));
    } catch (fallo) {
      setError(
        mensajeDeErrorProveedores(
          fallo,
          "No pudimos cargar los precios importados. Inténtalo otra vez.",
        ),
      );
    } finally {
      setCargando(false);
    }
  }, [proveedor.supplier_id]);

  useEffect(() => {
    if (abierto || refresco > 0) void cargar();
  }, [abierto, cargar, refresco]);

  return (
    <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Productos y precios importados</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setAbierto((valor) => !valor)}
        >
          {abierto ? "Ocultar" : "Ver precios"}
        </Button>
      </div>

      {abierto && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Son precios de este proveedor, con la fecha en que se observaron. No son precios de
            referencia de farmacias (Cruz Verde, Salcobrand ni Farmacias Ahumada).
          </p>
          {cargando ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cargando precios importados…
            </p>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No pudimos cargar los precios</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void cargar()}
                >
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : ofertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay precios importados para este proveedor.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-background">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 font-medium">Código proveedor</th>
                    <th className="px-3 py-2 font-medium">Precio</th>
                    <th className="px-3 py-2 font-medium">Unidad</th>
                    <th className="px-3 py-2 font-medium">Condiciones</th>
                    <th className="px-3 py-2 font-medium">Fuente</th>
                    <th className="px-3 py-2 font-medium">Observado</th>
                  </tr>
                </thead>
                <tbody>
                  {ofertas.map((oferta) => (
                    <tr key={oferta.offer_id} className="border-t">
                      <td className="px-3 py-2">{oferta.trade_item_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{oferta.external_id}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">
                          {precioLegible(oferta.price_amount, oferta.currency)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {etiquetaBasePrecio(oferta.price_basis)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{etiquetaUnidad(oferta.sale_unit)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            oferta.review_status === "needs_review"
                              ? "text-amber-700"
                              : "text-muted-foreground"
                          }
                        >
                          {etiquetaEstadoRevision(oferta.review_status)}
                        </span>
                        {oferta.review_status === "needs_review" && oferta.notes && (
                          <span className="block text-xs text-muted-foreground">
                            {oferta.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{oferta.source_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fechaCorta(oferta.observed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectorCapacidades({
  idBase,
  seleccionadas,
  onChange,
}: {
  idBase: string;
  seleccionadas: CapacidadFuente[];
  onChange: (capacidades: CapacidadFuente[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {CAPACIDADES_FUENTE.map((capacidad) => {
        const id = `${idBase}-${capacidad.value}`;
        const marcada = seleccionadas.includes(capacidad.value);
        return (
          <div key={capacidad.value} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={marcada}
              onCheckedChange={(valor) => {
                if (valor === true) {
                  onChange([...seleccionadas, capacidad.value]);
                } else {
                  onChange(seleccionadas.filter((c) => c !== capacidad.value));
                }
              }}
            />
            <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
              {capacidad.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
