import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnsenarALaIa, type EnsenarALaIaProps } from "@/components/EnsenarALaIa";
import type {
  ObservacionComercial,
  PreferenciaComercial,
  ResultadoInterpretacion,
} from "@/lib/observaciones-api";

/**
 * «Enseñar a la IA» con `apiRequest` doblado: ninguna prueba sale a la red ni llama a OpenAI.
 * Los fixtures describen exactamente lo que devuelven los endpoints existentes de observaciones.
 */
const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

const PREFERENCIA_LAB: PreferenciaComercial = {
  preference_id: "pref-1",
  subject_kind: "laboratory",
  subject_label: "Laboratorio Chile",
  effect: "prefer",
  tolerance: {
    kind: "relative_percent",
    percent: "10",
    amount: null,
    currency: null,
  },
  price_reference: null,
};

function observacion(over: Partial<ObservacionComercial> = {}): ObservacionComercial {
  return {
    observation_id: "obs-1",
    text: "Prefiero Laboratorio Chile aunque sea un poco más caro",
    trade_item_id: "art-1",
    supplier_id: "sup-1",
    offer_snapshot_id: "of-1",
    interpretation_status: "sin_interpretacion",
    interpretation: null,
    retired_subject_kinds: [],
    ...over,
  };
}

function aplicada(over: Partial<ResultadoInterpretacion> = {}): ResultadoInterpretacion {
  return {
    replayed: false,
    observation: observacion({
      interpretation_status: "suggested",
      interpretation: {
        interpretation_id: "int-1",
        status: "suggested",
        error_code: null,
        retired_subject_kinds: [],
        created_at: "2026-11-11T12:00:00Z",
        preferences: [PREFERENCIA_LAB],
      },
    }),
    ...over,
  };
}

function conEstado(
  estado: ObservacionComercial["interpretation_status"],
  errorCode: string | null = null,
): ResultadoInterpretacion {
  return {
    replayed: false,
    observation: observacion({
      interpretation_status: estado,
      interpretation:
        estado === "sin_interpretacion"
          ? null
          : {
              interpretation_id: "int-1",
              status: estado as NonNullable<ObservacionComercial["interpretation"]>["status"],
              error_code: errorCode,
              retired_subject_kinds: [],
              created_at: "2026-11-11T12:00:00Z",
              preferences: [],
            },
    }),
  };
}

function renderizar(props: Partial<EnsenarALaIaProps> = {}) {
  const onPreferenciaAplicada = vi.fn();
  render(
    <EnsenarALaIa
      articuloId="art-1"
      ofertaId="of-1"
      proveedorId="sup-1"
      nombreArticulo="Paracetamol 500 mg comprimidos"
      nombreProveedor="Farmaloop"
      onPreferenciaAplicada={onPreferenciaAplicada}
      {...props}
    />,
  );
  return { onPreferenciaAplicada };
}

function abrirFormulario() {
  fireEvent.click(screen.getByRole("button", { name: "Enseñar a la IA" }));
  return screen.getByRole("textbox", { name: "Comentario sobre el producto" });
}

