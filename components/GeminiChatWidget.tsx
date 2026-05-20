"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  appendAiMessage,
  createAiConversation,
  deleteAiConversation,
  listAiConversations,
  listAiMessages,
  maybeRenameConversationFromFirstMessage,
  isWorkspaceAiChatSynced,
  type AiConversationRow,
  type AiMessageRow,
} from "@/lib/workspace-ai-chat-repo";
import { packUserChatContent, unpackChatMessageContent } from "@/lib/chat-vision-pack";
import {
  FAB_BOTTOM_PRIMARY,
  FLOATING_PANEL_ABOVE_ONE_FAB,
  onCloseFloatingPanels,
  onFloatingPanelOpen,
  publishFloatingPanelOpen,
  requestCloseFloatingPanels,
} from "@/lib/workspace-floating-panels";

const STORAGE_KEY = "workspace-gemini-chat-v1";
const PANEL_SIZE_KEY = "workspace-gemini-chat-panel-size-v1";
const ACTIVE_CONV_LS_KEY = "workspace-gemini-chat-active-conv-v1";

const PANEL_MIN_W = 320;
const PANEL_MIN_H = 240;
const DEFAULT_PANEL_W = 520;
const DEFAULT_PANEL_H = 480;
const MAX_CHAT_IMAGE_BYTES = 2.5 * 1024 * 1024;

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
  const maxW = Math.min(window.innerWidth - 32, 720);
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

function mapDbMessagesToChat(rows: AiMessageRow[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows) {
    if (r.role !== "user" && r.role !== "assistant") continue;
    const c = (r.content ?? "").trim();
    if (!c) continue;
    out.push({ id: r.id, role: r.role, content: c });
  }
  return out;
}

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

function ImageAttachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V8a2 2 0 00-2-2h-2.343M6 20H4a2 2 0 01-2-2v-4m0-4V6a2 2 0 012-2h4m8 0h2a2 2 0 012 2v2M9 7h.01M15 7h.01"
      />
    </svg>
  );
}

