import { parseSpreadsheetId } from "@/lib/parse-spreadsheet-url";

/** Cell-only default range; tab from URL or dropdown when no sheet name in range. */
export const DEFAULT_SHEETS_CELL_RANGE = "A1:AA200";

export type SavedGoogleSheetLink = {
  id: string;
  label: string;
  spreadsheetInput: string;
  range: string;
  /** When omitted, treat as true (legacy links). */
  importFormatting?: boolean;
};

const LS_LINKS = "workspace_google_sheets_links";
const LS_ACTIVE_LINK = "workspace_google_sheets_active_link_id";
const LS_LEGACY_ID = "workspace_google_sheets_spreadsheet_id";
const LS_LEGACY_RANGE = "workspace_google_sheets_range";

function defaultLabelForInput(input: string): string {
  const id = parseSpreadsheetId(input);
  if (id && id.length >= 8) return `Sheet · ${id.slice(0, 8)}…`;
  if (id) return `Sheet · ${id}`;
  return "Linked sheet";
}

function normalizeLink(raw: unknown): SavedGoogleSheetLink | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const spreadsheetInput =
    typeof o.spreadsheetInput === "string" ? o.spreadsheetInput : typeof o.url === "string" ? o.url : "";
  const range =
    typeof o.range === "string" && o.range.trim() ? o.range.trim() : DEFAULT_SHEETS_CELL_RANGE;
  const importFormatting =
    typeof o.importFormatting === "boolean" ? o.importFormatting : true;
  if (!id) return null;
  return {
    id,
    label: label || defaultLabelForInput(spreadsheetInput),
    spreadsheetInput,
    range,
    importFormatting,
  };
}

export function readSavedSheetLinks(): SavedGoogleSheetLink[] {
  try {
    const raw = localStorage.getItem(LS_LINKS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: SavedGoogleSheetLink[] = [];
    for (const item of arr) {
      const n = normalizeLink(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export function writeSavedSheetLinks(links: SavedGoogleSheetLink[]): void {
  try {
    localStorage.setItem(LS_LINKS, JSON.stringify(links));
  } catch {
    /* ignore */
  }
}

export function readActiveLinkId(): string | null {
  try {
    const v = localStorage.getItem(LS_ACTIVE_LINK)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function writeActiveLinkId(id: string | null): void {
  try {
    if (id == null || id === "") localStorage.removeItem(LS_ACTIVE_LINK);
    else localStorage.setItem(LS_ACTIVE_LINK, id);
  } catch {
    /* ignore */
  }
}

/**
 * Prefer `LS_LINKS`; if empty, migrate legacy single URL + range keys into one link.
 */
export function loadLinksWithMigration(): SavedGoogleSheetLink[] {
  const existing = readSavedSheetLinks();
  if (existing.length > 0) return existing;

  try {
    const legId = localStorage.getItem(LS_LEGACY_ID)?.trim() ?? "";
    const legRange =
      localStorage.getItem(LS_LEGACY_RANGE)?.trim() || DEFAULT_SHEETS_CELL_RANGE;
    if (!legId) return [];

    const link: SavedGoogleSheetLink = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      label: defaultLabelForInput(legId),
      spreadsheetInput: legId,
      range: legRange,
    };
    writeSavedSheetLinks([link]);
    return [link];
  } catch {
    return [];
  }
}

export function newSheetLinkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export { defaultLabelForInput };