async function escribirYEnviar(texto: string) {
  const campo = abrirFormulario();
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar y enseñar" }));
  await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("formulario de «Enseñar a la IA»", () => {
  it("abre el formulario y no permite enviar un comentario vacío", () => {
    renderizar();
    abrirFormulario();

    expect(screen.getByRole("button", { name: "Guardar y enseñar" })).toBeDisabled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("guarda la observación con los identificadores persistidos y la clave de idempotencia", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce(aplicada());

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile aunque sea un poco más caro");

    const [rutaGuardar, init] = apiRequestMock.mock.calls[0] ?? [];
    expect(rutaGuardar).toBe("/api/v1/commercial-observations");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({
      text: "Prefiero Laboratorio Chile aunque sea un poco más caro",
      trade_item_id: "art-1",
      supplier_id: "sup-1",
      offer_snapshot_id: "of-1",
    });
    const clave = (init.headers as Record<string, string>)["Idempotency-Key"];
    expect(typeof clave).toBe("string");
    expect(String(clave).length).toBeGreaterThanOrEqual(8);

    expect(apiRequestMock.mock.calls[1]?.[0]).toBe(
      "/api/v1/commercial-observations/obs-1/interpretations",
    );
    expect(apiRequestMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });

  it("muestra la preferencia aplicada y avisa para refrescar las ofertas", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce(aplicada());

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile aunque sea un poco más caro");

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Laboratorio «Laboratorio Chile» se prefiere, con hasta 10 % más de precio.",
      ),
    ).toBeInTheDocument();
    expect(onPreferenciaAplicada).toHaveBeenCalledTimes(1);
    // Nunca se muestra la salida cruda ni la confianza del modelo.
    expect(screen.queryByText(/confidence|raw|tokens/i)).toBeNull();
  });

  it("trata un intento ya procesado como aplicado, sin volver a guardar", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce({
      ...aplicada(),
      replayed: true,
    });

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile");

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => ruta === "/api/v1/commercial-observations"),
    ).toHaveLength(1);
  });

  it("no presenta como aprendido un comentario pendiente de revisión", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conEstado("needs_review", "ambiguous"));

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Que sea del laboratorio bueno");

    expect(
      await screen.findByText("Comentario guardado, pendiente de revisión"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Preferencia guardada y aplicada")).toBeNull();
    expect(onPreferenciaAplicada).not.toHaveBeenCalled();
  });

  it("informa un comentario guardado sin preferencia aplicable", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conEstado("no_preference"));

    renderizar();
    await escribirYEnviar("Este proveedor despacha rápido");

    expect(
      await screen.findByText("Comentario guardado sin una preferencia aplicable"),
    ).toBeInTheDocument();
  });

  it("reintenta una interpretación fallida sin duplicar la observación", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conEstado("failed", "timeout"))
      .mockResolvedValueOnce(aplicada());

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile aunque sea un poco más caro");

    expect(await screen.findByText("No pudimos interpretar el comentario")).toBeInTheDocument();
    expect(screen.getByText(/El comentario original quedó guardado/)).toBeInTheDocument();
    expect(onPreferenciaAplicada).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => ruta === "/api/v1/commercial-observations"),
    ).toHaveLength(1);
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).endsWith("/interpretations")),
    ).toHaveLength(2);
    expect(onPreferenciaAplicada).toHaveBeenCalledTimes(1);
  });

  it("explica cuando la interpretación con IA está deshabilitada (503) y permite reintentar", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockRejectedValueOnce({
        status: 503,
        code: "OBSERVATION_AI_DISABLED",
        message: "La interpretación con IA no está habilitada en esta instalación.",
      })
      .mockResolvedValueOnce(aplicada());

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile");

    expect(
      await screen.findByText("La interpretación con IA no está disponible"),
    ).toBeInTheDocument();
    expect(screen.getByText(/El comentario quedó guardado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => ruta === "/api/v1/commercial-observations"),
    ).toHaveLength(1);
  });

  it("si falla el guardado no interpreta y reintenta con la misma clave", async () => {
    apiRequestMock
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(aplicada());

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile");

    expect(
      await screen.findByText("No pudimos completar la solicitud. Inténtalo otra vez."),
    ).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const claveOriginal = (apiRequestMock.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      "Idempotency-Key"
    ];

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();

    const claveReintento = (apiRequestMock.mock.calls[1]?.[1]?.headers as Record<string, string>)[
      "Idempotency-Key"
    ];
    expect(claveReintento).toBe(claveOriginal);
  });

  it("advierte que una lista importada no informa laboratorio ni marca", () => {
    renderizar({
      sinLaboratorio: true,
      nombreProveedor: "Distribuidora Andes",
      ofertaId: "of-lista-1",
    });
    abrirFormulario();

    expect(
      screen.getByText(/Este proveedor no informa laboratorio ni marca en su lista/),
    ).toBeInTheDocument();
  });
});
