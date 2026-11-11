import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnsenarALaIa, type EnsenarALaIaProps } from "@/components/EnsenarALaIa";
import type {
  Aclaracion,
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
  clarification: Aclaracion | null = null,
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
              clarification,
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

function llamadasA(ruta: string) {
  return apiRequestMock.mock.calls.filter(([destino]) => destino === ruta);
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

  it("explica el alcance comercial de las preferencias con el texto acordado", () => {
    renderizar();
    abrirFormulario();

    // Texto acordado: enfoque comercial (ordenar ofertas), sin prometer sustituciones de
    // medicamentos ni cambios de precio o disponibilidad.
    expect(
      screen.getByText(
        "Cuéntale a la IA qué productos, laboratorios o presentaciones prefieres. Tus preferencias ayudarán a ordenar las ofertas de los proveedores, sin modificar sus precios ni disponibilidad",
      ),
    ).toBeInTheDocument();
    // Los textos anteriores describían mal el alcance de A6.
    expect(screen.queryByText(/no se aplica a otros productos/)).toBeNull();
    expect(screen.queryByText(/no a los demás de la misma marca o proveedor/)).toBeNull();
    // La interfaz no sugiere sustituir medicamentos distintos.
    expect(screen.queryByText(/en lugar de|sustituir|equivalente/i)).toBeNull();
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
    expect(llamadasA("/api/v1/commercial-observations")).toHaveLength(1);
  });

  it("no presenta como aprendido un comentario pendiente de revisión", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conEstado("needs_review", "ambiguous"));

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Que sea del laboratorio bueno");

    expect(await screen.findByText("Falta un dato para aplicarlo")).toBeInTheDocument();
    expect(screen.queryByText("Preferencia guardada y aplicada")).toBeNull();
    expect(onPreferenciaAplicada).not.toHaveBeenCalled();
    // Una revisión pendiente no es un error técnico: no hay «Reintentar» genérico.
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Intentar nuevamente" })).toBeNull();
    // El único camino es aclarar en el mismo campo, que sigue precargado.
    const campo = screen.getByRole("textbox", { name: "Comentario sobre el producto" });
    expect(campo).toHaveValue("Que sea del laboratorio bueno");
    expect(screen.getByRole("button", { name: "Guardar aclaración y enseñar" })).toBeDisabled();
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
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Escribir otro comentario" })).toBeInTheDocument();
  });

  it("«Intentar nuevamente» vuelve a interpretar el mismo comentario sin duplicarlo", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conEstado("failed", "timeout"))
      .mockResolvedValueOnce(aplicada());

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile aunque sea un poco más caro");

    expect(await screen.findByText("No pudimos interpretar el comentario")).toBeInTheDocument();
    expect(
      screen.getByText(/vuelve a pedir la interpretación de este mismo comentario/),
    ).toBeInTheDocument();
    expect(onPreferenciaAplicada).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Intentar nuevamente" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    // La observación se guardó una sola vez; solo se repite la interpretación.
    expect(llamadasA("/api/v1/commercial-observations")).toHaveLength(1);
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).endsWith("/interpretations")),
    ).toHaveLength(2);
    expect(onPreferenciaAplicada).toHaveBeenCalledTimes(1);
  });

  it("explica cuando la interpretación con IA está deshabilitada (503) y no ofrece reintentar", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockRejectedValueOnce({
      status: 503,
      code: "OBSERVATION_AI_DISABLED",
      message: "La interpretación con IA no está habilitada en esta instalación.",
    });

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile");

    expect(
      await screen.findByText("La interpretación con IA no está disponible"),
    ).toBeInTheDocument();
    expect(screen.getByText(/El comentario quedó guardado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Intentar nuevamente" })).toBeNull();
    expect(llamadasA("/api/v1/commercial-observations")).toHaveLength(1);
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
    expect(screen.getByText(/todavía no se guardó/)).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const claveOriginal = (apiRequestMock.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      "Idempotency-Key"
    ];

    fireEvent.click(screen.getByRole("button", { name: "Intentar nuevamente" }));
    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();

    const claveReintento = (apiRequestMock.mock.calls[1]?.[1]?.headers as Record<string, string>)[
      "Idempotency-Key"
    ];
    expect(claveReintento).toBe(claveOriginal);
  });

  it("un error del comentario ofrece corregirlo, no repetirlo", async () => {
    apiRequestMock.mockRejectedValueOnce({ status: 422 });

    renderizar();
    await escribirYEnviar("Prefiero Laboratorio Chile");

    expect(
      await screen.findByText("Revisa el comentario: no pudimos guardarlo tal como está."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Intentar nuevamente" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Corregir comentario" }));

    const campo = screen.getByRole("textbox", { name: "Comentario sobre el producto" });
    expect(campo).toHaveValue("Prefiero Laboratorio Chile");
    expect(screen.getByRole("button", { name: "Guardar y enseñar" })).toBeEnabled();
  });

  it("advierte que una lista importada no informa laboratorio ni marca", () => {
    renderizar({
      sinLaboratorio: true,
      nombreProveedor: "Distribuidora Andes",
      ofertaId: "of-lista-1",
    });
    abrirFormulario();

    expect(
      screen.getByText(/Distribuidora Andes no informa laboratorio ni marca en su lista/),
    ).toBeInTheDocument();
  });
});

