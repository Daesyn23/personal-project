import { toRomaji } from "wanakana";

const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const KANA_RUN_RE = /[\u3040-\u30FF\uFF66-\uFF9Fー]+/gu;
const SMALL_KANA_RE = /^[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮヵヶ]$/u;
const SOKUON_RE = /^[っッｯ]$/u;

function kanaRuns(text: string): string[] {
  return text.match(KANA_RUN_RE) ?? [];
}

function moraeForRun(run: string): string[] {
  const morae: string[] = [];
  let pendingSokuon = "";

  for (const char of Array.from(run)) {
    if (char === "・") continue;
    if (SOKUON_RE.test(char)) {
      pendingSokuon += char;
      continue;
    }
    if ((SMALL_KANA_RE.test(char) || char === "ー") && morae.length > 0 && !pendingSokuon) {
      morae[morae.length - 1] += char;
      continue;
    }
    morae.push(`${pendingSokuon}${char}`);
    pendingSokuon = "";
  }

  if (pendingSokuon) morae.push(pendingSokuon);
  return morae;
}

function collapseMinnaEndings(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const three = tokens.slice(i, i + 3).join("");
    const two = tokens.slice(i, i + 2).join("");
    if (three === "mashita" || three === "masen") {
      out.push(three);
      i += 2;
    } else if (two === "masu" || two === "nai") {
      out.push(two);
      i += 1;
    } else if (tokens[i] === "u" && out.at(-1)?.endsWith("o")) {
      out[out.length - 1] += "u";
    } else {
      out.push(tokens[i]!);
    }
  }
  return out;
}

/** Deterministic lowercase, ASCII, mora-spaced romaji derived from kana. */
export function minnaSpacedRomaji(kana: string): string | null {
  if (!kana.trim() || KANJI_RE.test(kana)) return null;
  const tokens = kanaRuns(kana).flatMap((run) =>
    moraeForRun(run)
      .map((mora) => (mora === "を" || mora === "ヲ" ? "o" : toRomaji(mora).toLowerCase()))
      .filter((token) => /^[a-z']+$/u.test(token))
  );
  if (!tokens.length) return null;
  return collapseMinnaEndings(tokens).join(" ");
}

function compactRomaji(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

function cleanGeneratedRomaji(text: string): string | null {
  const clean = text
    .toLowerCase()
    .replace(/[‐‑‒–—-]+/g, " ")
    .replace(/[^a-z'\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || null;
}

/**
 * Keep the model's Minna-style spacing only when its letters exactly match a
 * deterministic kana romanization. Otherwise replace it with the safe value.
 */
export function validateGeneratedMinnaRomaji(
  kana: string,
  generated: string | null | undefined
): string | null {
  const safe = minnaSpacedRomaji(kana);
  const cleaned = cleanGeneratedRomaji(generated ?? "");
  if (!safe) return cleaned;
  if (cleaned && compactRomaji(cleaned) === compactRomaji(safe)) return cleaned;
  return safe;
}

/** Whether an existing romaji value spells the supplied kana correctly. */
export function romajiMatchesKana(kana: string, romaji: string | null | undefined): boolean {
  const safe = minnaSpacedRomaji(kana);
  if (!safe) return true;
  const cleaned = cleanGeneratedRomaji(romaji ?? "");
  return Boolean(cleaned && compactRomaji(cleaned) === compactRomaji(safe));
}
