import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { readStoredRefreshToken } from "@/lib/google-sheets-token-store";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function sheetsScope(): string {
  return SHEETS_SCOPE;
}

export async function googleSheetsEnvReady(): Promise<{
  clientId: boolean;
  clientSecret: boolean;
  refreshToken: boolean;
}> {
  const fromEnv = Boolean(process.env.GOOGLE_REFRESH_TOKEN?.trim());
  const fromFile = Boolean((await readStoredRefreshToken())?.trim());
  return {
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    refreshToken: fromEnv || fromFile,
  };
}

async function resolveRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readStoredRefreshToken();
}

export function isGoogleOAuthInvalidGrantError(e: unknown): boolean {
  const any = e as {
    response?: { data?: { error?: string; error_description?: string } };
    message?: string;
  };
  if (any?.response?.data?.error === "invalid_grant") return true;
  const msg =
    e instanceof Error
      ? e.message
      : typeof any?.message === "string"
        ? any.message
        : String(e);
  return /invalid_grant/i.test(msg);
}

export function createOAuth2Client(redirectUri: string): OAuth2Client | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret || !redirectUri) return null;
  return new OAuth2Client(id, secret, redirectUri);
}

export async function getSheetsClient() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = await resolveRefreshToken();
  if (!id || !secret) {
    throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  if (!refreshToken) {
    throw new Error(
      "No Google refresh token yet. Open Connect Google in the workspace (or /api/google-sheets/auth) and approve access."
    );
  }
  const oauth2 = new OAuth2Client(id, secret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: "v4", auth: oauth2 });
}
