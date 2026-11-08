import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, FileSpreadsheet, Pencil, Plus, RefreshCw, Truck } from "lucide-react";

import { MenuPrincipal, EncabezadoPagina } from "@/components/MenuPrincipal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CAPACIDADES_FUENTE,
  actualizarFuente,
  actualizarProveedor,
  crearFuente,
  crearProveedor,
  esConflictoDeVersion,
  etiquetaCapacidad,
  etiquetaEstadoFuente,
  etiquetaModo,
  listarFuentes,
  listarProveedores,
  mensajeDeErrorProveedores,
  type CapacidadFuente,
  type Fuente,
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
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Proveedores,
});

function porNombre<T extends { name: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL");
}

function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const [proveedoresApi, fuentesApi] = await Promise.all([
        listarProveedores(),
        listarFuentes(),
      ]);
      setProveedores(porNombre(proveedoresApi));
      setFuentes(porNombre(fuentesApi));
    } catch (error) {
      setErrorCarga(
        mensajeDeErrorProveedores(error, "No pudimos cargar los proveedores. Inténtalo otra vez."),
      );
    } finally {
      setCargando(false);
    }
  }, []);

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

  const activos = proveedores.filter((p) => p.status === "active").length;

  return (
    <div className="min-h-screen bg-hero">
      <MenuPrincipal />
      <main className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:w-[90%] lg:px-0 space-y-6 pb-24">
        <EncabezadoPagina
          titulo="Proveedores"
          bajada="Registra a quién le compras, activa o desactiva su cuenta y administra de dónde obtienes sus productos y precios."
        />

        <section className="rounded-3xl border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Agregar proveedor</h2>
            <p className="text-sm text-muted-foreground">
              Solo el nombre es obligatorio. El código interno y las notas ayudan a identificarlo.
            </p>
          </div>
          <FormularioNuevoProveedor onCreado={guardarProveedor} onRecargar={recargar} />
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
          ) : (
            <ul className="divide-y">
              {proveedores.map((proveedor) => (
                <TarjetaProveedor
                  key={proveedor.supplier_id}
                  proveedor={proveedor}
                  fuentes={fuentes.filter((f) => f.supplier_id === proveedor.supplier_id)}
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

function FormularioNuevoProveedor({
  onCreado,
  onRecargar,
}: {
  onCreado: (proveedor: Proveedor) => void;
  onRecargar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe el nombre del proveedor.");
      return;
    }
    setEnviando(true);
    try {
      const proveedor = await crearProveedor({
        name: limpio,
        supplier_code: codigo,
        notes: notas,
      });
      onCreado(proveedor);
      setNombre("");
      setCodigo("");
      setNotas("");
      toast.success(`${proveedor.name} quedó registrado.`);
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
    <form
      onSubmit={enviar}
      className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1.5fr_auto] md:items-end"
    >
      <div>
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
      <Button type="submit" disabled={enviando}>
        <Plus className="h-4 w-4" />
        {enviando ? "Agregando…" : "Agregar proveedor"}
      </Button>
    </form>
  );
}

function TarjetaProveedor({
  proveedor,
  fuentes,
  onProveedorGuardado,
  onFuenteGuardada,
  onRecargar,
}: {
  proveedor: Proveedor;
  fuentes: Fuente[];
  onProveedorGuardado: (proveedor: Proveedor) => void;
  onFuenteGuardada: (fuente: Fuente) => void;
  onRecargar: () => Promise<void>;
}) {
  const activo = proveedor.status === "active";
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [agregandoFuente, setAgregandoFuente] = useState(false);
  const [nombre, setNombre] = useState(proveedor.name);
  const [codigo, setCodigo] = useState(proveedor.supplier_code ?? "");
  const [notas, setNotas] = useState(proveedor.internal_notes ?? "");

  const avisar = (error: unknown, fallback: string) => {
    toast.error(mensajeDeErrorProveedores(error, fallback));
    if (esConflictoDeVersion(error)) void onRecargar();
  };

  const abrirEdicion = () => {
    setNombre(proveedor.name);
    setCodigo(proveedor.supplier_code ?? "");
    setNotas(proveedor.internal_notes ?? "");
    setEditando(true);
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
      setEditando(false);
      toast.success("Cambios guardados.");
    } catch (error) {
      avisar(error, "No pudimos guardar los cambios. Inténtalo otra vez.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{proveedor.name}</p>
            <Badge variant={activo ? "secondary" : "outline"}>
              {activo ? "Activo" : "Inactivo"}
            </Badge>
            {proveedor.supplier_code && (
              <span className="text-xs text-muted-foreground">
                Código {proveedor.supplier_code}
              </span>
            )}
          </div>
          {proveedor.internal_notes && (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {proveedor.internal_notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={activo}
              disabled={ocupado}
              onCheckedChange={(valor) => {
                if (typeof valor === "boolean") void alternarActivo(valor);
              }}
              aria-label={`Activar o desactivar ${proveedor.name}`}
            />
            {activo ? "Activo" : "Inactivo"}
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (editando ? setEditando(false) : abrirEdicion())}
          >
            <Pencil className="h-4 w-4" />
            {editando ? "Cerrar edición" : "Editar"}
          </Button>
        </div>
      </div>

      {editando && (
        <form
          onSubmit={guardarEdicion}
          className="mt-4 grid gap-3 rounded-2xl border bg-muted/30 p-4 md:grid-cols-2"
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
          <div className="flex gap-2 md:col-span-2">
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

      <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-brand-green" />
          <p className="text-sm font-medium">Fuentes de datos</p>
          <span className="text-xs text-muted-foreground">
            {fuentes.length === 0
              ? "Sin fuentes"
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
          <p className="mt-2 text-sm text-muted-foreground">
            Agrega una fuente para poder incorporar la lista de precios de este proveedor.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border bg-background">
            {fuentes.map((fuente) => (
              <FuenteItem
                key={fuente.source_id}
                fuente={fuente}
                onGuardada={onFuenteGuardada}
                onRecargar={onRecargar}
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
    </li>
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
  fuente,
  onGuardada,
  onRecargar,
}: {
  fuente: Fuente;
  onGuardada: (fuente: Fuente) => void;
  onRecargar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState(fuente.name);
  const [capacidades, setCapacidades] = useState<CapacidadFuente[]>(fuente.capabilities);
  const idBase = `fuente-${fuente.source_id}`;

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
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{fuente.name}</p>
            <Badge variant="outline">{etiquetaModo(fuente.mode)}</Badge>
            <span className="text-xs text-muted-foreground">
              {etiquetaEstadoFuente(fuente.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fuente.capabilities.length === 0
              ? "Sin información declarada"
              : fuente.capabilities.map((c) => etiquetaCapacidad(c)).join(" · ")}
          </p>
          {fuente.last_success_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Última carga: {fechaCorta(fuente.last_success_at)}
            </p>
          )}
          {fuente.last_error && (
            <p className="mt-1 text-xs text-destructive">{fuente.last_error}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
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
    </li>
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
