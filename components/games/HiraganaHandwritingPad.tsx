"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type Point = { x: number; y: number };
export type HandwritingDrawing = { strokes: Point[][]; rows: number };
export const emptyHandwriting = (): HandwritingDrawing => ({ strokes: [], rows: 2 });
const WIDTH = 960;
const ROW = 320;
const control = "min-h-11 rounded-lg border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-pink-700 disabled:opacity-40";

function paintStroke(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  ctx.strokeStyle = ctx.fillStyle = "#292524";
  ctx.lineWidth = 9;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
}

export function HiraganaHandwritingPad({ drawing, onChange, busy, onDone }: {
  drawing: HandwritingDrawing;
  onChange: (drawing: HandwritingDrawing) => void;
  busy: boolean;
  onDone: (image: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ id: number; points: Point[] } | null>(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, drawing.rows * ROW);
    for (const stroke of drawing.strokes) paintStroke(ctx, stroke);
  }, [drawing]);

  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(5, Math.min(WIDTH - 5, (event.clientX - rect.left) * WIDTH / rect.width)),
      y: Math.max(5, Math.min(drawing.rows * ROW - 5, (event.clientY - rect.top) * drawing.rows * ROW / rect.height)),
    };
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    if (!stroke || stroke.id !== event.pointerId) return;
    active.current = null;
    setWriting(false);
    onChange({ ...drawing, strokes: [...drawing.strokes, stroke.points] });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function submit() {
    if (!canvas.current || busy || writing || !drawing.strokes.length) return;
    // Export ink on white only. The CSS guides, kanji prompt and answers are never sent.
    const image = document.createElement("canvas");
    image.width = WIDTH; image.height = drawing.rows * ROW;
    const ctx = image.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.drawImage(canvas.current, 0, 0);
    onDone(image.toDataURL("image/png"));
  }

  return <div className="space-y-3" aria-busy={busy}>
    <p id="handwriting-help" className="text-xs leading-5 text-neutral-500">Write hiragana with your finger, left to right. Continue on the next row.</p>
    <div className="relative overflow-hidden rounded-2xl border-2 border-pink-200 bg-white">
      <canvas ref={canvas} width={WIDTH} height={drawing.rows * ROW} role="img" aria-label="Hiragana finger-writing pad" aria-describedby="handwriting-help" className="block w-full touch-none select-none" style={{
        backgroundImage: "linear-gradient(to right, #fce7f3 1px, transparent 1px), linear-gradient(to bottom, #fce7f3 1px, transparent 1px)",
        backgroundSize: `33.333333% ${100 / drawing.rows}%`,
      }} onPointerDown={event => {
        if (busy || active.current || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const first = point(event);
        active.current = { id: event.pointerId, points: [first] };
        setWriting(true);
        const ctx = event.currentTarget.getContext("2d");
        if (ctx) paintStroke(ctx, [first]);
      }} onPointerMove={event => {
        const stroke = active.current;
        if (!stroke || stroke.id !== event.pointerId) return;
        event.preventDefault();
        const current = point(event);
        const previous = stroke.points[stroke.points.length - 1];
        stroke.points.push(current);
        const ctx = event.currentTarget.getContext("2d");
        if (ctx) paintStroke(ctx, [previous, current]);
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
        Use Type mode if a drawing pad is unavailable.
      </canvas>
      {!drawing.strokes.length && !writing && <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-pink-400">Write your answer here</span>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || writing || !drawing.strokes.length} onClick={() => onChange({ ...drawing, strokes: drawing.strokes.slice(0, -1) })} className={control}>Undo stroke</button>
      <button type="button" disabled={busy || writing || !drawing.strokes.length} onClick={() => onChange(emptyHandwriting())} className={control}>Clear</button>
      <button type="button" disabled={busy || writing || drawing.rows >= 6} onClick={() => onChange({ ...drawing, rows: drawing.rows + 1 })} className={`${control} ml-auto`}>More space</button>
    </div>
    <button type="button" disabled={busy || writing || !drawing.strokes.length} onClick={submit} className="min-h-12 w-full rounded-xl bg-pink-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-40">{busy ? "Reading your handwriting…" : "Done"}</button>
    <p className="text-[11px] leading-5 text-neutral-500">Done sends your writing to the app’s AI reader. You can rewrite it if it is misread.</p>
  </div>;
}
