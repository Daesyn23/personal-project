import { NextRequest, NextResponse } from "next/server";
import { parseProgressEvent } from "@/lib/games/kanji-progress";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Explicitly shared, single-user game progress: no email or pairing step.
// Callers can access only this fixed progress scope, never other tables or users.
const WORKSPACE_PROGRESS_ID = "527d5b6c-18fb-4a69-a19a-305ba7d65872";
const TABLE = "workspace_kanji_progress_events";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const client = getSupabaseServiceClient();
  if (!client) return json({ error: "Cloud sync is not configured." }, 503);
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Invalid page." }, 400);
  const countOnly = request.nextUrl.searchParams.get("count") === "1";
  const query = client.from(TABLE).select("id, progress, played_at", { count: "exact", head: countOnly })
    .eq("user_id", WORKSPACE_PROGRESS_ID).order("id").range(offset, offset + 499);
  const { data, count, error } = await query.abortSignal(AbortSignal.timeout(15_000));
  if (error) return json({ error: "Could not load progress." }, 502);
  return json({ count, events: (data ?? []).map(row => ({ id: row.id, progress: row.progress, playedAt: row.played_at })) });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseServiceClient();
  if (!client) return json({ error: "Cloud sync is not configured." }, 503);
  // Limit the streamed body too; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing progress." }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) { await reader.cancel(); return json({ error: "Progress batch is too large." }, 413); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return json({ error: "Invalid progress." }, 400); }
  if (!Array.isArray(body) || body.length < 1 || body.length > 100) return json({ error: "Invalid progress batch." }, 400);
  const events = body.map(parseProgressEvent);
  if (events.some(event => !event || Buffer.byteLength(JSON.stringify(event.progress)) > 131072)) return json({ error: "Invalid progress record." }, 400);
  const rows = events.map(event => ({ user_id: WORKSPACE_PROGRESS_ID, id: event!.id, progress: event!.progress, played_at: event!.playedAt }));
  const { error } = await client.from(TABLE).upsert(rows, { onConflict: "user_id,id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(15_000));
  if (error) return json({ error: "Could not save progress." }, 502);
  return json({ saved: true });
}
