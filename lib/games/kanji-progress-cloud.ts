import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseProgressEvent, type ProgressEvent } from "./kanji-progress";

const TABLE = "workspace_kanji_progress_events";

export function watchProgressAccount(onChange: (id: string | null, email: string | null, configured?: boolean) => void): () => void {
  const client = getSupabaseBrowserClient();
  if (!client) { onChange(null, null, false); return () => {}; }
  let active = true;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    // Auth callbacks must not await another Supabase operation while its lock is held.
    queueMicrotask(() => { if (active) onChange(session?.user.id ?? null, session?.user.email ?? null); });
  });
  return () => { active = false; data.subscription.unsubscribe(); };
}

export async function exchangeKanjiProgress(userId: string, pending: ProgressEvent[], cachedCount: number): Promise<ProgressEvent[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  for (let offset = 0; offset < pending.length; offset += 100) {
    const rows = pending.slice(offset, offset + 100).map(event => ({ user_id: userId, id: event.id, progress: event.progress, played_at: event.playedAt }));
    const { error } = await client.from(TABLE).upsert(rows, { onConflict: "user_id,id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(15_000));
    if (error) throw error;
  }
  // Rows are append-only. Idle devices need only a lightweight count check.
  const { count, error } = await client.from(TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  if (count === cachedCount && pending.length === 0) return [];
  const events: ProgressEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(TABLE).select("id, progress, played_at").eq("user_id", userId).order("id").range(offset, offset + 499).abortSignal(AbortSignal.timeout(15_000));
    if (error) throw error;
    for (const row of data ?? []) {
      const event = parseProgressEvent({ id: row.id, progress: row.progress, playedAt: row.played_at });
      if (!event) throw new Error("Invalid progress record");
      events.push(event);
    }
    if (!data || data.length < 500) break;
  }
  return events;
}