function UserMessageBubble({ content }: { content: string }) {
  const { text, imageDataUrl } = useMemo(() => unpackChatMessageContent(content), [content]);
  return (
    <>
      {imageDataUrl ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-white/25 bg-black/10">
          <img
            src={imageDataUrl}
            alt="Attachment"
            className="max-h-40 max-w-[min(100%,18rem)] object-contain"
            loading="lazy"
          />
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words">{text}</p>
    </>
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

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function prettifyProvider(p: string | undefined): string | null {
  if (!p) return null;
  if (p === "openai") return "OpenAI";
  if (p === "gemini") return "Gemini";
  if (p === "groq") return "Groq";
  return p;
}

export function GeminiChatWidget() {
  const synced = isWorkspaceAiChatSynced();
  const [open, setOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<AiConversationRow[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  /** Desktop (sm+): saved-chat rail starts collapsed; mobile uses the overlay menu only. */
  const [savedChatsExpanded, setSavedChatsExpanded] = useState(false);
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({
    w: DEFAULT_PANEL_W,
    h: DEFAULT_PANEL_H,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelSizeRef = useRef<{ w: number; h: number }>({ w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H });
  const initStartedRef = useRef(false);
  const hydratedRef = useRef(false);
  const panelSizeHydrated = useRef(false);

  panelSizeRef.current = panelSize;

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    if (!synced) {
      setMessages(loadStored());
      hydratedRef.current = true;
      return;
    }
    void (async () => {
      try {
        let list = await listAiConversations();
        if (list.length === 0) {
          const local = loadStored();
          if (local.length > 0) {
            const nid = await createAiConversation("Imported from this browser");
            if (nid) {
              for (const m of local) {
                await appendAiMessage(nid, m.role, m.content);
              }
              try {
                sessionStorage.removeItem(STORAGE_KEY);
              } catch {
                /* ignore */
              }
              list = await listAiConversations();
            }
          }
        }
        setConversations(list);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(ACTIVE_CONV_LS_KEY);
        } catch {
          saved = null;
        }
        const savedOk = saved && list.some((c) => c.id === saved);
        const active = savedOk ? saved! : list[0]?.id ?? null;
        setActiveConversationId(active);
        if (active) {
          const rows = await listAiMessages(active);
          setMessages(mapDbMessagesToChat(rows));
          try {
            window.localStorage.setItem(ACTIVE_CONV_LS_KEY, active);
          } catch {
            /* ignore */
          }
        } else {
          setMessages([]);
        }
      } catch (e) {
        console.error("[GeminiChatWidget] init", e);
        setMessages(loadStored());
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, [synced]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (synced) return;
    saveStored(messages);
  }, [messages, synced]);

  useEffect(() => {
    if (!synced || conversations.length === 0) return;
    if (activeConversationId && conversations.some((c) => c.id === activeConversationId)) return;
    const pick = conversations[0]!.id;
    setActiveConversationId(pick);
    void (async () => {
      const rows = await listAiMessages(pick);
      setMessages(mapDbMessagesToChat(rows));
    })();
    try {
      window.localStorage.setItem(ACTIVE_CONV_LS_KEY, pick);
    } catch {
      /* ignore */
    }
  }, [synced, conversations, activeConversationId]);

  useEffect(() => {
    if (!open || !synced || !activeConversationId) return;
    const tick = () => {
      void (async () => {
        const [rows, list] = await Promise.all([
          listAiMessages(activeConversationId),
          listAiConversations(),
        ]);
        setMessages(mapDbMessagesToChat(rows));
        setConversations(list);
      })();
    };
    const interval = window.setInterval(tick, 7000);
    return () => window.clearInterval(interval);
  }, [open, synced, activeConversationId]);

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

  /** Fit panel to viewport when opening (narrow phones need width clamp immediately). */
  useLayoutEffect(() => {
    if (!open) return;
    setPanelSize((s) => {
      const n = clampPanelSize(s.w, s.h);
      if (n.w === s.w && n.h === s.h) return s;
      panelSizeRef.current = n;
      persistPanelSize(n);
      return n;
    });
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
    if (!open) {
      setMobileSidebarOpen(false);
      setSavedChatsExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, loading]);

  useEffect(() => {
    return onCloseFloatingPanels((except) => {
      if (except !== "chat") setOpen(false);
    });
  }, []);

  useEffect(() => {
    publishFloatingPanelOpen("chat", open);
  }, [open]);

  useEffect(() => {
    return onFloatingPanelOpen((id, isOpen) => {
      if (id === "translate") setTranslateOpen(isOpen);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return;
      }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mobileSidebarOpen]);

  useEffect(() => {
    if (!open || !synced || !activeConversationId) return;
    let cancelled = false;
    void (async () => {
      const [rows, list] = await Promise.all([
        listAiMessages(activeConversationId),
        listAiConversations(),
      ]);
      if (cancelled) return;
      setMessages(mapDbMessagesToChat(rows));
      setConversations(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, synced, activeConversationId]);

  const selectConversationById = useCallback(
    async (nextId: string) => {
      if (!synced || !nextId) return;
      if (nextId === activeConversationId) {
        setMobileSidebarOpen(false);
        return;
      }
      setActiveConversationId(nextId);
      setError(null);
      setPendingImage(null);
      setLastProvider(null);
      try {
        window.localStorage.setItem(ACTIVE_CONV_LS_KEY, nextId);
      } catch {
        /* ignore */
      }
      const rows = await listAiMessages(nextId);
      setMessages(mapDbMessagesToChat(rows));
      setMobileSidebarOpen(false);
      setSavedChatsExpanded(false);
    },
    [synced, activeConversationId]
  );

  const handleNewChat = useCallback(async () => {
    setError(null);
    setLastProvider(null);
    setPendingImage(null);
    setMobileSidebarOpen(false);
    if (!synced) {
      setMessages([]);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const nid = await createAiConversation();
    if (!nid) {
      setError("Could not start a new conversation.");
      return;
    }
    setConversations(await listAiConversations());
    setActiveConversationId(nid);
    try {
      window.localStorage.setItem(ACTIVE_CONV_LS_KEY, nid);
    } catch {
      /* ignore */
    }
    setMessages([]);
  }, [synced]);

  const handleDeleteConversation = useCallback(async () => {
    if (!synced || !activeConversationId) return;
    if (!window.confirm("Delete this saved conversation for everyone using this workspace?")) return;
    setLastProvider(null);
    const ok = await deleteAiConversation(activeConversationId);
    if (!ok) {
      setError("Could not delete conversation.");
      return;
    }
    const list = await listAiConversations();
    setConversations(list);
    const next = list[0]?.id ?? null;
    setActiveConversationId(next);
    if (next) {
      try {
        window.localStorage.setItem(ACTIVE_CONV_LS_KEY, next);
      } catch {
        /* ignore */
      }
      const rows = await listAiMessages(next);
      setMessages(mapDbMessagesToChat(rows));
    } else {
      try {
        window.localStorage.removeItem(ACTIVE_CONV_LS_KEY);
      } catch {
        /* ignore */
      }
      setMessages([]);
    }
  }, [synced, activeConversationId]);

  const onPickChatImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_CHAT_IMAGE_BYTES) {
      setError(`Image too large (max ${Math.round(MAX_CHAT_IMAGE_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:")) {
        setError("Could not read image.");
        return;
      }
      setError(null);
      setPendingImage({ dataUrl, name: file.name });
    };
    reader.onerror = () => setError("Could not read image.");
    reader.readAsDataURL(file);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    const imageForSend = pendingImage?.dataUrl ?? null;
    const snapshotInput = input;
    const snapshotPending = pendingImage;
    setInput("");
    setPendingImage(null);
    setError(null);
    setLastProvider(null);
    setLoading(true);
    const packedUser = packUserChatContent(text, imageForSend);
    const firstLineForTitle = unpackChatMessageContent(packedUser).text;

    try {
      if (!synced) {
        const userMsg: ChatMessage = { id: id(), role: "user", content: packedUser };
        setMessages((prev) => [...prev, userMsg]);
        const payload = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
        const res = await fetch("/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
        });
        const data = (await res.json()) as { text?: string; error?: string; provider?: string };
        if (!res.ok) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        if (!data.text?.trim()) {
          throw new Error("No reply text from the model.");
        }
        const reply = data.text.trim();
        setLastProvider(prettifyProvider(data.provider));
        setMessages((prev) => [...prev, { id: id(), role: "assistant", content: reply }]);
        return;
      }

      let convId = activeConversationId;
      if (!convId) {
        const nid = await createAiConversation();
        if (!nid) {
          throw new Error("Could not create a saved conversation.");
        }
        convId = nid;
        setActiveConversationId(nid);
        try {
          window.localStorage.setItem(ACTIVE_CONV_LS_KEY, nid);
        } catch {
          /* ignore */
        }
        setConversations(await listAiConversations());
      }

      const userOk = await appendAiMessage(convId, "user", packedUser);
      if (!userOk) {
        throw new Error("Could not save your message.");
      }
      await maybeRenameConversationFromFirstMessage(convId, firstLineForTitle);
      setConversations(await listAiConversations());

      const rowsAfterUser = await listAiMessages(convId);
      const mapped = mapDbMessagesToChat(rowsAfterUser);
      setMessages(mapped);

      const payload = mapped.map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const data = (await res.json()) as { text?: string; error?: string; provider?: string };
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (!data.text?.trim()) {
        throw new Error("No reply text from the model.");
      }
      const reply = data.text.trim();
      setLastProvider(prettifyProvider(data.provider));
      const asstOk = await appendAiMessage(convId, "assistant", reply);
      if (!asstOk) {
        throw new Error("Could not save the assistant reply.");
      }
      const rowsFinal = await listAiMessages(convId);
      setMessages(mapDbMessagesToChat(rowsFinal));
      setConversations(await listAiConversations());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setInput(snapshotInput);
      setPendingImage(snapshotPending);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, synced, activeConversationId, pendingImage]);

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

  const fabShell =
    "flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200/90 bg-white/90 text-pink-600 shadow-sm shadow-neutral-900/[0.04] backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/70 focus-visible:ring-offset-2 hover:border-pink-200/70 hover:bg-pink-50/30 hover:text-pink-700";

  const toggleChatOpen = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next) requestCloseFloatingPanels("chat");
      return next;
    });
  }, []);

  return (
    <>
      {!translateOpen ? (
        <button
          type="button"
          onClick={toggleChatOpen}
          className={`fixed z-[100] ${FAB_BOTTOM_PRIMARY} ${fabShell} ${
            open ? "border-pink-200/90 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50/95" : ""
          }`}
          aria-expanded={open}
          aria-controls="gemini-chat-panel"
          aria-label={open ? "Close AI chat" : "Open AI chat"}
        >
          {open ? <CloseFabIcon className="h-5 w-5" /> : <ChatFabIcon className="h-5 w-5" />}
        </button>
      ) : null}

      {open && (
        <div
          ref={panelRef}
          id="gemini-chat-panel"
          className={`${FLOATING_PANEL_ABOVE_ONE_FAB} flex flex-col overflow-hidden rounded-2xl border border-pink-200/70 bg-white shadow-[0_20px_50px_-12px_rgba(236,72,153,0.28),0_8px_24px_-6px_rgba(0,0,0,0.08)] ring-1 ring-pink-100/40`}
          style={{
            width: panelSize.w,
            height: panelSize.h,
            minWidth: PANEL_MIN_W,
            minHeight: PANEL_MIN_H,
            maxWidth: "min(calc(100vw - 2rem), 720px)",
            maxHeight: "min(88dvh, 800px)",
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
          <div className="flex items-center justify-between gap-2 border-b border-pink-100/90 bg-gradient-to-r from-pink-50 via-white to-rose-50/40 py-2.5 pl-11 pr-2">
            <div className="min-w-0 flex-1 text-left">
              <h2 id="gemini-chat-title" className="text-sm font-bold tracking-tight text-neutral-900">
                Workspace AI
              </h2>
              <p className="mt-0.5 text-[10px] font-medium text-neutral-500">Chat · translate · study tips</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {synced ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-neutral-500 transition hover:bg-white/80 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 sm:hidden"
                    aria-label="Open conversation list"
                    onClick={() => setMobileSidebarOpen(true)}
                  >
                    <MenuIcon className="h-5 w-5" />
                  </button>
                  <div className="hidden items-center gap-1 sm:flex">
                    <button
                      type="button"
                      aria-expanded={savedChatsExpanded}
                      aria-controls="workspace-ai-saved-chats"
                      onClick={() => setSavedChatsExpanded((v) => !v)}
                      className="rounded-lg border border-pink-200/80 bg-white px-2 py-1.5 text-[11px] font-semibold text-pink-900 shadow-sm transition hover:bg-pink-50"
                    >
                      {savedChatsExpanded ? "Hide list" : "Saved chats"}
                    </button>
                    {!savedChatsExpanded ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void handleNewChat()}
                        className="rounded-lg border border-pink-200/90 bg-pink-50/40 px-2 py-1.5 text-[11px] font-semibold text-pink-900 transition hover:bg-pink-50 disabled:opacity-50"
                      >
                        New chat
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-2 text-neutral-400 transition hover:bg-white/80 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80"
                aria-label="Close chat"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {synced && mobileSidebarOpen ? (
              <button
                type="button"
                className="absolute inset-0 z-40 bg-black/35 sm:hidden"
                aria-label="Close conversation list"
                onClick={() => setMobileSidebarOpen(false)}
              />
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              {synced ? (
                <aside
                  id="workspace-ai-saved-chats"
                  className={`z-50 flex min-h-0 w-[min(18rem,88vw)] shrink-0 flex-col border-pink-100/70 bg-white shadow-2xl max-sm:absolute max-sm:left-0 max-sm:top-0 max-sm:h-full max-sm:border-r sm:relative sm:z-0 sm:border-r sm:bg-gradient-to-b sm:from-neutral-50/95 sm:to-pink-50/40 sm:shadow-none ${
                    mobileSidebarOpen ? "max-sm:flex" : "max-sm:hidden"
                  } ${savedChatsExpanded ? "sm:flex sm:w-44" : "sm:hidden"}`}
                >
                  <div className="flex shrink-0 items-center justify-between gap-1 border-b border-pink-100/60 px-2 pb-1 pt-2 sm:border-b-0 sm:pb-0 sm:pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-500">Saved chats</p>
                    <button
                      type="button"
                      className="hidden rounded-md p-1 text-neutral-400 transition hover:bg-white hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 sm:inline-flex"
                      aria-label="Collapse saved chats"
                      onClick={() => setSavedChatsExpanded(false)}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
                    {conversations.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-pink-200/80 bg-pink-50/30 px-2 py-2 text-[11px] leading-snug text-neutral-600">
                        No threads yet — send a message to create your first one.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-0.5" role="list">
                        {conversations.map((c) => {
                          const active = c.id === activeConversationId;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                disabled={loading}
                                title={c.title}
                                onClick={() => void selectConversationById(c.id)}
                                className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition disabled:opacity-50 ${
                                  active
                                    ? "border-pink-300/80 bg-pink-50 text-pink-950 shadow-sm"
                                    : "border-transparent text-neutral-700 hover:border-pink-100/90 hover:bg-white/90"
                                }`}
                              >
                                <span className="line-clamp-2">{c.title}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="shrink-0 border-t border-pink-100/80 p-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleNewChat()}
                      className="w-full rounded-lg border border-pink-200/90 bg-white py-2 text-center text-[11px] font-semibold text-pink-900 shadow-sm transition hover:bg-pink-50 disabled:opacity-50"
                    >
                      New chat
                    </button>
                  </div>
                </aside>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!synced && (
                  <p className="border-b border-neutral-200/80 bg-neutral-50/95 px-3 py-1.5 text-[10px] leading-snug text-neutral-600">
                    Chats stay in this browser session only. Add{" "}
                    <code className="rounded bg-neutral-100 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
                    and{" "}
                    <code className="rounded bg-neutral-100 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                    to save threads in the workspace database and open them on other devices.
                  </p>
                )}

                {configured === false && (
                  <p className="border-b border-amber-200/80 bg-amber-50/95 px-3 py-2 text-[11px] leading-snug text-amber-950">
                    Add{" "}
                    <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">GEMINI_API_KEY</code>,{" "}
                    <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">GROQ_API_KEY</code>, or{" "}
                    <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">OPENAI_API_KEY</code>{" "}
                    to <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">.env.local</code>, then
                    restart <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">npm run dev</code>.
                  </p>
                )}

                <div
                  ref={listRef}
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-neutral-50/95 via-white to-pink-50/25 px-3 py-3"
                >
            {messages.length === 0 && !error && (
              <div className="rounded-xl border border-pink-100/90 bg-white/90 p-3 shadow-sm shadow-pink-100/30">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pink-500">New conversation</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">How can I help?</p>
                <p className="mt-1 text-[11px] leading-snug text-neutral-600">
                  {synced ? (
                    <>
                      Ask about this workspace, studying, or anything else — <strong className="text-neutral-700">attach a screenshot</strong> to ask about it (images use OpenAI first, then Gemini). Saved threads sync across devices with Supabase.
                    </>
                  ) : (
                    <>
                      Ask about this workspace, studying, or anything else. Attach an image to include it in your
                      question. This session is kept in{" "}
                      <strong className="font-semibold text-neutral-700">session storage</strong> until you close the
                      tab.
                    </>
                  )}
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
                    className={`flex min-w-0 flex-col gap-1 ${
                      m.role === "user"
                        ? "max-w-[min(94%,22rem)] shrink-0 items-end"
                        : "w-full max-w-full items-stretch"
                    }`}
                  >
                    <span className="px-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-neutral-400">
                      {m.role === "user" ? "You" : "Assistant"}
                    </span>
                    <div
                      className={
                        m.role === "user"
                          ? "w-fit max-w-full rounded-2xl bg-gradient-to-br from-pink-600 to-rose-600 px-3.5 py-2.5 text-[13px] leading-snug text-white shadow-md shadow-pink-400/20"
                          : "w-full min-w-0 rounded-2xl border border-pink-100/90 bg-white px-3.5 py-2.5 text-neutral-800 shadow-sm shadow-neutral-900/[0.04]"
                      }
                    >
                      {m.role === "user" ? (
                        <UserMessageBubble content={m.content} />
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
                  className="shrink-0 border-t border-pink-100/80 bg-gradient-to-t from-pink-50/25 to-white px-2.5 pb-2 pt-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    className="sr-only"
                    aria-label="Attach image"
                    onChange={onPickChatImage}
                  />
                  {pendingImage ? (
                    <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-pink-200/80 bg-pink-50/50 px-2 py-1.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-pink-100 bg-white">
                        <img
                          src={pendingImage.dataUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-neutral-800">{pendingImage.name}</p>
                        <p className="text-[10px] text-neutral-500">Next send · vision: OpenAI first</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingImage(null)}
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-500 hover:bg-white hover:text-pink-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-1.5">
                    <button
                      type="button"
                      disabled={loading || configured === false}
                      onClick={() => imageInputRef.current?.click()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/70 bg-white text-pink-600 shadow-sm transition hover:border-pink-300 hover:bg-pink-50 disabled:opacity-40"
                      title="Attach image"
                      aria-label="Attach image"
                    >
                      <ImageAttachIcon className="h-[1.15rem] w-[1.15rem]" />
                    </button>
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
                      placeholder="Message… (Shift+Enter for new line · image optional)"
                      rows={1}
                      disabled={loading || configured === false}
                      className="max-h-28 min-h-9 flex-1 resize-y rounded-lg border border-pink-100/90 bg-white px-2.5 py-2 text-[13px] leading-snug text-neutral-900 shadow-inner shadow-neutral-900/[0.02] placeholder:text-neutral-400 outline-none transition focus:border-pink-300 focus:ring-1 focus:ring-pink-200/60 disabled:opacity-50"
                      aria-label="Message"
                    />
                    <button
                      type="submit"
                      disabled={loading || (!input.trim() && !pendingImage) || configured === false}
                      className="h-9 shrink-0 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 px-3.5 text-xs font-bold text-white shadow-md shadow-pink-300/25 transition hover:from-pink-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Send
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[10px] text-neutral-400">
                <span className="text-neutral-500">Enter</span> to send ·{" "}
                <span className="text-neutral-500">Shift+Enter</span> new line
                {lastProvider ? (
                  <>
                    {" "}
                    ·<span className="text-neutral-500"> Last reply:</span>{" "}
                    <span className="font-medium text-neutral-600">{lastProvider}</span>
                  </>
                ) : null}
              </p>
              {synced && activeConversationId ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteConversation()}
                  className="text-[11px] font-medium text-neutral-500 transition hover:text-red-600"
                >
                  Delete chat
                </button>
              ) : null}
              {!synced && messages.length > 0 ? (
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
              ) : null}
            </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
