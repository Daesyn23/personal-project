/** Packed user message stored in DB / session (single text column). */
export const CHAT_IMAGE_PACK_V = 1 as const;

export function packUserChatContent(userText: string, imageDataUrl?: string | null): string {
  const t = userText.trim() || (imageDataUrl ? "(See attached image)" : "");
  if (!imageDataUrl?.trim()) return t;
  return JSON.stringify({ v: CHAT_IMAGE_PACK_V, t, i: imageDataUrl.trim() });
}

export function unpackChatMessageContent(content: string): { text: string; imageDataUrl?: string } {
  const s = content.trim();
  if (!s.startsWith("{")) return { text: content };
  try {
    const o = JSON.parse(s) as { v?: number; t?: string; i?: string };
    if (
      o.v === CHAT_IMAGE_PACK_V &&
      typeof o.t === "string" &&
      typeof o.i === "string" &&
      o.i.startsWith("data:")
    ) {
      return { text: o.t, imageDataUrl: o.i };
    }
  } catch {
    /* plain text */
  }
  return { text: content };
}
