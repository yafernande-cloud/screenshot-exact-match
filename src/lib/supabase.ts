import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

/** ¿Están cargadas las variables públicas de Supabase? (sin exponer sus valores). */
export function supabaseIsConfigured(): boolean {
  return Boolean(env("VITE_SUPABASE_URL") && env("VITE_SUPABASE_ANON_KEY"));
}

export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("El cliente de Supabase solo está disponible en el navegador.");
  }
  if (client) return client;
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.");
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}
