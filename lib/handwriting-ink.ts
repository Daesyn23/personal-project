export type InkPoint = { x: number; y: number };

/** Crop around every stroke, keeping diacritics and the relative layout of rows. */
export function handwritingInkBounds(strokes: InkPoint[][], width: number, height: number) {
  let left = width, top = height, right = 0, bottom = 0;
  let found = false;
  for (const stroke of strokes) for (const point of stroke) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    found = true;
    left = Math.min(left, point.x); right = Math.max(right, point.x);
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
  }
  if (!found) return null;
  // Include round stroke caps plus a generous white border for recognition.
  const padding = 32;
  left = Math.max(0, Math.floor(left - padding)); top = Math.max(0, Math.floor(top - padding));
  right = Math.min(width, Math.ceil(right + padding)); bottom = Math.min(height, Math.ceil(bottom + padding));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
