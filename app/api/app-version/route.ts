import { NextResponse } from "next/server";
import { getAppBuildId } from "@/lib/app-version";

export const runtime = "nodejs";

/** Current deployment build id — polled by the client to detect new releases. */
export async function GET() {
  return NextResponse.json(
    { buildId: getAppBuildId() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
