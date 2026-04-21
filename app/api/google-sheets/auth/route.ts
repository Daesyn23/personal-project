import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, sheetsScope } from "@/lib/google-sheets-server";

export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  const url = new URL(req.url);
  const redirectUri =
    configured || `${url.origin}/api/google-sheets/callback`;

  const client = createOAuth2Client(redirectUri);
  if (!client) {
    return NextResponse.json(
      {
        error:
          "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Add them to .env.local.",
      },
      { status: 500 }
    );
  }

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [sheetsScope()],
    redirect_uri: redirectUri,
  });

  return NextResponse.redirect(authUrl);
}
