import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { cotizacionFinalizada, informeRecuperado } from "@/test/historial-fixtures";

/**
 * Flujo del botón «Ver informe»: usa el informe congelado y abre un PDF en otra pestaña. La
 * generación real de jsPDF se prueba en informe-pdf.test.ts; aquí se dobla para aislar la UI.
 */
const listarCotizacionesMock = vi.hoisted(() => vi.fn());
const obtenerInformeMock = vi.hoisted(() => vi.fn());
const generarInformePdfMock = vi.hoisted(() => vi.fn());
const nombreArchivoInformeMock = vi.hoisted(() => vi.fn());
const descargarInformePdfMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cotizacion-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cotizacion-api")>();
  return {
    ...actual,
    listarCotizaciones: listarCotizacionesMock,
    obtenerInforme: obtenerInformeMock,
  };
});

vi.mock("@/lib/informe-pdf", () => ({
  generarInformePdf: generarInformePdfMock,
  nombreArchivoInforme: nombreArchivoInformeMock,
  descargarInformePdf: descargarInformePdfMock,
}));

vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({
    status: "authorized",
    profile: { display_name: "Prueba", roles: ["admin"] },
    error: null,
    signInWithGoogle: async () => {},
    signOut: async () => {},
    retry: async () => {},
  }),
}));

async function renderizarHistorial() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/historial"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

function ventanaDePrueba() {
  return {
    closed: false,
    opener: null as Window | null,
    location: { href: "" },
    close: vi.fn(),
  } as unknown as Window;
}

beforeEach(() => {
  listarCotizacionesMock.mockReset();
  listarCotizacionesMock.mockResolvedValue([cotizacionFinalizada]);
  obtenerInformeMock.mockReset();
  obtenerInformeMock.mockResolvedValue(informeRecuperado);
  generarInformePdfMock.mockReset();
  generarInformePdfMock.mockReturnValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  nombreArchivoInformeMock.mockReset();
  nombreArchivoInformeMock.mockReturnValue("Informe-COT-000001.pdf");
  descargarInformePdfMock.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:informe-cot-000001"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PDF del historial", () => {
  it("abre el PDF en una pestaña nueva y no reemplaza el popup", async () => {
    const ventana = ventanaDePrueba();
    vi.spyOn(window, "open").mockReturnValue(ventana);

    await renderizarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: /Ver informe/ }));

    await waitFor(() =>
      expect(generarInformePdfMock).toHaveBeenCalledWith(informeRecuperado.report),
    );
    expect(obtenerInformeMock).toHaveBeenCalledWith("q-9");
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect((ventana.location as unknown as { href: string }).href).toBe("blob:informe-cot-000001");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("si la pestaña se bloquea ofrece una descarga explícita, sin descargar sola", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await renderizarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: /Ver informe/ }));

    expect(
      await screen.findByText(/bloqueó la pestaña del informe COT-000001/),
    ).toBeInTheDocument();
    expect(descargarInformePdfMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ }));

    expect(descargarInformePdfMock).toHaveBeenCalledWith(
      "blob:informe-cot-000001",
      "Informe-COT-000001.pdf",
    );
  });

  it("un doble clic en Ver informe ejecuta una sola generación", async () => {
    vi.spyOn(window, "open").mockReturnValue(ventanaDePrueba());

    await renderizarHistorial();
    const boton = await screen.findByRole("button", { name: /Ver informe/ });
    fireEvent.click(boton);
    fireEvent.click(boton);

    await waitFor(() => expect(obtenerInformeMock).toHaveBeenCalledTimes(1));
    expect(generarInformePdfMock).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledTimes(1);
  });

  it("muestra el error y conserva el historial si no puede generar el PDF", async () => {
    const ventana = ventanaDePrueba();
    vi.spyOn(window, "open").mockReturnValue(ventana);
    generarInformePdfMock.mockImplementationOnce(() => {
      throw new Error("No se pudo generar el PDF.");
    });

    await renderizarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: /Ver informe/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo generar el PDF.");
    expect(ventana.close).toHaveBeenCalled();
    expect(screen.getByText("COT-000001")).toBeInTheDocument();
    expect(descargarInformePdfMock).not.toHaveBeenCalled();
  });
});
