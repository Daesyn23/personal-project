import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/google-sheets-server";
import { fetchSpreadsheetRangeWithFormatting } from "@/lib/google-sheets-fetch-grid";
import { finalizeParsedGrid } from "@/lib/google-sheets-grid-parse";
import { localizeSheetMerges } from "@/lib/sheet-merge-localize";
import { resolveSheetsValuesRange } from "@/lib/google-sheets-resolve-range";
import { spreadsheetIdLooksIncomplete } from "@/lib/sheets-a1";

export const runtime = "nodejs";

const DEFAULT_RANGE = "Sheet1!A1:Z200";
const MAX_ROWS = 400;
const MAX_COLS = 52;

function parseGidParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const spreadsheetId = searchParams.get("spreadsheetId")?.trim();
    const rangeInput = searchParams.get("range")?.trim() || DEFAULT_RANGE;
    const gid = parseGidParam(searchParams.get("gid"));
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Missing spreadsheetId query parameter." },
        { status: 400 }
      );
    }
    if (spreadsheetIdLooksIncomplete(spreadsheetId)) {
      return NextResponse.json(
        {
          error:
            "Spreadsheet ID looks too short. Copy the full browser URL (the ID is usually ~44 characters after /d/).",
        },
        { status: 400 }
      );
    }

    const range = await resolveSheetsValuesRange({
      spreadsheetId,
      rangeInput,
      gid,
    });

    const includeFormat = searchParams.get("includeFormat") !== "false";

    if (includeFormat) {
      try {
        const fetched = await fetchSpreadsheetRangeWithFormatting(
          spreadsheetId,
          range,
          MAX_ROWS,
          MAX_COLS
        );
        const finalized = finalizeParsedGrid(fetched.parsed, MAX_ROWS, MAX_COLS);
        const rows = finalized.values.length;
        const cols = rows ? finalized.values[0].length : 0;
        const merges = localizeSheetMerges(
          fetched.mergeRanges,
          fetched.gridStartRow,
          fetched.gridStartCol,
          rows,
          cols
        );
        return NextResponse.json({
          values: finalized.values,
          cells: finalized.cells,
          merges,
          range,
          majorDimension: "ROWS" as const,
          includeFormat: true,
        });
      } catch (gridErr) {
        console.error("Grid + formatting fetch failed, falling back to values only:", gridErr);
        const sheets = await getSheetsClient();
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });
        const raw = res.data.values ?? [];
        const capped = raw.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLS));
        return NextResponse.json({
          values: capped,
          range: res.data.range ?? range,
          majorDimension: res.data.majorDimension ?? "ROWS",
          includeFormat: false,
          formatFallback: true,
          formatError:
            gridErr instanceof Error ? gridErr.message : "Could not load cell formatting.",
        });
      }
    }

    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return NextResponse.json({
      values: res.data.values ?? [],
      range: res.data.range ?? range,
      majorDimension: res.data.majorDimension ?? "ROWS",
      includeFormat: false,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Failed to read sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PostBody = {
  spreadsheetId?: string;
  range?: string;
  values?: string[][];
  gid?: number | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody;
    const spreadsheetId = body.spreadsheetId?.trim();
    const rangeInput = body.range?.trim() || DEFAULT_RANGE;
    const gid =
      body.gid === undefined || body.gid === null
        ? null
        : typeof body.gid === "number" && Number.isFinite(body.gid)
          ? body.gid
          : parseGidParam(String(body.gid));
    const values = body.values;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Missing spreadsheetId in body." },
        { status: 400 }
      );
    }
    if (spreadsheetIdLooksIncomplete(spreadsheetId)) {
      return NextResponse.json(
        {
          error:
            "Spreadsheet ID looks too short. Copy the full browser URL (the ID is usually ~44 characters after /d/).",
        },
        { status: 400 }
      );
    }
    if (!Array.isArray(values)) {
      return NextResponse.json(
        { error: "Missing values array in body." },
        { status: 400 }
      );
    }

    const range = await resolveSheetsValuesRange({
      spreadsheetId,
      rangeInput,
      gid,
    });

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Failed to update sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
