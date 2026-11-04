/**
 * Configuración pública del frontend.
 *
 * Estos valores se incluyen en el bundle del navegador y **no son secretos**: la clave es la
 * publicable de Supabase (`sb_publishable_…`), pensada para uso en el cliente. Nunca deben
 * añadirse aquí claves `service_role`, `sb_secret` ni credenciales privadas.
 *
 * Existen porque el preview de Lovable compila el repositorio tal cual y no recibe variables de
 * entorno (los «Secretos de build» requieren un plan Enterprise). Las variables `VITE_*` siguen
 * teniendo prioridad cuando están definidas (desarrollo local u otros despliegues).
 */

export const PUBLIC_SUPABASE_URL = "https://ekzuiqknqbubqaiymqfk.supabase.co";

/** Clave publicable de Supabase (apta para el navegador). */
export const PUBLIC_SUPABASE_KEY = "sb_publishable_pGM0Ev75UelYgJCfi3XaXA_7oCxpERJ";

/** Backend de demostración; `src/lib/api.ts` ya lo usa como valor por defecto. */
export const PUBLIC_API_URL = "https://cotizador-farmacia-demo-3ea67af09b39.herokuapp.com";
