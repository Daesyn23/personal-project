/**
 * Extracts a Google Sheets spreadsheet ID from a full URL or returns a bare ID if valid.
 */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Tab id from `?gid=760588099` or `#gid=760588099` in a Sheets URL (used to resolve the exact sheet title). */
export function parseSheetGidFromUrl(input: string): number | null {
  const m = input.match(/[#?&]gid=(\d+)/);
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
