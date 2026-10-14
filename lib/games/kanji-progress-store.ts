import { combineProgressEvents, emptyProgress, parseProgress, parseProgressEvent, progressTotals, recordRound, type PracticeRound, type ProgressEvent } from "./kanji-progress";

export const PROGRESS_KEY = "kanji-game-progress-v1";
export const PROGRESS_EVENT = "kanji-progress-changed";
const CACHE_PREFIX = "kanji-game-cloud-cache-v2:";
const MIGRATED_KEY = "kanji-game-migrated-v2";
const OUTBOX_PREFIX = "kanji-game-outbox-v2:";
type Scope = { cloud: Map<string, ProgressEvent>; pending: Map<string, ProgressEvent>; persistent: boolean };
const scopes = new Map<string, Scope>();
let accountId: string | null = null;
let accountEmail: string | null = null;
let accountReady = false;
let configured = true;
let epoch = 0;
let migrated = false;
let syncStatus: "connecting" | "syncing" | "synced" | "offline" | "error" | "setup" | "local" | "signin" = "connecting";
let lastSyncedAt: number | null = null;
let running: Promise<void> | null = null;
let subscribers = 0;
let stopWatching: (() => void) | null = null;

function scopeFor(id = accountId ?? "guest"): Scope {
  if (!scopes.has(id)) scopes.set(id, { cloud: new Map(), pending: new Map(), persistent: true });
  return scopes.get(id)!;
}
const outboxKey = (scope: string, id: string) => `${OUTBOX_PREFIX}${scope}:${id}`;
const notify = () => window.dispatchEvent(new Event(PROGRESS_EVENT));

export function newPracticeRoundId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function rememberPending(event: ProgressEvent, id = accountId ?? "guest"): boolean {
  const scope = scopeFor(id);
  scope.pending.set(event.id, event);
  try { window.localStorage.setItem(outboxKey(id, event.id), JSON.stringify(event)); return true; }
  catch { scope.persistent = false; return false; }
}

function hydrate(id = accountId ?? "guest") {
  const scope = scopeFor(id);
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(CACHE_PREFIX + id) ?? "null");
    if (Array.isArray(raw)) for (const item of raw) {
      const event = parseProgressEvent(item);
      if (event) scope.cloud.set(event.id, event);
    }
  } catch { /* Recover a damaged cache from the cloud without discarding the outbox. */ }
  try {
    if (!migrated && window.localStorage.getItem(MIGRATED_KEY) !== "1") {
      const legacy = parseProgress(window.localStorage.getItem(PROGRESS_KEY));
      if (progressTotals(legacy).answered) {
        const eventId = `legacy:${legacy.savedRounds.at(-1) ?? newPracticeRoundId()}`;
        const guest = scopeFor("guest");
        if (!guest.pending.has(eventId)) rememberPending({ id: eventId, progress: legacy, playedAt: new Date().toISOString() }, "guest");
      }
      // v1 remains untouched as a backup. Import into the shared learning profile only once.
      if (scopeFor("guest").persistent) window.localStorage.setItem(MIGRATED_KEY, "1");
    }
    migrated = true;
    const prefix = `${OUTBOX_PREFIX}${id}:`;
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const event = parseProgressEvent(JSON.parse(window.localStorage.getItem(key) ?? "null"));
        if (event && !scope.cloud.has(event.id)) scope.pending.set(event.id, event);
      } catch { /* One invalid entry must not discard other saved rounds. */ }
    }
  } catch { scope.persistent = false; }
  for (const eventId of scope.cloud.keys()) scope.pending.delete(eventId);
}

function setAccount(id: string | null, email: string | null, available = true) {
  if (accountReady && id === accountId && configured === available) { accountEmail = email; if (id) void syncKanjiProgress(); return; }
  hydrate("guest");
  accountId = id; accountEmail = email; accountReady = true; configured = available;
  epoch++; lastSyncedAt = null;
  if (id) {
    hydrate(id);
    // This app has one learner. Preserve cached progress from the former email flow.
    const previousScopes = new Set<string>();
    try {
      for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index) ?? "";
        if (key.startsWith(CACHE_PREFIX)) previousScopes.add(key.slice(CACHE_PREFIX.length));
        if (key.startsWith(OUTBOX_PREFIX)) previousScopes.add(key.slice(OUTBOX_PREFIX.length).split(":")[0]);
      }
      for (const previousId of previousScopes) {
        if (!/^[a-f0-9-]{36}$/i.test(previousId)) continue;
        hydrate(previousId);
        const previous = scopeFor(previousId);
        for (const event of [...previous.cloud.values(), ...previous.pending.values()]) {
          if (!scopeFor(id).cloud.has(event.id)) rememberPending(event, id);
        }
      }
    } catch { scopeFor(id).persistent = false; }
    const guest = scopeFor("guest");
    for (const event of guest.pending.values()) {
      // Write into the shared profile's outbox before removing its guest copy.
      const durable = rememberPending(event, id);
      if (durable) {
        try { window.localStorage.removeItem(outboxKey("guest", event.id)); } catch { /* Retry on next visit. */ }
      }
      guest.pending.delete(event.id);
    }
  }
  syncStatus = !configured ? "local" : id ? "connecting" : "signin";
  notify();
  if (id) void syncKanjiProgress();
}

