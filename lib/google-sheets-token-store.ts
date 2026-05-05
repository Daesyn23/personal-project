import { promises as fs } from "fs";
import os from "os";
import path from "path";

const TOKEN_FILE = path.join(process.cwd(), "data", "google-sheets-refresh-token");

/** Fallback when the project directory is not writable (some sandboxes); skipped on Vercel — /tmp is ephemeral across instances. */
function tokenFileFallback(): string {
  return path.join(os.tmpdir(), "flashcard-presentation-google-sheets-refresh.token");
}

function readPathsInOrder(): string[] {
  const primary = TOKEN_FILE;
  const fallback = tokenFileFallback();
  if (process.env.VERCEL) return [primary];
  return [primary, fallback];
}

export async function readStoredRefreshToken(): Promise<string | null> {
  for (const file of readPathsInOrder()) {
    try {
      const raw = (await fs.readFile(file, "utf8")).trim();
      if (raw.length > 0) return raw;
    } catch {
      continue;
    }
  }
  return null;
}

/** Persists refresh token on disk (local dev). Returns false if the filesystem is not writable. */
export async function writeStoredRefreshToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;

  const targets = process.env.VERCEL ? [TOKEN_FILE] : [TOKEN_FILE, tokenFileFallback()];

  for (const target of targets) {
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, trimmed, { encoding: "utf8", mode: 0o600 });
      return true;
    } catch (e) {
      console.error("google-sheets-token-store: failed to write refresh token to", target, e);
    }
  }
  return false;
}