function conAclaracion(
  clarification: Aclaracion = {
    kind: "ambiguous_article",
    question:
      "«Ibuprofeno» puede corresponder a más de un producto del catálogo. ¿Cuál de estos es?",
    reference: "Ibuprofeno",
    candidates: [
      { article_id: "art-a", display_name: "Ibuprofeno 400 mg" },
      { article_id: "art-b", display_name: "Ibuprofeno 600 mg" },
    ],
  },
): ResultadoInterpretacion {
  return conEstado("needs_review", "ambiguous", clarification);
}

describe("aclaraciones y preferencias entre artículos", () => {
  it("pide aclaración sin aplicar la preferencia y conserva el comentario en el mismo campo", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce(conAclaracion());

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Prefiero el ibuprofeno de la otra marca");

    expect(await screen.findByText("Necesitamos una aclaración")).toBeInTheDocument();
    expect(screen.getByText(/puede corresponder a más de un producto/)).toBeInTheDocument();
    expect(screen.getByText(/Ibuprofeno 400 mg/)).toBeInTheDocument();
    expect(screen.getByText(/Ibuprofeno 600 mg/)).toBeInTheDocument();
    expect(screen.queryByText("Preferencia guardada y aplicada")).toBeNull();
    expect(onPreferenciaAplicada).not.toHaveBeenCalled();

    // El comentario original sigue en el mismo recuadro y solo se puede enviar si se corrige.
    const campo = screen.getByRole("textbox", { name: "Comentario sobre el producto" });
    expect(campo).toHaveValue("Prefiero el ibuprofeno de la otra marca");
    expect(screen.getByRole("button", { name: "Guardar aclaración y enseñar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("al aclarar crea una observación nueva enlazada a la anterior, que se conserva", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conAclaracion())
      .mockResolvedValueOnce(observacion({ observation_id: "obs-2" }))
      .mockResolvedValueOnce(aplicada());

    renderizar();
    await escribirYEnviar("Prefiero el ibuprofeno de la otra marca");

    const campo = await screen.findByRole("textbox", {
      name: "Comentario sobre el producto",
    });
    fireEvent.change(campo, {
      target: { value: "Prefiero Ibuprofeno 600 mg de la otra marca" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar aclaración y enseñar" }));

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    const guardados = llamadasA("/api/v1/commercial-observations");
    expect(guardados).toHaveLength(2);
    expect(JSON.parse(guardados[1]![1].body)).toEqual({
      text: "Prefiero Ibuprofeno 600 mg de la otra marca",
      trade_item_id: "art-1",
      supplier_id: "sup-1",
      offer_snapshot_id: "of-1",
      previous_observation_id: "obs-1",
    });
    // La aclaración se interpreta de verdad: no se reutiliza el `needs_review` anterior.
    expect(apiRequestMock.mock.calls[3]?.[0]).toBe(
      "/api/v1/commercial-observations/obs-2/interpretations",
    );
  });

  it("si sigue faltando información, vuelve a preguntar en el mismo campo", async () => {
    apiRequestMock
      .mockResolvedValueOnce(observacion())
      .mockResolvedValueOnce(conAclaracion())
      .mockResolvedValueOnce(observacion({ observation_id: "obs-2" }))
      .mockResolvedValueOnce(
        conAclaracion({
          kind: "ambiguous_article",
          question: "Todavía no sé cuál Ibuprofeno es. ¿Es el de 400 mg o el de 600 mg?",
          reference: "Ibuprofeno",
          candidates: [
            { article_id: "art-a", display_name: "Ibuprofeno 400 mg" },
            { article_id: "art-b", display_name: "Ibuprofeno 600 mg" },
          ],
        }),
      );

    renderizar();
    await escribirYEnviar("Prefiero el ibuprofeno de la otra marca");

    let campo = await screen.findByRole("textbox", { name: "Comentario sobre el producto" });
    fireEvent.change(campo, { target: { value: "Prefiero el ibuprofeno de marca" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar aclaración y enseñar" }));

    expect(await screen.findByText(/Todavía no sé cuál Ibuprofeno es/)).toBeInTheDocument();
    campo = screen.getByRole("textbox", { name: "Comentario sobre el producto" });
    expect(campo).toHaveValue("Prefiero el ibuprofeno de marca");
    expect(llamadasA("/api/v1/commercial-observations")).toHaveLength(2);
  });

  it("muestra los nombres verificados cuando el laboratorio no coincide literalmente", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce(
      conAclaracion({
        kind: "unknown_laboratory",
        question:
          "No encontré «Andes» entre los laboratorios verificados de este producto. " +
          "Los que aparecen son: «Laboratorios Andes Ficticios». Si te refieres a uno de " +
          "ellos, puedes responder con su nombre o con la palabra que lo distingue.",
        reference: "Andes",
        candidates: [],
      }),
    );

    renderizar();
    await escribirYEnviar("Prefiero el laboratorio Andes");

    expect(
      await screen.findByText(/No encontré «Andes» entre los laboratorios verificados/),
    ).toBeInTheDocument();
    expect(screen.getByText(/«Laboratorios Andes Ficticios»/)).toBeInTheDocument();
    // Se pregunta con nombres verificados; no se inventa una equivalencia ni se aplica nada.
    expect(screen.queryByText("Preferencia guardada y aplicada")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("describe la preferencia entre artículos sin hablar de equivalencias", async () => {
    apiRequestMock.mockResolvedValueOnce(observacion()).mockResolvedValueOnce({
      replayed: false,
      observation: observacion({
        interpretation_status: "suggested",
        interpretation: {
          interpretation_id: "int-2",
          status: "suggested",
          error_code: null,
          retired_subject_kinds: [],
          created_at: "2026-11-11T12:00:00Z",
          preferences: [],
          article_preferences: [
            {
              article_preference_id: "ap-1",
              article_id: "art-1",
              article_label: "Paracetamol 500 mg comprimidos",
              relative_to_article_id: "art-2",
              relative_to_article_label: "Paracetamol 500 mg de otra marca",
              effect: "prefer",
            },
          ],
        },
      }),
    });

    const { onPreferenciaAplicada } = renderizar();
    await escribirYEnviar("Prefiero este paracetamol antes que el otro");

    expect(await screen.findByText("Preferencia guardada y aplicada")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Se prefiere «Paracetamol 500 mg comprimidos» frente a «Paracetamol 500 mg de otra marca» cuando ambos son comparables.",
      ),
    ).toBeInTheDocument();
    expect(onPreferenciaAplicada).toHaveBeenCalledTimes(1);
  });
});
