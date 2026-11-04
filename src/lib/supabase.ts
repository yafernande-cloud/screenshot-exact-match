import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PUBLIC_SUPABASE_KEY, PUBLIC_SUPABASE_URL } from "@/lib/public-config";

/**
 * Cliente de Supabase Auth, creado de forma perezosa y **solo en el navegador**.
 *
 * La sesión se persiste en `localStorage`, que no existe durante el renderizado en servidor
 * (TanStack Start hace SSR). Por eso ningún componente debe llamar a `getSupabase()` en el
 * render: el proveedor de sesión lo hace dentro de `useEffect`.
 */

let client: SupabaseClient | null = null;

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Valores efectivos: la variable de entorno tiene prioridad; si no existe (por ejemplo, en el
 * preview de Lovable, que no recibe variables de build) se usa la configuración pública
 * versionada en `public-config.ts`.
 */
const SUPABASE_URL = env("VITE_SUPABASE_URL") ?? PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env("VITE_SUPABASE_ANON_KEY") ?? PUBLIC_SUPABASE_KEY;

/** ¿Hay configuración de Supabase disponible? (sin exponer los valores). */
export function supabaseIsConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Detalle técnico para la consola de desarrollo: qué falta, nunca los valores.
 * En producción no registra nada; la pantalla solo muestra un aviso neutral.
 */
export function logSupabaseConfigIssue(): void {
  if (!import.meta.env.DEV) return;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return;
  console.warn(
    "[auth] Inicio de sesión no disponible: revisa `src/lib/public-config.ts` o define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
  );
}

export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("El cliente de Supabase solo está disponible en el navegador.");
  }
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Falta la configuración pública de Supabase.");
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}
