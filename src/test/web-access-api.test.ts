import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { mensajeDeErrorSolicitud, puedeAdministrarAccesoWeb } from "@/lib/web-access-api";

describe("acceso web: permisos y mensajes", () => {
  it("solo el rol admin administra accesos web", () => {
    expect(puedeAdministrarAccesoWeb(["admin"])).toBe(true);
    expect(puedeAdministrarAccesoWeb(["auxiliary", "purchasing"])).toBe(false);
    expect(puedeAdministrarAccesoWeb([])).toBe(false);
    expect(puedeAdministrarAccesoWeb(undefined)).toBe(false);
  });

  it("muestra el mensaje del backend en las protecciones de eliminación", () => {
    for (const code of ["SUPERADMIN_PROTECTED", "CANNOT_REMOVE_SELF", "LAST_WEB_ADMIN"]) {
      expect(mensajeDeErrorSolicitud(new ApiError(409, code, `Mensaje ${code}`))).toBe(
        `Mensaje ${code}`,
      );
    }
  });

  it("explica el conflicto de roles al aprobar una identidad existente", () => {
    expect(
      mensajeDeErrorSolicitud(
        new ApiError(409, "WEB_ADMIN_ROLE_REQUIRED", "La identidad ya existe sin el perfil."),
      ),
    ).toBe("La identidad ya existe sin el perfil.");
  });
});
