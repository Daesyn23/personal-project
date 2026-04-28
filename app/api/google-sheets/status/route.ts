import { NextResponse } from "next/server";
import { googleSheetsEnvReady } from "@/lib/google-sheets-server";

export const runtime = "nodejs";

export async function GET() {
  const e = await googleSheetsEnvReady();
  const canQuery = e.clientId && e.clientSecret && e.refreshToken;
  return NextResponse.json({
    oauthClientConfigured: e.clientId && e.clientSecret,
    refreshTokenSet: e.refreshToken,
    canQuery,
  });
}
