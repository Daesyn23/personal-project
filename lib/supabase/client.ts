import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** One client per browser context so GoTrue does not attach multiple auth listeners to the same storage key. */
const globalForSupabase = globalThis as unknown as {
  __supabaseBrowserClient?: SupabaseClient;
};

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!url || !anon) {
    return null;
  }
  if (!globalForSupabase.__supabaseBrowserClient) {
    globalForSupabase.__supabaseBrowserClient = createClient(url, anon);
  }
  return globalForSupabase.__supabaseBrowserClient;
}
