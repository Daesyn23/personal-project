/** Import the supplied lesson PDFs. Run: node scripts/import-kanji-materials.mjs /path/to/folder */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, readdir, readFile, writeFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error("Pass the folder containing the compiled list and lessons 0–40.");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/learning/kanji");
const run = promisify(execFile);
const compiledName = "a. Kanji Lesson 0-40 - Kanji List.pdf";

async function extract(file) {
  const pdf = await getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: true, verbosity: 0 }).promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      pages.push({ number, items: text.items.filter(i => i.str?.trim()).map(i => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5], width: i.width, height: i.height })) });
    }
    return pages;
  } finally { await pdf.destroy(); }
}

function join(items, japanese = false) {
  items = items.map(item => {
    if (!japanese && /^(st|nd|rd|th)$/.test(item.text)) {
      const number = items.find(candidate => /^\d+$/.test(candidate.text) && Math.abs(candidate.x + candidate.width - item.x) < 2 && Math.abs(candidate.y - item.y) < 16);
      if (number) return { ...item, y: number.y };
    }
    return item;
  });
  const lines = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines.find(line => Math.abs(line.y - item.y) < 4);
    if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.map(line => {
    const sorted = line.items.sort((a, b) => a.x - b.x);
    return sorted.map((item, i) => {
      const previous = sorted[i - 1];
      const space = !japanese && previous && item.x - previous.x - previous.width > 1.5;
      return `${space ? " " : ""}${item.text}`;
    }).join("");
  }).join(japanese ? "" : " ").replace(/\s+([,.;:)])/g, "$1").trim();
}

