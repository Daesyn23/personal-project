"use client";

import { useEffect, useId, useState } from "react";
import { kanjiPartLabel, kanjiShapeUrl, type KanjiShape } from "@/lib/kanji-shape";

const cache = new Map<string, KanjiShape>();
const colors = ["#be185d", "#0369a1", "#15803d", "#a16207", "#7c3aed", "#0f766e"];

export function KanjiShapeGuide({ character }: { character: string }) {
  const [shape, setShape] = useState<KanjiShape | null>(() => cache.get(character) ?? null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setSelected(null);
    setFailed(false);
    const cached = cache.get(character);
    setShape(cached ?? null);
    if (!cached) {
      fetch(kanjiShapeUrl(character), { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error("Drawing unavailable"); return response.json() as Promise<KanjiShape>; })
        .then(data => {
          if (data.character !== character || !data.paths.length || !data.parts.length) throw new Error("Incomplete drawing");
          cache.set(character, data);
          if (active) setShape(data);
        })
        .catch(() => { if (active && !controller.signal.aborted) setFailed(true); });
    }
    return () => { active = false; controller.abort(); };
  }, [character]);

  return (
    <figure className="min-w-0 rounded-xl border border-amber-100 bg-white/90 p-3 sm:p-4" aria-label={`Shape guide for ${character}`}>
      <div className="mx-auto flex min-h-36 max-w-44 items-center justify-center">
        {shape ? <svg viewBox="0 0 109 109" className="aspect-square w-36 sm:w-40" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>{character} — {selected === null ? "whole kanji" : kanjiPartLabel(shape.parts[selected], selected)}</title>
          <desc id={`${id}-description`}>{selected === null ? "Actual kanji strokes, colored by their visual groups." : "The selected part is highlighted in its original position; other strokes are faint."}</desc>
          <path d="M54.5 4V105M4 54.5H105" fill="none" stroke="#e7e5e4" strokeWidth="0.6" strokeDasharray="2 3" />
          <g fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            {shape.paths.map((path, index) => {
              const group = shape.parts.findIndex(part => part.strokes.includes(index));
              return <path key={index} d={path} stroke={selected === null || selected === group ? colors[group % colors.length] : "#e7e5e4"} />;
            })}
          </g>
        </svg> : <span lang="ja" className="font-serif text-7xl text-pink-700">{character}</span>}
      </div>
      {shape && shape.parts.length > 1 ? <>
        <figcaption className="mb-2 text-center text-xs leading-5 text-neutral-600">Tap a part to see it in the kanji.</figcaption>
        <div className="flex flex-wrap justify-center gap-1.5" aria-label="Kanji parts">
          <button type="button" onClick={() => setSelected(null)} aria-pressed={selected === null} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold ${selected === null ? "border-neutral-700 bg-neutral-800 text-white" : "border-neutral-200 bg-white text-neutral-600"}`}>Whole</button>
          {shape.parts.map((part, index) => <button key={index} type="button" onClick={() => setSelected(selected === index ? null : index)} aria-pressed={selected === index} aria-label={`Focus on ${kanjiPartLabel(part, index)}`} className={`flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${selected === index ? "border-neutral-600 bg-amber-50 ring-1 ring-neutral-600" : "border-neutral-200 bg-white"}`}>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <span>{kanjiPartLabel(part, index)}</span>
          </button>)}
        </div>
      </> : <figcaption className="text-center text-xs leading-5 text-neutral-600" role={!shape ? "status" : undefined}>
        {shape ? "Follow the whole shape as you picture the story." : failed ? "Drawing unavailable. The lesson's stroke guide is below." : "Loading stroke drawing…"}
      </figcaption>}
      <p className="mt-3 text-center text-[10px] leading-5 text-neutral-400">Drawings: <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer" className="underline">KanjiVG</a> · <a href="/learning/kanji/shapes/NOTICE.txt" target="_blank" rel="noreferrer" className="underline">CC BY-SA 3.0</a></p>
    </figure>
  );
}
