import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client } from "@/lib/google-sheets-server";

export const runtime = "nodejs";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (err) {
    const msg = url.searchParams.get("error_description") || err;
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Google Sheets</title></head><body style="font-family:system-ui;padding:2rem;max-width:40rem"><h1>Authorization failed</h1><p>${escapeHtml(msg)}</p><p><a href="/">Back to workspace</a></p></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Google Sheets</title></head><body style="font-family:system-ui;padding:2rem"><p>Missing code.</p><p><a href="/">Back</a></p></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 }
    );
  }

  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  const redirectUri =
    configured || `${url.origin}/api/google-sheets/callback`;

  const client = createOAuth2Client(redirectUri);
  if (!client) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><p>OAuth client not configured.</p></body></html>`,
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const { tokens } = await client.getToken({
      code,
      redirect_uri: redirectUri,
    });
    const refresh = tokens.refresh_token;
    if (!refresh) {
      return new NextResponse(
        `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Google Sheets</title></head><body style="font-family:system-ui;padding:2rem;max-width:42rem;line-height:1.5"><h1>No refresh token</h1><p>Google did not return a refresh token. Revoke the app at <a href="https://myaccount.google.com/permissions">Google Account permissions</a>, then try <strong>Connect Google</strong> again.</p><p><a href="/">Back to workspace</a></p></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    const tokenDisplay = escapeHtml(refresh);
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Google Sheets — copy token</title><style>body{font-family:system-ui;padding:2rem;max-width:46rem;line-height:1.5}code,pre{background:#f4f4f5;padding:.2rem .4rem;border-radius:4px;font-size:13px;word-break:break-all}pre{padding:1rem;white-space:pre-wrap}button{margin-top:.75rem;padding:.5rem 1rem;cursor:pointer;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa}</style></head><body><h1>Copy refresh token</h1><p>Add this to <strong>.env.local</strong> (server only, never commit):</p><pre id="t">GOOGLE_REFRESH_TOKEN=${tokenDisplay}</pre><p><button type="button" id="b">Copy line</button></p><p>Restart <code>npm run dev</code>, then open the <strong>Google Sheet</strong> tab in My Workspace.</p><p><a href="/">Back to workspace</a></p><script>document.getElementById("b").onclick=function(){navigator.clipboard.writeText(document.getElementById("t").textContent);this.textContent="Copied";};</script></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui;padding:2rem"><h1>Error</h1><p>${escapeHtml(msg)}</p><p><a href="/">Back</a></p></body></html>`,
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}
