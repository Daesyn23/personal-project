import { getSheetsClient } from "@/lib/google-sheets-server";
import { parseGridDataToTable, type ParsedGrid } from "@/lib/google-sheets-grid-parse";
import type { SheetApiGridRange } from "@/lib/sheet-merge-localize";

/**
 * Field mask: balanced parens. Includes merges + grid origin so merges map into the loaded slice.
 */
const GRID_FIELDS =
  "sheets(merges,data(startRow,startColumn,rowData(values(formattedValue,effectiveValue,effectiveFormat,textFormatRuns))))";

export type FetchFormattedGridResult = {
  parsed: ParsedGrid;
  mergeRanges: SheetApiGridRange[];
  gridStartRow: number;
  gridStartCol: number;
};

export async function fetchSpreadsheetRangeWithFormatting(
  spreadsheetId: string,
  a1Range: string,
  maxRows: number,
  maxCols: number
): Promise<FetchFormattedGridResult> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [a1Range],
    includeGridData: true,
    fields: GRID_FIELDS,
  });

  const sheet = res.data.sheets?.[0] as Record<string, unknown> | undefined;
  const grid = sheet?.data as unknown[] | undefined;
  const firstGrid = (Array.isArray(grid) ? grid[0] : undefined) as Record<string, unknown> | undefined;
  const mergeRanges = (Array.isArray(sheet?.merges) ? sheet.merges : []) as SheetApiGridRange[];
  const gridStartRow = typeof firstGrid?.startRow === "number" ? firstGrid.startRow : 0;
  const gridStartCol = typeof firstGrid?.startColumn === "number" ? firstGrid.startColumn : 0;
  const parsed = parseGridDataToTable(firstGrid, maxRows, maxCols);
  return { parsed, mergeRanges, gridStartRow, gridStartCol };
}