export function loadKanjiProgress() {
  hydrate();
  const scope = scopeFor();
  return { progress: combineProgressEvents([...scope.cloud.values(), ...scope.pending.values()]), persistent: scope.persistent,
    syncStatus, pendingCount: scope.pending.size, lastSyncedAt, accountId, accountEmail };
}

export function saveKanjiRound(round: PracticeRound): boolean {
  const snapshot = loadKanjiProgress();
  const scope = scopeFor();
  if (round.answers.length && !scope.cloud.has(round.id) && !scope.pending.has(round.id) && !snapshot.progress.savedRounds.includes(round.id)) {
    const now = new Date();
    rememberPending({ id: round.id, playedAt: now.toISOString(), progress: recordRound(emptyProgress(), round, now) });
  }
  notify(); void syncKanjiProgress();
  return scope.persistent;
}

export function syncKanjiProgress(): Promise<void> {
  if (running) return running;
  if (!accountReady || !accountId) { if (accountReady) syncStatus = configured ? "signin" : "local"; notify(); return Promise.resolve(); }
  const id = accountId, generation = epoch, scope = scopeFor(id);
  running = (async () => {
    hydrate(id);
    if (!navigator.onLine) { syncStatus = "offline"; notify(); return; }
    syncStatus = "syncing"; notify();
    try {
      const { exchangeKanjiProgress } = await import("./kanji-progress-cloud");
      const events = await exchangeKanjiProgress(id, [...scope.pending.values()], scope.cloud.size);
      if (generation !== epoch) return;
      if (events === null) { syncStatus = "local"; return; }
      for (const event of events) scope.cloud.set(event.id, event);
      hydrate(id);
      try {
        window.localStorage.setItem(CACHE_PREFIX + id, JSON.stringify([...scope.cloud.values()]));
        for (const eventId of scope.cloud.keys()) window.localStorage.removeItem(outboxKey(id, eventId));
      } catch { scope.persistent = false; }
      lastSyncedAt = Date.now();
      syncStatus = scope.pending.size ? "syncing" : "synced";
    } catch (error) {
      if (generation !== epoch) return;
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      syncStatus = code === "42P01" || code === "PGRST205" ? "setup" : navigator.onLine ? "error" : "offline";
    } finally { if (generation === epoch) notify(); }
  })().finally(() => {
    running = null;
    if (accountId && (generation !== epoch || (syncStatus === "syncing" && scope.pending.size))) void syncKanjiProgress();
  });
  return running;
}

/** One watcher shared by the hub and game results. */
export function watchKanjiProgress(listener: () => void): () => void {
  window.addEventListener(PROGRESS_EVENT, listener);
  if (subscribers++ === 0) {
    let stopped = false;
    let stopAccount: (() => void) | undefined;
    void import("./kanji-progress-cloud").then(({ watchProgressAccount }) => {
      if (!stopped) stopAccount = watchProgressAccount(setAccount);
    });
    const resume = () => { if (!document.hidden) void syncKanjiProgress(); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key?.startsWith(CACHE_PREFIX) || event.key === PROGRESS_KEY || event.key?.startsWith(OUTBOX_PREFIX)) {
        notify();
        if (event.key?.startsWith(OUTBOX_PREFIX) && event.newValue) resume();
      }
    };
    window.addEventListener("online", resume); window.addEventListener("offline", resume);
    window.addEventListener("focus", resume); window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", resume);
    const timer = window.setInterval(resume, 30_000);
    stopWatching = () => {
      stopped = true; stopAccount?.();
      window.removeEventListener("online", resume); window.removeEventListener("offline", resume);
      window.removeEventListener("focus", resume); window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", resume); window.clearInterval(timer);
    };
    resume();
  }
  listener();
  return () => { window.removeEventListener(PROGRESS_EVENT, listener); if (--subscribers === 0) { stopWatching?.(); stopWatching = null; } };
}

export function progressSyncMessage(snapshot: ReturnType<typeof loadKanjiProgress>): string {
  const { syncStatus, pendingCount, persistent } = snapshot;
  if (syncStatus === "synced") return "Synced across your devices";
  const saved = persistent ? "Saved on this device" : "Kept in this tab only — keep it open until synced";
  if (syncStatus === "signin") return `${saved} · connect this device to sync`;
  if (syncStatus === "connecting" || syncStatus === "syncing") return pendingCount ? `${saved} · syncing…` : "Checking your shared progress…";
  if (syncStatus === "offline") return `${saved} · offline, will sync when connected`;
  if (syncStatus === "setup") return `${saved} · cloud setup needed`;
  if (syncStatus === "local") return `${saved} · cloud sync isn’t configured`;
  return `${saved} · sync paused, will retry`;
}
