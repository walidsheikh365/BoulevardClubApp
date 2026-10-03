import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types";

export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function browserClient() {
  if (!supabaseConfigured) throw new Error("Supabase is not configured. Add the project URL and publishable key, or explicitly enable demo mode.");
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return client;
}
