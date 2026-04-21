/**
 * Normalizes A1 notation for the Google Sheets API.
 * Curly/smart quotes around sheet names break parsing ("Unable to parse range").
 */
export function normalizeSheetsA1Range(range: string): string {
  return range
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u200B|\uFEFF/g, "")
    .trim();
}

/** Google spreadsheet IDs are typically ~44 chars; very short values are usually a bad copy/paste. */
export function spreadsheetIdLooksIncomplete(id: string): boolean {
  return id.length > 0 && id.length < 30;
}

/** Wrap a sheet title for A1 ranges; double any single quotes inside the title. */
export function quoteSheetTitleForA1(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}
