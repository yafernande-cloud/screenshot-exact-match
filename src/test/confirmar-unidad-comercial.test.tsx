/**
 * Confirmación de la unidad comercial de una oferta que no la declara (FarmaLoop).
 *
 * La interfaz no elige una unidad por defecto ni supone que toda oferta es una caja: la persona
 * confirma la presentación completa y el backend la valida y audita. Aquí se prueba el diálogo
 * aislado: unidad compatible, unidad incompatible (bloquea) y cancelación.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmarUnidadComercialDialog } from "@/components/ConfirmarUnidadComercialDialog";

function montar(unidadFaltante = "box") {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <ConfirmarUnidadComercialDialog
      abierto
      nombreOferta="Predual x 10 comprimidos"
      unidadFaltante={unidadFaltante}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    />,
  );
  return { onConfirmar, onCancelar };
}

describe("ConfirmarUnidadComercialDialog", () => {
  it("no preselecciona una unidad y exige elegirla antes de confirmar", () => {
    const { onConfirmar } = montar();

    expect(screen.getByText(/Predual x 10 comprimidos/)).toBeTruthy();
    expect(screen.getByText(/El faltante se mide en cajas/)).toBeTruthy();
    const confirmar = screen.getByRole("button", {
      name: "Agregar y asociar",
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(confirmar);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("confirma una caja cuando el faltante se mide en cajas", () => {
    const { onConfirmar, onCancelar } = montar("box");

    fireEvent.click(screen.getByLabelText("Caja"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar y asociar" }));

    expect(onConfirmar).toHaveBeenCalledWith("box");
    expect(onCancelar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("confirma un envase cuando el faltante se mide en envases y no asume caja", () => {
    const { onConfirmar } = montar("package");

    fireEvent.click(screen.getByLabelText("Envase o paquete"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar y asociar" }));

    expect(onConfirmar).toHaveBeenCalledWith("package");
  });

  it("bloquea una unidad incompatible y explica el motivo sin inventar equivalencias", () => {
    const { onConfirmar } = montar("box");

    fireEvent.click(screen.getByLabelText("Envase o paquete"));

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toMatch(/cajas/);
    expect(alerta.textContent).toMatch(/envases/);
    expect(alerta.textContent).toMatch(/equivalencia/);

    const confirmar = screen.getByRole("button", {
      name: "Agregar y asociar",
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.click(confirmar);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("cancelar no confirma ninguna unidad", () => {
    const { onConfirmar, onCancelar } = montar("box");

    fireEvent.click(screen.getByLabelText("Caja"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
