import type { SupabaseClient } from "@supabase/supabase-js";

/** Single shared row for all app users (anon key). */
const GLOBAL_SETTINGS_ROW_ID = "global" as const;
import {
  normalizeLink,
  readActiveLinkId,
  readSavedSheetLinks,
  writeActiveLinkId,
  writeSavedSheetLinks,
  type SavedGoogleSheetLink,
} from "@/lib/google-sheets-links";
import { parseSpreadsheetId } from "@/lib/parse-spreadsheet-url";

const SYNC_META_KEY = "workspace_google_sheets_sync_meta";

export type WorkspaceGoogleSheetsSyncMeta = {
  lastSyncedRemoteUpdatedMs: number;
  lastLocalMutationMs: number;
};

export const DEFAULT_SYNC_META: WorkspaceGoogleSheetsSyncMeta = {
  lastSyncedRemoteUpdatedMs: 0,
  lastLocalMutationMs: 0,
};

function sheetIdStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_sheet_${spreadsheetId}`;
}

function frozenThroughColStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_frozen_through_${spreadsheetId}`;
}

function colWidthsStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_col_widths_${spreadsheetId}`;
}

function worksheetZoomStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_zoom_${spreadsheetId}`;
}

export type PerSpreadsheetPrefs = {
  selectedSheetId?: number | null;
  frozenThroughCol?: number | null;
  columnWidthsPx?: number[];
  worksheetZoom?: number;
};

export type WorkspaceGoogleSheetsStateV1 = {
  v: 1;
  links: SavedGoogleSheetLink[];
  activeLinkId: string | null;
  bySpreadsheetId: Record<string, PerSpreadsheetPrefs>;
};

export function readSyncMeta(): WorkspaceGoogleSheetsSyncMeta {
  if (typeof window === "undefined") return { ...DEFAULT_SYNC_META };
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { ...DEFAULT_SYNC_META };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastSyncedRemoteUpdatedMs:
        typeof o.lastSyncedRemoteUpdatedMs === "number" && Number.isFinite(o.lastSyncedRemoteUpdatedMs)
          ? o.lastSyncedRemoteUpdatedMs
          : 0,
      lastLocalMutationMs:
        typeof o.lastLocalMutationMs === "number" && Number.isFinite(o.lastLocalMutationMs)
          ? o.lastLocalMutationMs
          : 0,
    };
  } catch {
    return { ...DEFAULT_SYNC_META };
  }
}

