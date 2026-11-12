/**
 * Estado de la solicitud de acceso de la persona autenticada que todavía no entra al sistema.
 *
 * - Identidad nueva: registra la solicitud una sola vez y muestra el estado pendiente.
 * - Pendiente: no vuelve a registrar nada.
 * - Rechazada: avisa y solo crea otra solicitud si la persona pulsa «Volver a solicitar acceso».
 * - Acceso eliminado o vencido: nunca se restaura solo; ofrece la misma acción explícita.
 * - Vinculada sin acceso activo: no ofrece una solicitud que el backend no crearía.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  consultarEstadoSolicitud,
  mensajeDeErrorSolicitud,
  solicitarAcceso,
} from "@/lib/web-access-api";

export type EstadoPantallaSolicitud =
  | { tipo: "inactivo" }
  | { tipo: "consultando" }
  | { tipo: "enviando" }
  | { tipo: "pendiente"; solicitadaEn: string | null }
  | { tipo: "rechazada"; decididaEn: string | null }
  | { tipo: "sin_acceso"; motivo: "removed" | "expired" }
  | { tipo: "vinculada" }
  | { tipo: "error"; mensaje: string };

const INACTIVO: EstadoPantallaSolicitud = { tipo: "inactivo" };

export function useSolicitudAcceso(activo: boolean) {
  const [estado, setEstado] = useState<EstadoPantallaSolicitud>(INACTIVO);
  const enCurso = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const consultar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEstado({ tipo: "consultando" });
    try {
      const resultado = await consultarEstadoSolicitud();
      if (!montado.current) return;

      if (resultado.status === "pending") {
        setEstado({ tipo: "pendiente", solicitadaEn: resultado.requested_at });
        return;
      }
      if (resultado.status === "rejected") {
        setEstado({ tipo: "rechazada", decididaEn: resultado.decided_at });
        return;
      }
      if (resultado.status === "approved") {
        // La identidad ya pertenece a una persona, pero el acceso no está activo.
        setEstado({ tipo: "vinculada" });
        return;
      }
      if (resultado.status === "removed" || resultado.status === "expired") {
        // La autorización se eliminó o venció: se conserva la identidad, pero volver a entrar
        // exige una solicitud nueva y otra aprobación. Nunca se restaura sola.
        setEstado({ tipo: "sin_acceso", motivo: resultado.status });
        return;
      }

      // Identidad nueva: única alta automática de la solicitud.
      setEstado({ tipo: "enviando" });
      await solicitarAcceso();
      if (montado.current) setEstado({ tipo: "pendiente", solicitadaEn: null });
    } catch (error) {
      if (montado.current) setEstado({ tipo: "error", mensaje: mensajeDeErrorSolicitud(error) });
    } finally {
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    if (!activo) {
      setEstado(INACTIVO);
      return;
    }
    void consultar();
  }, [activo, consultar]);

  const volverASolicitar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEstado({ tipo: "enviando" });
    try {
      await solicitarAcceso();
      if (montado.current) setEstado({ tipo: "pendiente", solicitadaEn: null });
    } catch (error) {
      if (montado.current) setEstado({ tipo: "error", mensaje: mensajeDeErrorSolicitud(error) });
    } finally {
      enCurso.current = false;
    }
  }, []);

  return { estado, consultar, volverASolicitar };
}
