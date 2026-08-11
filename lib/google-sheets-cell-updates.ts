export type GoogleSheetCellUpdate = {
  rowIndex: number;
  columnIndex: number;
  value: string;
};

export type GoogleSheetValueRange = {
  range: string;
  values: string[][];
};

function columnIndexFromLabel(label: string): number {
  let value = 0;
  for (const char of label.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      throw new Error(`Invalid column label: ${label}`);
    }
    value = value * 26 + (code - 64);
  }
  return value - 1;
}

function columnLabelFromIndex(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function resolvedRangeStart(resolvedRange: string): {
  sheetPrefix: string;
  rowIndex: number;
  columnIndex: number;
} {
  // The final ! is the separator even when a quoted sheet title contains !.
  const separator = resolvedRange.lastIndexOf("!");
  if (separator <= 0 || separator === resolvedRange.length - 1) {
    throw new Error(`Expected a resolved sheet range, received: ${resolvedRange}`);
  }

  const sheetPrefix = resolvedRange.slice(0, separator);
  const firstCell = resolvedRange.slice(separator + 1).split(":", 1)[0];
  const match = /^\$?([A-Za-z]+)?\$?(\d+)?$/.exec(firstCell);
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Unable to determine the first cell in range: ${resolvedRange}`);
  }

  return {
    sheetPrefix,
    columnIndex: match[1] ? columnIndexFromLabel(match[1]) : 0,
    rowIndex: match[2] ? Number(match[2]) - 1 : 0,
  };
}

/**
 * Converts zero-based edits relative to a configured A1 range into single-cell
 * value ranges. Updating only these cells keeps formulas and concurrent edits in
 * every other Google Sheets cell untouched.
 */
export function buildGoogleSheetCellValueRanges(
  resolvedRange: string,
  updates: GoogleSheetCellUpdate[]
): GoogleSheetValueRange[] {
  const start = resolvedRangeStart(resolvedRange);
  const deduplicated = new Map<string, GoogleSheetCellUpdate>();

  for (const update of updates) {
    if (
      !Number.isInteger(update.rowIndex) ||
      update.rowIndex < 0 ||
      !Number.isInteger(update.columnIndex) ||
      update.columnIndex < 0 ||
      typeof update.value !== "string"
    ) {
      throw new Error("Each cell update must contain non-negative row/column indexes and a string value.");
    }
    deduplicated.set(`${update.rowIndex}:${update.columnIndex}`, update);
  }

  return Array.from(deduplicated.values()).map((update) => {
    const rowNumber = start.rowIndex + update.rowIndex + 1;
    const columnLabel = columnLabelFromIndex(start.columnIndex + update.columnIndex);
    return {
      range: `${start.sheetPrefix}!${columnLabel}${rowNumber}`,
      values: [[update.value]],
    };
  });
}
