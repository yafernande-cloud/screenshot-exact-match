import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Ruta retirada: el carrito activo vive dentro de «Cotizador».
 *
 * Se conserva la ruta (en lugar de borrarla) solo para que un enlace o marcador antiguo no
 * termine en una pantalla inexistente; no muestra datos de demostración ni duplica el carrito.
 */
export const Route = createFileRoute("/mis-cotizaciones")({
  head: () => ({
    meta: [{ title: "Cotizador · Cotizador para farmacia" }],
  }),
  component: RedirigirAlCotizador,
});

function RedirigirAlCotizador() {
  return <Navigate to="/" replace />;
}
