import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/google-sheets-server";
import { spreadsheetIdLooksIncomplete } from "@/lib/sheets-a1";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const spreadsheetId = new URL(req.url).searchParams.get("spreadsheetId")?.trim();
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }
    if (spreadsheetIdLooksIncomplete(spreadsheetId)) {
      return NextResponse.json(
        { error: "Spreadsheet ID looks too short. Paste the full URL from the browser." },
        { status: 400 }
      );
    }

    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title,index))",
    });

    const list = (meta.data.sheets ?? [])
      .map((s) => ({
        sheetId: s.properties?.sheetId ?? -1,
        title: s.properties?.title ?? "Untitled",
        index: s.properties?.index ?? 0,
      }))
      .filter((s) => s.sheetId >= 0)
      .sort((a, b) => a.index - b.index);

    return NextResponse.json({ sheets: list });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list sheets" },
      { status: 500 }
    );
  }
}