export function writeSyncMeta(meta: WorkspaceGoogleSheetsSyncMeta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function bumpLocalSheetsMutation(): void {
  const m = readSyncMeta();
  m.lastLocalMutationMs = Date.now();
  writeSyncMeta(m);
}

export function markSheetsSyncedFromServer(updatedAtIso: string): void {
  const ms = Date.parse(updatedAtIso);
  if (!Number.isFinite(ms)) return;
  const m = readSyncMeta();
  m.lastSyncedRemoteUpdatedMs = ms;
  m.lastLocalMutationMs = Math.max(m.lastLocalMutationMs, ms);
  writeSyncMeta(m);
}

function readPerSheetFromLocal(spreadsheetId: string): PerSpreadsheetPrefs {
  const out: PerSpreadsheetPrefs = {};
  try {
    const rawTab = localStorage.getItem(sheetIdStorageKey(spreadsheetId));
    if (rawTab != null && rawTab !== "") {
      const n = parseInt(rawTab, 10);
      if (Number.isFinite(n)) out.selectedSheetId = n;
    }
  } catch {
    /* ignore */
  }
  try {
    const rawF = localStorage.getItem(frozenThroughColStorageKey(spreadsheetId));
    if (rawF != null && rawF !== "") {
      const n = parseInt(rawF, 10);
      if (Number.isFinite(n) && n >= 0) out.frozenThroughCol = n;
    }
  } catch {
    /* ignore */
  }
  try {
    const rawW = localStorage.getItem(colWidthsStorageKey(spreadsheetId));
    if (rawW) {
      const arr = JSON.parse(rawW) as unknown;
      if (Array.isArray(arr)) {
        const nums = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
        if (nums.length > 0) out.columnWidthsPx = nums;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const rawZ = localStorage.getItem(worksheetZoomStorageKey(spreadsheetId));
    if (rawZ != null && rawZ !== "") {
      const z = parseFloat(rawZ);
      if (Number.isFinite(z)) out.worksheetZoom = z;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function writePerSheetToLocal(spreadsheetId: string, prefs: PerSpreadsheetPrefs): void {
  try {
    if ("selectedSheetId" in prefs) {
      if (prefs.selectedSheetId == null || prefs.selectedSheetId === undefined) {
        localStorage.removeItem(sheetIdStorageKey(spreadsheetId));
      } else {
        localStorage.setItem(sheetIdStorageKey(spreadsheetId), String(prefs.selectedSheetId));
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if ("frozenThroughCol" in prefs) {
      if (prefs.frozenThroughCol == null || prefs.frozenThroughCol === undefined) {
        localStorage.removeItem(frozenThroughColStorageKey(spreadsheetId));
      } else {
        localStorage.setItem(frozenThroughColStorageKey(spreadsheetId), String(prefs.frozenThroughCol));
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if ("columnWidthsPx" in prefs) {
      if (prefs.columnWidthsPx && prefs.columnWidthsPx.length > 0) {
        localStorage.setItem(colWidthsStorageKey(spreadsheetId), JSON.stringify(prefs.columnWidthsPx));
      } else {
        localStorage.removeItem(colWidthsStorageKey(spreadsheetId));
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if ("worksheetZoom" in prefs) {
      if (prefs.worksheetZoom != null && Number.isFinite(prefs.worksheetZoom)) {
        localStorage.setItem(worksheetZoomStorageKey(spreadsheetId), String(prefs.worksheetZoom));
      } else {
        localStorage.removeItem(worksheetZoomStorageKey(spreadsheetId));
      }
    }
  } catch {
    /* ignore */
  }
}

export type CollectSheetsStateArgs = {
  activeSpreadsheetId: string | null;
  selectedSheetId: number | null;
  frozenThroughCol: number | null;
  columnWidthsPx: number[];
  colCount: number;
  worksheetZoom: number;
};

export function collectWorkspaceGoogleSheetsState(args: CollectSheetsStateArgs): WorkspaceGoogleSheetsStateV1 {
  const links = readSavedSheetLinks();
  const activeLinkId = readActiveLinkId();
  const bySpreadsheetId: Record<string, PerSpreadsheetPrefs> = {};
  const seen = new Set<string>();

  for (const link of links) {
    const sid = parseSpreadsheetId(link.spreadsheetInput);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const fromLs = readPerSheetFromLocal(sid);
    if (args.activeSpreadsheetId === sid) {
      const merged: PerSpreadsheetPrefs = { ...fromLs };
      merged.selectedSheetId = args.selectedSheetId;
      merged.frozenThroughCol = args.frozenThroughCol;
      if (args.columnWidthsPx.length > 0 && args.colCount > 0 && args.columnWidthsPx.length === args.colCount) {
        merged.columnWidthsPx = args.columnWidthsPx;
      }
      merged.worksheetZoom = args.worksheetZoom;
      bySpreadsheetId[sid] = merged;
      continue;
    }
    if (
      fromLs.selectedSheetId !== undefined ||
      fromLs.frozenThroughCol !== undefined ||
      (fromLs.columnWidthsPx && fromLs.columnWidthsPx.length > 0) ||
      fromLs.worksheetZoom !== undefined
    ) {
      bySpreadsheetId[sid] = fromLs;
    }
  }

  return { v: 1, links, activeLinkId, bySpreadsheetId };
}

export function applyWorkspaceGoogleSheetsStateToLocal(state: WorkspaceGoogleSheetsStateV1): void {
  writeSavedSheetLinks(state.links);
  writeActiveLinkId(state.activeLinkId);
  for (const [spreadsheetId, prefs] of Object.entries(state.bySpreadsheetId ?? {})) {
    if (!spreadsheetId.trim()) continue;
    writePerSheetToLocal(spreadsheetId, prefs);
  }
}

export function normalizeWorkspaceGoogleSheetsState(raw: unknown): WorkspaceGoogleSheetsStateV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!Array.isArray(o.links)) return null;
  const links: SavedGoogleSheetLink[] = [];
  for (const item of o.links) {
    const n = normalizeLink(item);
    if (n) links.push(n);
  }
  let activeLinkId: string | null =
    typeof o.activeLinkId === "string" && o.activeLinkId.trim() ? o.activeLinkId.trim() : null;
  if (activeLinkId && !links.some((l) => l.id === activeLinkId)) activeLinkId = null;

  const byRaw = o.bySpreadsheetId;
  const bySpreadsheetId: Record<string, PerSpreadsheetPrefs> = {};
  if (byRaw && typeof byRaw === "object" && !Array.isArray(byRaw)) {
    for (const [k, v] of Object.entries(byRaw as Record<string, unknown>)) {
      if (!k.trim() || !v || typeof v !== "object" || Array.isArray(v)) continue;
      const p = v as Record<string, unknown>;
      const prefs: PerSpreadsheetPrefs = {};
      if ("selectedSheetId" in p) {
        if (p.selectedSheetId === null) prefs.selectedSheetId = null;
        else if (typeof p.selectedSheetId === "number" && Number.isFinite(p.selectedSheetId)) {
          prefs.selectedSheetId = p.selectedSheetId;
        }
      }
      if ("frozenThroughCol" in p) {
        if (p.frozenThroughCol === null) prefs.frozenThroughCol = null;
        else if (typeof p.frozenThroughCol === "number" && Number.isFinite(p.frozenThroughCol)) {
          prefs.frozenThroughCol = p.frozenThroughCol;
        }
      }
      if (Array.isArray(p.columnWidthsPx)) {
        const nums = p.columnWidthsPx.map((x) => Number(x)).filter((n) => Number.isFinite(n));
        if (nums.length > 0) prefs.columnWidthsPx = nums;
      }
      if (typeof p.worksheetZoom === "number" && Number.isFinite(p.worksheetZoom)) {
        prefs.worksheetZoom = p.worksheetZoom;
      }
      if (Object.keys(prefs).length > 0) bySpreadsheetId[k] = prefs;
    }
  }

  return { v: 1, links, activeLinkId, bySpreadsheetId };
}

export async function pullWorkspaceGoogleSheetsSettings(
  supabase: SupabaseClient
): Promise<{ state: WorkspaceGoogleSheetsStateV1; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from("workspace_google_sheets_settings")
    .select("state, updated_at")
    .eq("id", GLOBAL_SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[workspace-google-sheets-sync] pull", error);
    return null;
  }
  if (!data?.state) return null;
  const normalized = normalizeWorkspaceGoogleSheetsState(data.state);
  if (!normalized) return null;
  const updatedAt = typeof data.updated_at === "string" ? data.updated_at : null;
  if (!updatedAt) return null;
  return { state: normalized, updatedAt };
}

function hasMeaningfulSheetsState(state: WorkspaceGoogleSheetsStateV1): boolean {
  return (
    state.links.length > 0 ||
    state.activeLinkId != null ||
    Object.keys(state.bySpreadsheetId).length > 0
  );
}

/**
 * Pull when the server copy is newer than our last sync, otherwise push if we have local edits
 * or no server row yet. Returns whether remote state was applied to localStorage.
 */
export async function syncWorkspaceSheetsWithSupabase(
  supabase: SupabaseClient,
  collectArgs: CollectSheetsStateArgs
): Promise<{ appliedRemote: boolean }> {
  const meta = readSyncMeta();
  const state = collectWorkspaceGoogleSheetsState(collectArgs);
  const remote = await pullWorkspaceGoogleSheetsSettings(supabase);
  const remoteMs = remote ? Date.parse(remote.updatedAt) : NaN;

  if (remote && Number.isFinite(remoteMs) && remoteMs > meta.lastSyncedRemoteUpdatedMs) {
    applyWorkspaceGoogleSheetsStateToLocal(remote.state);
    markSheetsSyncedFromServer(remote.updatedAt);
    return { appliedRemote: true };
  }

  if (meta.lastLocalMutationMs > meta.lastSyncedRemoteUpdatedMs) {
    const pushed = await pushWorkspaceGoogleSheetsSettings(supabase, state);
    if (pushed) markSheetsSyncedFromServer(pushed.updatedAt);
    return { appliedRemote: false };
  }

  if (!remote && hasMeaningfulSheetsState(state)) {
    const pushed = await pushWorkspaceGoogleSheetsSettings(supabase, state);
    if (pushed) markSheetsSyncedFromServer(pushed.updatedAt);
  }

  return { appliedRemote: false };
}

export async function pushWorkspaceGoogleSheetsSettings(
  supabase: SupabaseClient,
  state: WorkspaceGoogleSheetsStateV1
): Promise<{ updatedAt: string } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("workspace_google_sheets_settings")
    .upsert(
      {
        id: GLOBAL_SETTINGS_ROW_ID,
        state,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    )
    .select("updated_at")
    .single();

  if (error) {
    console.error("[workspace-google-sheets-sync] push", error);
    return null;
  }
  const updatedAt = data && typeof (data as { updated_at?: unknown }).updated_at === "string"
    ? (data as { updated_at: string }).updated_at
    : nowIso;
  return { updatedAt };
}
