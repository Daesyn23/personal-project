/**
 * Maps Google Sheets `merges` (sheet 0-based indices) into local grid coordinates
 * for the GridData block returned for a bounded range (uses GridData startRow/startColumn).
 */

export type SheetApiGridRange = {
  startRowIndex?: number | null;
  endRowIndex?: number | null;
  startColumnIndex?: number | null;
  endColumnIndex?: number | null;
};

export type SheetMergeCell = {
  r: number;
  c: number;
  rowspan: number;
  colspan: number;
};

export function localizeSheetMerges(
  apiMerges: SheetApiGridRange[],
  gridStartRow: number,
  gridStartCol: number,
  maxRows: number,
  maxCols: number
): SheetMergeCell[] {
  const out: SheetMergeCell[] = [];
  for (const m of apiMerges) {
    const sr = m.startRowIndex ?? 0;
    const er = m.endRowIndex ?? sr;
    const sc = m.startColumnIndex ?? 0;
    const ec = m.endColumnIndex ?? sc;
    if (er <= sr || ec <= sc) continue;

    const lr = sr - gridStartRow;
    const lc = sc - gridStartCol;
    if (lr < 0 || lc < 0 || lr >= maxRows || lc >= maxCols) continue;

    const endRLocal = er - gridStartRow;
    const endCLocal = ec - gridStartCol;
    const rowspan = Math.min(endRLocal, maxRows) - lr;
    const colspan = Math.min(endCLocal, maxCols) - lc;
    if (rowspan < 1 || colspan < 1) continue;
    if (rowspan === 1 && colspan === 1) continue;

    out.push({ r: lr, c: lc, rowspan, colspan });
  }
  return out;
}
