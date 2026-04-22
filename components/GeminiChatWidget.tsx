"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "workspace-gemini-chat-v1";
const PANEL_SIZE_KEY = "workspace-gemini-chat-panel-size-v1";

const PANEL_MIN_W = 280;
const PANEL_MIN_H = 220;
const DEFAULT_PANEL_W = 384;
const DEFAULT_PANEL_H = 420;

const STARTER_PROMPTS = [
  "What can I do in this workspace?",
  "Suggest a 20-minute study plan for today.",
  "Explain spaced repetition in simple terms.",
] as const;

function clampPanelSize(w: number, h: number): { w: number; h: number } {
  if (typeof window === "undefined") {
    return {
      w: Math.round(Math.max(PANEL_MIN_W, Math.min(720, w))),
      h: Math.round(Math.max(PANEL_MIN_H, Math.min(800, h))),
    };
  }
  const maxW = Math.min(window.innerWidth - 40, 720);
  const maxH = Math.min(window.innerHeight * 0.88, 800);
  return {
    w: Math.round(Math.max(PANEL_MIN_W, Math.min(maxW, w))),
    h: Math.round(Math.max(PANEL_MIN_H, Math.min(maxH, h))),
  };
}

function loadPanelSize(): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PANEL_SIZE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof p.w !== "number" || typeof p.h !== "number") return null;
    return clampPanelSize(p.w, p.h);
  } catch {
    return null;
  }
}

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: Exclude<Role, "system">;
  content: string;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadStored(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ChatMessage[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const role = (row as { role?: unknown }).role;
      const content = (row as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") continue;
      if (typeof content !== "string" || !content.trim()) continue;
      out.push({ id: id(), role, content: content.trim() });
    }
    return out.slice(-30);
  } catch {
    return [];
  }
}

function saveStored(messages: ChatMessage[]) {
  try {
    const slim = messages.map(({ role, content }) => ({ role, content }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* ignore */
  }
}

function ChatFabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
      />
    </svg>
  );
}

function CloseFabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />
    </svg>
  );
}

