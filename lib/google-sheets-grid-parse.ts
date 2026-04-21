/**
 * Parses GridData from spreadsheets.get(includeGridData: true).
 * effectiveFormat reflects conditional formatting after rules are applied (per Google Sheets API).
 */

export type SheetCellStyle = {
  backgroundColor?: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontSize?: string;
  fontFamily?: string;
  textDecoration?: string;
  textAlign?: "left" | "center" | "right";
};

export type RichTextSpan = {
  text: string;
  style?: SheetCellStyle;
};

export type SheetCellPayload = {
  display: string;
  baseStyle: SheetCellStyle | null;
  /** Multiple inline formats in one cell */
  richSpans?: RichTextSpan[];
};

type GColor = {
  red?: number | null;
  green?: number | null;
  blue?: number | null;
  alpha?: number | null;
};

export function googleColorToCss(c: GColor | null | undefined): string | undefined {
  if (!c) return undefined;
  const r = Math.round((c.red ?? 0) * 255);
  const g = Math.round((c.green ?? 0) * 255);
  const b = Math.round((c.blue ?? 0) * 255);
  const a = c.alpha;
  if (typeof a === "number" && a < 1) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${r},${g},${b})`;
}

function textFormatFragment(tf: Record<string, unknown> | null | undefined): SheetCellStyle {
  if (!tf) return {};
  const s: SheetCellStyle = {};
  const fg = tf.foregroundColor as GColor | undefined;
  if (fg) s.color = googleColorToCss(fg);
  if (tf.bold) s.fontWeight = "700";
  if (tf.italic) s.fontStyle = "italic";
  if (typeof tf.fontSize === "number") s.fontSize = `${tf.fontSize}pt`;
  if (typeof tf.fontFamily === "string") s.fontFamily = tf.fontFamily;
  const parts: string[] = [];
  if (tf.underline) parts.push("underline");
  if (tf.strikethrough) parts.push("line-through");
  if (parts.length) s.textDecoration = parts.join(" ");
  return s;
}

export function effectiveFormatToStyle(f: Record<string, unknown> | null | undefined): SheetCellStyle {
  if (!f) return {};
  const s: SheetCellStyle = {};
  const bg = f.backgroundColor as GColor | undefined;
  if (bg) s.backgroundColor = googleColorToCss(bg);
  Object.assign(s, textFormatFragment(f.textFormat as Record<string, unknown> | undefined));
  const ha = f.horizontalAlignment as string | undefined;
  if (ha === "CENTER") s.textAlign = "center";
  else if (ha === "RIGHT") s.textAlign = "right";
  else if (ha === "LEFT") s.textAlign = "left";
  return s;
}

function mergeStyles(
  base: SheetCellStyle | null | undefined,
  overlay: SheetCellStyle | null | undefined
): SheetCellStyle {
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function styleIsEmpty(s: SheetCellStyle | null | undefined): boolean {
  return !s || Object.keys(s).length === 0;
}

function cellDisplayString(cell: Record<string, unknown> | null | undefined): string {
  if (!cell) return "";
  const fv = cell.formattedValue;
  if (fv != null && String(fv) !== "") return String(fv);
  const ev = cell.effectiveValue as Record<string, unknown> | undefined;
  if (!ev) return "";
  if (ev.stringValue != null) return String(ev.stringValue);
  if (typeof ev.numberValue === "number") return String(ev.numberValue);
  if (typeof ev.boolValue === "boolean") return ev.boolValue ? "TRUE" : "FALSE";
  return "";
}

function buildRichSpans(
  display: string,
  runs: { startIndex?: number; format?: { textFormat?: Record<string, unknown> } }[] | undefined,
  baseStyle: SheetCellStyle | null
): RichTextSpan[] | undefined {
  if (!display || !runs?.length) return undefined;
  const sorted = [...runs].sort((a, b) => (a.startIndex ?? 0) - (b.startIndex ?? 0));
  const full: RichTextSpan[] = [];
  let pos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.min(display.length, Math.max(0, sorted[i].startIndex ?? 0));
    if (start > pos) {
      full.push({
        text: display.slice(pos, start),
        style: styleIsEmpty(baseStyle) ? undefined : baseStyle ?? undefined,
      });
    }
    const end =
      i + 1 < sorted.length
        ? Math.min(display.length, sorted[i + 1].startIndex ?? display.length)
        : display.length;
    const tf = sorted[i].format?.textFormat;
    const st = mergeStyles(baseStyle, textFormatFragment(tf));
    full.push({
      text: display.slice(start, end),
      style: styleIsEmpty(st) ? undefined : st,
    });
    pos = end;
  }
  if (pos < display.length) {
    full.push({
      text: display.slice(pos),
      style: styleIsEmpty(baseStyle) ? undefined : baseStyle ?? undefined,
    });
  }
  return full.length ? full : undefined;
}

export function cellToPayload(cell: Record<string, unknown> | null | undefined): SheetCellPayload {
  const display = cellDisplayString(cell);
  const baseRaw = cell?.effectiveFormat as Record<string, unknown> | undefined;
  const baseStyle = baseRaw ? effectiveFormatToStyle(baseRaw) : null;
  const runs = cell?.textFormatRuns as
    | { startIndex?: number; format?: { textFormat?: Record<string, unknown> } }[]
    | undefined;
  const richSpans = buildRichSpans(display, runs, styleIsEmpty(baseStyle) ? null : baseStyle);
  return {
    display,
    baseStyle: styleIsEmpty(baseStyle) ? null : baseStyle,
    richSpans,
  };
}

export type ParsedGrid = {
  values: string[][];
  cells: SheetCellPayload[][];
};

export function emptyCellPayload(): SheetCellPayload {
  return { display: "", baseStyle: null };
}

/** Align rows/columns and sync `display` with `values` after padding. */
export function finalizeParsedGrid(parsed: ParsedGrid, maxRows: number, maxCols: number): ParsedGrid {
  let values = parsed.values;
  const cellsIn = parsed.cells;
  if (values.length === 0) {
    const empty = Array.from({ length: 6 }, () => "");
    const emptyP = Array.from({ length: 6 }, () => emptyCellPayload());
    return { values: [empty], cells: [emptyP] };
  }

  const slicedRows = Math.min(values.length, maxRows);
  values = values.slice(0, slicedRows).map((row) => row.slice(0, maxCols));
  let cols = values.reduce((m, r) => Math.max(m, r.length), 0);
  cols = Math.min(cols, maxCols);

  const normV = values.map((row) => {
    const x = [...row];
    while (x.length < cols) x.push("");
    return x.slice(0, maxCols);
  });

  const normC: SheetCellPayload[][] = normV.map((row, r) =>
    row.map((cellVal, c) => {
      const p = cellsIn[r]?.[c];
      if (p) {
        return { ...p, display: cellVal };
      }
      return { display: cellVal, baseStyle: null };
    })
  );

  return { values: normV, cells: normC };
}

/** Parse first GridData block returned for `ranges: [a1Range]`. */
export function parseGridDataToTable(
  grid: Record<string, unknown> | null | undefined,
  maxRows: number,
  maxCols: number
): ParsedGrid {
  const rowData = grid?.rowData as Record<string, unknown>[] | undefined;
  if (!rowData?.length) {
    return { values: [], cells: [] };
  }

  let width = 0;
  for (const row of rowData) {
    const vals = row?.values as unknown[] | undefined;
    const n = vals?.length ?? 0;
    if (n > width) width = n;
  }
  width = Math.min(width, maxCols);

  const values: string[][] = [];
  const cells: SheetCellPayload[][] = [];
  const rowLimit = Math.min(rowData.length, maxRows);

  for (let r = 0; r < rowLimit; r++) {
    const row = rowData[r];
    const rowVals = (row?.values as Record<string, unknown>[] | undefined) ?? [];
    const valueRow: string[] = [];
    const cellRow: SheetCellPayload[] = [];
    for (let c = 0; c < width; c++) {
      const cell = rowVals[c];
      const payload = cellToPayload(cell);
      valueRow.push(payload.display);
      cellRow.push(payload);
    }
    values.push(valueRow);
    cells.push(cellRow);
  }

  return { values, cells };
}
