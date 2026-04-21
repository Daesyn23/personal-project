import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function sheetsScope(): string {
  return SHEETS_SCOPE;
}

export function googleSheetsEnvReady(): {
  clientId: boolean;
  clientSecret: boolean;
  refreshToken: boolean;
} {
  return {
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    refreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN?.trim()),
  };
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
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!id || !secret) {
    throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  if (!refreshToken) {
    throw new Error("Set GOOGLE_REFRESH_TOKEN after completing OAuth (see /api/google-sheets/auth).");
  }
  const oauth2 = new OAuth2Client(id, secret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: "v4", auth: oauth2 });
}