await mkdir(output, { recursive: true });
const index = await extract(path.join(source, compiledName));
const lessons = [];
for (const page of index) {
  const characters = page.items.filter(i => /^\p{Script=Han}$/u.test(i.text) && i.height > 18).sort((a, b) => Math.abs(a.y - b.y) < 3 ? a.x - b.x : b.y - a.y);
  if (characters.length % 16) throw new Error(`Incomplete grid on page ${page.number}`);
  for (let offset = 0; offset < characters.length; offset += 16) {
    const row = characters.slice(offset, offset + 16);
    const nextY = characters[offset + 16]?.y ?? 0;
    const glosses = page.items.filter(i => i.height < 10 && i.y < row[0].y && i.y > nextY + 21);
    lessons.push({ number: lessons.length, entries: row.map((character, column) => {
      const gloss = glosses.filter(item => {
        const center = item.x + item.width / 2;
        const nearest = row.reduce((best, candidate, j) => Math.abs(center - candidate.x - candidate.width / 2) < Math.abs(center - row[best].x - row[best].width / 2) ? j : best, 0);
        return nearest === column;
      });
      return { id: `${lessons.length}-${column}`, character: character.text, meaning: join(gloss).toLowerCase(), lessonMeaning: "", kunyomi: "", onyomi: "", vocabulary: [], pages: [] };
    }) });
  }
}
if (lessons.length !== 41) throw new Error(`Expected 41 lessons, found ${lessons.length}`);
await copyFile(path.join(source, compiledName), path.join(output, "compiled-list.pdf"));
const files = await readdir(source);
let pageCount = 0;
for (const lesson of lessons) {
  const filename = files.find(file => new RegExp(`^Kanji Lesson ${lesson.number} Vocabs? [Ll]ist\\.pdf$`).test(file));
  if (!filename) throw new Error(`Missing lesson ${lesson.number}`);
  const input = path.join(source, filename);
  const pages = await extract(input);
  const directory = path.join(output, `lesson-${lesson.number}`);
  await mkdir(directory, { recursive: true });
  lesson.pdf = `/learning/kanji/lesson-${lesson.number}/lesson.pdf`;
  lesson.sourceName = filename;
  await copyFile(input, path.join(directory, "lesson.pdf"));
  const scratch = await mkdtemp(path.join(tmpdir(), "kanji-render-"));
  try {
    // Render once at a readable resolution; full pages preserve all source details.
    await run("pdftoppm", ["-f", "2", "-scale-to", "1600", "-png", input, path.join(scratch, "page")], { maxBuffer: 4 * 1024 * 1024 });
    const rendered = await readdir(scratch);
    for (const page of pages.slice(1)) {
      const character = page.items.find(i => i.x < 110 && i.y > 430 && i.height > 70)?.text;
      const entry = lesson.entries.find(e => e.character === character);
      if (!entry) throw new Error(`Unmapped lesson ${lesson.number}, page ${page.number}: ${character}`);
      const readings = page.items.filter(i => i.y > 420 && i.y < 480 && i.x >= 300);
      const kun = join(readings.filter(i => i.x + i.width / 2 < 640), true);
      const on = join(readings.filter(i => i.x + i.width / 2 >= 640), true);
      if (!entry.pages.length) {
        entry.kunyomi = kun;
        entry.onyomi = on;
        entry.lessonMeaning = join(page.items.filter(i => i.y > 420 && i.x >= 110 && i.x < 300));
      }
      const rows = new Map();
      for (const item of page.items.filter(i => i.y < 355)) {
        const row = Math.floor(item.y / 60);
        if (!rows.has(row)) rows.set(row, [[], [], []]);
        // Use token centers: long readings can start slightly left of their column.
        const center = item.x + item.width / 2;
        rows.get(row)[center < 310 ? 0 : center < 640 ? 1 : 2].push(item);
      }
      const vocabulary = [];
      for (const [, columns] of [...rows].sort((a, b) => b[0] - a[0])) {
        if (columns.flat().some(i => /Kanji|Reading|Meaning/.test(i.text))) continue;
        const [word, reading, meaning] = columns.map((items, i) => join(items, i !== 2));
        if (!word && !reading && !meaning) continue;
        // Wrapped definitions can spill below the nominal row boundary.
        if (!word && !reading && meaning && vocabulary.length) {
          vocabulary[vocabulary.length - 1].meaning += ` ${meaning}`;
        } else {
          vocabulary.push({ word, reading, meaning, page: page.number });
        }
      }
      if (vocabulary.some(row => !row.word || !row.reading || !row.meaning)) throw new Error(`Incomplete vocabulary: lesson ${lesson.number}, page ${page.number}`);
      entry.vocabulary.push(...vocabulary);
      const raster = rendered.find(f => Number(f.match(/page-(\d+)\.png$/)?.[1]) === page.number);
      if (!raster) throw new Error(`Missing image for lesson ${lesson.number} page ${page.number}`);
      const bytes = await readFile(path.join(scratch, raster));
      const imagePath = `/learning/kanji/lesson-${lesson.number}/page-${page.number}.webp`;
      await sharp(bytes).webp({ quality: 85 }).toFile(path.join(root, "public", imagePath));
      if (!entry.pages.length) {
        // All supplied lessons use a 960×540 page; stroke strip occupies y=120–180 from top.
        const metadata = await sharp(bytes).metadata();
        const scale = metadata.width / 960;
        const strokePath = `/learning/kanji/lesson-${lesson.number}/strokes-${entry.character}.webp`;
        await sharp(bytes).extract({ left: 0, top: Math.round(120 * scale), width: metadata.width, height: Math.round(60 * scale) }).webp({ quality: 90 }).toFile(path.join(root, "public", strokePath));
        entry.strokeImage = strokePath;
      }
      entry.pages.push({ number: page.number, image: imagePath });
      pageCount++;
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
  for (const entry of lesson.entries) {
    if (!entry.meaning || !entry.pages.length || !entry.vocabulary.length) throw new Error(`Incomplete entry: ${lesson.number} ${entry.character}`);
  }
  console.log(`Lesson ${lesson.number}: ${lesson.entries.length} kanji, ${pages.length - 1} detail pages`);
}
await mkdir(path.join(root, "data"), { recursive: true });
await writeFile(path.join(root, "data/kanji-lessons.json"), JSON.stringify({ compiledPdf: "/learning/kanji/compiled-list.pdf", lessons }, null, 2) + "\n");
console.log(`Imported ${lessons.length} lessons, ${lessons.flatMap(l => l.entries).length} kanji and ${pageCount} detail pages.`);
