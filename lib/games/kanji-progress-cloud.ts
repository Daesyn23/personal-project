import { parseProgressEvent, type ProgressEvent } from "./kanji-progress";

const ENDPOINT = "/api/kanji-progress";

export function watchProgressAccount(onChange: (id: string | null, email: string | null, configured?: boolean) => void): () => void {
  onChange("workspace", null);
  return () => {};
}

async function request(path: string, body?: ProgressEvent[]) {
  const response = await fetch(ENDPOINT + path, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("Progress sync failed");
  return response.json();
}

export async function exchangeKanjiProgress(_userId: string, pending: ProgressEvent[], cachedCount: number): Promise<ProgressEvent[]> {
  // Single-event uploads keep even a large migrated history within the request limit.
  for (const event of pending) await request("", [event]);
  const { count } = await request("?count=1");
  if (count === cachedCount && pending.length === 0) return [];
  const events: ProgressEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { events: page } = await request(`?offset=${offset}`);
    if (!Array.isArray(page)) throw new Error("Invalid progress response");
    for (const row of page) {
      const event = parseProgressEvent(row);
      if (!event) throw new Error("Invalid progress record");
      events.push(event);
    }
    if (page.length < 500) break;
  }
  return events;
}
