import { PDFParse } from "pdf-parse";
import { NextResponse } from "next/server";
import {
  extractLessonVocabularyFromPdfText,
  scoreLessonVocabularyRows,
} from "@/lib/parse-mnn-vocabulary";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buf });

    let tableResult = null;
    try {
      tableResult = await parser.getTable();
    } catch {
      tableResult = null;
    }

    const textResult = await parser.getText({
      cellSeparator: "\t",
      cellThreshold: 3,
      lineEnforce: true,
      lineThreshold: 4,
    });

    await parser.destroy();

    let text = textResult.text ?? "";

    let vocabulary = extractLessonVocabularyFromPdfText(text, tableResult);

    // Second pass: wider column gaps often match grid PDFs (e.g. Minna vocabulary tables)
    const lowKana =
      vocabulary.filter((r) => r.kana && r.kana.length > 1).length < 4;
    if (lowKana) {
      const parser2 = new PDFParse({ data: buf });
      try {
        const alt = await parser2.getText({
          cellSeparator: "\t",
          cellThreshold: 10,
          lineEnforce: true,
          lineThreshold: 5,
        });
        const altText = alt.text ?? "";
        const altVocab = extractLessonVocabularyFromPdfText(altText, null);
        if (scoreLessonVocabularyRows(altVocab) > scoreLessonVocabularyRows(vocabulary)) {
          text = altText;
          vocabulary = altVocab;
        }
      } catch {
        /* ignore second-pass failure */
      } finally {
        await parser2.destroy().catch(() => {});
      }
    }

    return NextResponse.json({ text, vocabulary });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF parse failed" },
      { status: 500 }
    );
  }
}

