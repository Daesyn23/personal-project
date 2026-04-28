import { promises as fs } from "fs";
import path from "path";

const TOKEN_FILE = path.join(process.cwd(), "data", "google-sheets-refresh-token");

export async function readStoredRefreshToken(): Promise<string | null> {
  try {
    const raw = (await fs.readFile(TOKEN_FILE, "utf8")).trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Persists refresh token on disk (local dev). Returns false if the filesystem is not writable. */
export async function writeStoredRefreshToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  try {
    await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
    await fs.writeFile(TOKEN_FILE, trimmed, { encoding: "utf8", mode: 0o600 });
    return true;
  } catch (e) {
    console.error("google-sheets-token-store: failed to write refresh token", e);
    return false;
  }
}
