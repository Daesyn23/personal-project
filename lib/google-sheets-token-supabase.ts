import { getSupabaseServiceClient } from "@/lib/supabase/service";

const TABLE = "workspace_google_sheets_oauth";

/** Persist refresh token in Postgres (Supabase service role). Skips when service client unavailable. */
export async function writeRefreshTokenToSupabase(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return false;
  const { error } = await supabase.from(TABLE).upsert(
    {
      id: "global",
      refresh_token: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[google-sheets-token-supabase] upsert failed", error.message);
    return false;
  }
  return true;
}

/** Read refresh token stored by OAuth callback (requires service role — not exposed via anon API). */
export async function readRefreshTokenFromSupabase(): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select("refresh_token").eq("id", "global").maybeSingle();
  if (error) {
    console.error("[google-sheets-token-supabase] select failed", error.message);
    return null;
  }
  const raw = typeof data?.refresh_token === "string" ? data.refresh_token.trim() : "";
  return raw.length > 0 ? raw : null;
}
