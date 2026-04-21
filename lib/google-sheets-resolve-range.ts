import { getSheetsClient } from "@/lib/google-sheets-server";
import { normalizeSheetsA1Range, quoteSheetTitleForA1 } from "@/lib/sheets-a1";

const DEFAULT_RANGE = "Sheet1!A1:Z200";

/**
 * Builds the `range` string for spreadsheets.values.get/update.
 * If `gid` is set and the user range has no `!` (no sheet name), resolves the real tab title via the API.
 */
export async function resolveSheetsValuesRange(options: {
  spreadsheetId: string;
  rangeInput: string;
  gid: number | null;
}): Promise<string> {
  const raw = options.rangeInput.trim() || DEFAULT_RANGE;
  const normalized = normalizeSheetsA1Range(raw);

  if (normalized.includes("!")) {
    return normalized;
  }

  const gid = options.gid;
  if (gid != null && Number.isFinite(gid)) {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: options.spreadsheetId,
      fields: "sheets(properties(sheetId,title))",
    });
    const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === gid);
    const title = sheet?.properties?.title;
    if (!title) {
      throw new Error(
        `No tab found for gid ${gid}. Open the spreadsheet, select the tab you want, copy the URL again (it must include gid=…), and paste it above.`
      );
    }
    return `${quoteSheetTitleForA1(title)}!${normalized}`;
  }

  // Bare ranges like "A1:AA200" without a sheet name target the *first* tab in the file (often "Student Information").
  throw new Error(
    "Without a tab in the range, Google uses the first sheet. Paste the full browser URL while the correct tab is open (it must include gid=…), with range like A1:AA200. Or use an explicit tab name, e.g. 'Quiz new'!A1:AA200."
  );
}