function ResizeCornerGrip({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 16L16 4M8 16L16 8M12 16L16 12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function persistPanelSize(size: { w: number; h: number }) {
  try {
    sessionStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

/** Inline `**bold**` from model text — no HTML, safe for React children. */
function parseInlineBold(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      out.push(rest);
      break;
    }
    if (open > 0) {
      out.push(rest.slice(0, open));
    }
    const close = rest.indexOf("**", open + 2);
    if (close === -1) {
      out.push(rest.slice(open));
      break;
    }
    const inner = rest.slice(open + 2, close);
    out.push(
      <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-neutral-900">
        {inner}
      </strong>
    );
    rest = rest.slice(close + 2);
  }
  return out;
}

function AssistantMessageBody({ content }: { content: string }) {
  const blocks = useMemo(
    () =>
      content
        .split(/\n\n+/)
        .map((b) => b.trimEnd())
        .filter((b) => b.length > 0),
    [content]
  );
  if (blocks.length === 0) {
    return <p className="text-[13px] text-neutral-500">(Empty reply)</p>;
  }
  return (
    <div className="space-y-1.5 text-[13px] leading-snug text-neutral-800">
      {blocks.map((block, bi) => (
        <p key={bi} className="whitespace-pre-wrap break-words">
          {parseInlineBold(block, `p${bi}`)}
        </p>
      ))}
    </div>
  );
}

export function GeminiChatWidget() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({
    w: DEFAULT_PANEL_W,
    h: DEFAULT_PANEL_H,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelSizeRef = useRef<{ w: number; h: number }>({ w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H });
  const loadedRef = useRef(false);
  const panelSizeHydrated = useRef(false);

  panelSizeRef.current = panelSize;

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setMessages(loadStored());
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveStored(messages);
  }, [messages]);

  useEffect(() => {
    if (panelSizeHydrated.current) return;
    panelSizeHydrated.current = true;
    const saved = loadPanelSize();
    if (saved) {
      setPanelSize(saved);
      panelSizeRef.current = saved;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onWin = () =>
      setPanelSize((s) => {
        const n = clampPanelSize(s.w, s.h);
        panelSizeRef.current = n;
        persistPanelSize(n);
        return n;
      });
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/gemini/status");
        const data = (await res.json()) as { configured?: boolean };
        setConfigured(Boolean(data.configured));
      } catch {
        setConfigured(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const userMsg: ChatMessage = { id: id(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const payload = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (!data.text?.trim()) {
        throw new Error("No reply text from the model.");
      }
      const reply = data.text.trim();
      setMessages((prev) => [...prev, { id: id(), role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const onResizeHandlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = panelSizeRef.current.w;
    const startH = panelSizeRef.current.h;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const next = clampPanelSize(startW - (ev.clientX - startX), startH - (ev.clientY - startY));
      panelSizeRef.current = next;
      setPanelSize(next);
    };

    const cleanup = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", cleanup);
      handle.removeEventListener("pointercancel", cleanup);
      persistPanelSize(panelSizeRef.current);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", cleanup);
    handle.addEventListener("pointercancel", cleanup);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-[100] flex h-12 w-12 items-center justify-center rounded-full border bg-white/90 text-pink-600 shadow-sm shadow-neutral-900/[0.04] backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/70 focus-visible:ring-offset-2 ${
          open
            ? "border-pink-200/90 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50/95"
            : "border-neutral-200/90 hover:border-pink-200/70 hover:bg-pink-50/30 hover:text-pink-700"
        }`}
        aria-expanded={open}
        aria-controls="gemini-chat-panel"
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? <CloseFabIcon className="h-5 w-5" /> : <ChatFabIcon className="h-5 w-5" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="gemini-chat-panel"
          className="fixed bottom-[4.5rem] right-5 z-[100] flex flex-col overflow-hidden rounded-2xl border border-pink-200/80 bg-white shadow-[0_12px_40px_-8px_rgba(236,72,153,0.22),0_4px_16px_-4px_rgba(0,0,0,0.06)] ring-1 ring-pink-100/50"
          style={{
            width: panelSize.w,
            height: panelSize.h,
            minWidth: PANEL_MIN_W,
            minHeight: PANEL_MIN_H,
            maxWidth: "min(calc(100vw - 2.5rem), 720px)",
            maxHeight: "min(88vh, 800px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gemini-chat-title"
        >
          <button
            type="button"
            onPointerDown={onResizeHandlePointerDown}
            className="absolute left-0 top-0 z-20 flex h-11 w-11 touch-none cursor-nwse-resize items-end justify-end rounded-tl-2xl p-1.5 text-neutral-400 transition hover:bg-pink-50/80 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-400/80"
            aria-label="Resize chat panel"
            title="Resize"
          >
            <ResizeCornerGrip className="h-5 w-5" />
          </button>
          <div className="flex items-center justify-between gap-2 border-b border-pink-100/80 bg-gradient-to-br from-pink-50/95 via-white to-rose-50/30 py-2 pl-11 pr-2">
            <div className="min-w-0 flex-1">
              <h2 id="gemini-chat-title" className="text-sm font-bold tracking-tight text-neutral-900">
                Workspace AI
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-2 text-neutral-400 transition hover:bg-white/80 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80"
              aria-label="Close chat"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {configured === false && (
            <p className="border-b border-amber-200/80 bg-amber-50/95 px-3 py-2 text-[11px] leading-snug text-amber-950">
              Add <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">GEMINI_API_KEY</code>{" "}
              to <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">.env.local</code>, then
              restart <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">npm run dev</code>.
            </p>
          )}

          <div
            ref={listRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-neutral-50/90 to-pink-50/20 px-3 py-2"
          >
            {messages.length === 0 && !error && (
              <div className="rounded-xl border border-pink-100/90 bg-white/90 p-3 shadow-sm shadow-pink-100/30">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pink-500">New conversation</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">How can I help?</p>
                <p className="mt-1 text-[11px] leading-snug text-neutral-600">
                  Ask about this workspace, studying, or anything else. Chats stay in this browser tab only (not saved
                  to the server).
                </p>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium text-neutral-500">Try</p>
                  {STARTER_PROMPTS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      disabled={loading || configured === false}
                      onClick={() => {
                        setInput(text);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      className="rounded-lg border border-pink-100/90 bg-pink-50/40 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-pink-950 transition hover:border-pink-200 hover:bg-pink-50/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex min-w-0 ${m.role === "user" ? "justify-end" : "w-full justify-start"}`}
              >
                <div
                  className={`flex min-w-0 flex-col gap-0.5 ${
                    m.role === "user"
                      ? "max-w-[min(90%,16rem)] shrink-0 items-end"
                      : "w-full max-w-full items-stretch"
                  }`}
                >
                  <span className="px-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-neutral-400">
                    {m.role === "user" ? "You" : "Assistant"}
                  </span>
                  <div
                    className={
                      m.role === "user"
                        ? "w-fit max-w-full rounded-xl bg-gradient-to-br from-pink-600 to-rose-600 px-3 py-2 text-[13px] leading-snug text-white shadow-sm shadow-pink-300/25"
                        : "w-full min-w-0 rounded-xl border border-pink-100/90 bg-white px-3 py-2 text-neutral-800 shadow-sm shadow-neutral-900/5"
                    }
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    ) : (
                      <AssistantMessageBody content={m.content} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex w-full min-w-0 justify-start">
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-pink-100/90 bg-white px-2.5 py-1.5 text-[11px] font-medium text-pink-800 shadow-sm">
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"
                    aria-hidden
                  />
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <p
                className="rounded-lg border border-red-200/90 bg-red-50/95 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-red-900"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <form
            className="border-t border-pink-100/80 bg-white px-3 pb-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-1.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Write a message…"
                rows={2}
                disabled={loading || configured === false}
                className="max-h-28 min-h-[2.25rem] flex-1 resize-y rounded-lg border border-neutral-200/90 bg-neutral-50/50 px-2.5 py-2 text-[13px] leading-snug text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors focus:border-pink-300 focus:bg-white focus:ring-2 focus:ring-pink-200/60 disabled:opacity-50"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || configured === false}
                className="h-9 shrink-0 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 px-3 text-[11px] font-bold text-white shadow-md shadow-pink-200/35 transition hover:from-pink-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Send
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <p className="text-[10px] text-neutral-400">
                <span className="text-neutral-500">Enter</span> to send ·{" "}
                <span className="text-neutral-500">Shift+Enter</span> for a new line
              </p>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                    try {
                      sessionStorage.removeItem(STORAGE_KEY);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="text-[11px] font-medium text-neutral-500 transition hover:text-pink-700"
                >
                  Clear chat
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
