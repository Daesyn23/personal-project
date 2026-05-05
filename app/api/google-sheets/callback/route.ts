import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client } from "@/lib/google-sheets-server";
import { writeRefreshTokenToSupabase } from "@/lib/google-sheets-token-supabase";
import { writeStoredRefreshToken } from "@/lib/google-sheets-token-store";

export const runtime = "nodejs";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function couldNotSaveTokenHtml(refreshToken: string, opts: { origin: string; vercel: boolean }): string {
  const tokenDisplay = escapeHtml(refreshToken);
  const vercelGuide = opts.vercel
    ? `
<h2 style="margin-top:1.75rem;font-size:1.05rem">Deployed app (Vercel / read-only server)</h2>
<ol>
<li>Open the Vercel dashboard → your project → <strong>Settings → Environment Variables</strong>.</li>
<li>Add <code>GOOGLE_REFRESH_TOKEN</code>, paste the <strong>whole</strong> token string as the value.</li>
<li>Select environments (Production / Preview), save, then <strong>Redeploy</strong> the latest deployment.</li>
<li>Reload the site. You <strong>do not</strong> need to authorize Google again — the refresh token is enough.</li>
</ol>`
    : "";

  const localGuide = `
<h2 style="margin-top:1.75rem;font-size:1.05rem">Local project</h2>
<ol>
<li>In the <strong>same folder as <code>package.json</code></strong>, create or edit <code>.env.local</code>.</li>
<li>Paste this entire line (one line, no line breaks in the token):</li>
</ol>`;

  const supabaseGuide = `
<h2 style="margin-top:1.75rem;font-size:1.05rem">Prefer not to use <code>GOOGLE_REFRESH_TOKEN</code>? (Supabase)</h2>
<p>If the app already has <code>NEXT_PUBLIC_SUPABASE_URL</code>:</p>
<ol>
<li>In Supabase SQL Editor, run the migration that creates <code>workspace_google_sheets_oauth</code> (see repo <code>supabase/migrations/</code>).</li>
<li>Add <strong><code>SUPABASE_SERVICE_ROLE_KEY</code></strong> to server env only (e.g. Vercel → Environment Variables or <code>.env.local</code>). Never expose it or commit it.</li>
<li>Redeploy / restart dev, then click <strong>Connect Google</strong> again — the refresh token will be saved in the database automatically (no pasted token).</li>
</ol>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Google Sheets — save refresh token</title><style>body{font-family:system-ui,sans-serif;padding:1.5rem;max-width:42rem;margin:0 auto;line-height:1.55;color:#18181b}a{color:#be185d}code,pre{background:#f4f4f5;padding:.15rem .35rem;border-radius:4px;font-size:12px;word-break:break-all}pre{padding:.85rem;white-space:pre-wrap;border:1px solid #e4e4e7;margin:.5rem 0}.warn{background:#fef3c7;border:1px solid #fcd34d;padding:.75rem;border-radius:8px;margin:1rem 0;font-size:14px}button{margin-top:.5rem;padding:.55rem 1rem;cursor:pointer;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa;font-size:14px}</style></head><body>
<h1>Almost done — save this token on the server</h1>
<p>The app could not write <code>data/google-sheets-refresh-token</code> on this machine (read-only disk, permissions, or a cloud host). Use <strong>Supabase storage</strong> (recommended if you use Supabase), put the token in env, or see below.</p>
<div class="warn"><strong>Security:</strong> Treat this like a password. Do not commit it to git or post it publicly. If it leaked, revoke access at <a href="https://myaccount.google.com/permissions">Google Account → Third-party access</a> and connect again.</div>
${supabaseGuide}
${opts.vercel ? vercelGuide : localGuide}
<pre id="t">GOOGLE_REFRESH_TOKEN=${tokenDisplay}</pre>
<p><button type="button" id="b">Copy env line</button></p>
${opts.vercel ? "" : `<p>Then <strong>stop</strong> the dev server (Ctrl+C), run <code>npm run dev</code> again, open <a href="${escapeHtml(opts.origin)}">${escapeHtml(opts.origin)}</a> → Google Sheet tab. No second OAuth needed.</p>`}
<p style="margin-top:1.5rem"><a href="${escapeHtml(opts.origin)}">← Back to workspace</a></p>
<script>document.getElementById("b").onclick=function(){navigator.clipboard.writeText(document.getElementById("t").textContent);this.textContent="Copied";};</script>
</body></html>`;
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

    const saved =
      (await writeStoredRefreshToken(refresh)) || (await writeRefreshTokenToSupabase(refresh));
    if (saved) {
      const next = new URL("/", req.url);
      next.searchParams.set("google_sheets_connected", "1");
      return NextResponse.redirect(next);
    }

    const origin = new URL(req.url).origin;
    const html = couldNotSaveTokenHtml(refresh, {
      origin,
      vercel: Boolean(process.env.VERCEL),
    });
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui;padding:2rem"><h1>Error</h1><p>${escapeHtml(msg)}</p><p><a href="/">Back</a></p></body></html>`,
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}
