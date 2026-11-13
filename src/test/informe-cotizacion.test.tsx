import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InformeCotizacion } from "@/components/InformeCotizacion";
import type { InformeCotizacion as Informe } from "@/lib/cotizacion-api";
import { informeFinalizado } from "@/test/historial-fixtures";

/**
 * «Ver vista» presenta el informe congelado que guardó el backend. Las cantidades se muestran con
 * la misma traducción de unidades que la tabla del historial y el PDF (`box` → «cajas»), sin
 * reescribir el valor guardado: el informe sigue diciendo «11».
 *
 * Se prueba el componente y no el diálogo de la pantalla porque dos pruebas seguidas que abren ese
 * diálogo con un clic dejan el proceso de Vitest en un bucle (sin salida y con la CPU al 100 %);
 * ver la nota en el informe de la entrega. La apertura del diálogo ya la cubre
 * `historial.test.tsx`.
 */
const cajaDeOnce: Informe = {
  ...informeFinalizado,
  items: [{ ...informeFinalizado.items[0]!, quantity: { value: "11", unit: "box" } }],
};

describe("informe de cotización finalizado", () => {
  it("muestra la cantidad guardada con su unidad en español", () => {
    render(<InformeCotizacion informe={cajaDeOnce} />);

    // La celda de cantidad del renglón del producto.
    expect(screen.getByText("11 cajas")).toBeInTheDocument();
    // El resumen conserva la misma cantidad por unidad.
    expect(screen.getByText(/producto distinto · 11 cajas/)).toBeInTheDocument();
    // El valor guardado no se modifica al presentarlo.
    expect(cajaDeOnce.items[0]?.quantity).toEqual({ value: "11", unit: "box" });
  });

  it("traduce también las cantidades de los faltantes liberados", () => {
    render(
      <InformeCotizacion
        informe={{
          ...informeFinalizado,
          release: {
            released: [
              { demand_item_id: "d-1", quantity: "3", quantity_unit: "box" },
              { demand_item_id: "d-2", quantity: "1", quantity_unit: "box" },
            ],
            pending: [],
          },
        }}
      />,
    );

    expect(screen.getByText(/Faltantes liberados: 2/)).toHaveTextContent("3 cajas, 1 caja");
  });

  it("conserva el valor original cuando la unidad no viene informada", () => {
    render(
      <InformeCotizacion
        informe={{
          ...informeFinalizado,
          items: [{ ...informeFinalizado.items[0]!, quantity: { value: "7", unit: null } }],
        }}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
