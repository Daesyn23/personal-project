"use client";

import { HeadingWithInfo } from "@/components/InfoTip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  JLPT_YOUTUBE_PLAYLISTS,
  type JlptPlaylistDef,
  type JlptPlaylistKey,
} from "@/lib/youtube-jlpt-playlists";
import type { YoutubePlaylistVideo } from "@/lib/parse-youtube-playlist-rss";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      playlistTitle: string | null;
      videos: YoutubePlaylistVideo[];
      feedNote: string;
      source?: "youtube_data_api" | "youtube_oauth" | "rss";
    };

type SortOption = "playlist" | "newest" | "oldest" | "title_az" | "title_za";

const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

const STORAGE_SORT = "video-lessons-sort";
const STORAGE_PAGE_SIZE = "video-lessons-page-size";

function readStoredSort(): SortOption | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_SORT);
  const allowed: SortOption[] = ["playlist", "newest", "oldest", "title_az", "title_za"];
  return allowed.includes(raw as SortOption) ? (raw as SortOption) : null;
}

function readStoredPageSize(): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_PAGE_SIZE);
  const n = parseInt(raw ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]) ? n : null;
}

function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`;
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function formatPublished(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sortVideos(videos: YoutubePlaylistVideo[], order: SortOption): YoutubePlaylistVideo[] {
  const copy = [...videos];
  switch (order) {
    case "playlist":
      return copy;
    case "newest":
      return copy.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    case "oldest":
      return copy.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    case "title_az":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "title_za":
      return copy.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
    default:
      return copy;
  }
}

/** Compact page index display with gaps (e.g. 1 … 4 5 6 … 12). */
function visiblePageSlots(totalPages: number, currentPage: number): ("gap" | number)[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const want = new Set<number>();
  want.add(1);
  want.add(totalPages);
  for (let d = 0; d <= 2; d++) {
    if (currentPage - d >= 1) want.add(currentPage - d);
    if (currentPage + d <= totalPages) want.add(currentPage + d);
  }
  const sorted = [...want].sort((a, b) => a - b);
  const out: ("gap" | number)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

function FolderGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5V6a2 2 0 012-2h4.5l1 1.5H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-7.5z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5h18" opacity={0.35} />
    </svg>
  );
}

function JlptFolderCard(props: {
  def: JlptPlaylistDef;
  selected: boolean;
  compact?: boolean;
  onSelect: (key: JlptPlaylistKey) => void;
}) {
  const { def, selected, compact, onSelect } = props;
  const level = def.label.replace(/^JLPT\s+/i, "");

  return (
    <button
      type="button"
      onClick={() => onSelect(def.key)}
      aria-pressed={selected}
      aria-label={`Open ${def.label} video folder`}
      className={`group relative flex w-full overflow-hidden rounded-2xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
        compact
          ? `min-h-[88px] flex-row items-center gap-4 px-4 py-3 text-left sm:py-3.5 ${
              selected
                ? "border-pink-500 bg-gradient-to-br from-pink-50 to-rose-50/80 shadow-md shadow-pink-200/40 ring-1 ring-pink-200/60"
                : "border-pink-100/90 bg-white/90 hover:border-pink-300 hover:bg-pink-50/50 hover:shadow-md"
            }`
          : `min-h-[188px] flex-col items-center justify-center p-6 text-center ${
              selected
                ? "border-pink-500 bg-gradient-to-br from-pink-50 via-white to-rose-50 shadow-lg shadow-pink-300/30 ring-2 ring-pink-200/80"
                : "border-pink-200/80 bg-gradient-to-b from-white to-pink-50/40 hover:border-pink-400 hover:shadow-lg hover:shadow-pink-200/25"
            }`
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-600 transition group-hover:bg-pink-500/15 ${
          compact ? "h-11 w-11 sm:h-12 sm:w-12" : "mb-4 h-16 w-16"
        }`}
      >
        <FolderGlyph className={compact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-9 w-9"} />
      </div>
      <div className={`min-w-0 ${compact ? "flex-1 text-left" : ""}`}>
        <p
          className={`font-bold tracking-tight text-neutral-900 ${compact ? "text-lg sm:text-xl" : "text-3xl sm:text-4xl"}`}
        >
          {level}
        </p>
        <p className={`mt-1 text-neutral-500 ${compact ? "text-xs sm:text-sm" : "text-sm"}`}>Curated playlist</p>
      </div>
      {selected ? (
        <span
          className={`pointer-events-none absolute font-semibold text-pink-700 ${
            compact ? "right-3 top-3 text-[10px] uppercase tracking-wide" : "right-4 top-4 text-xs uppercase tracking-wide"
          }`}
        >
          Open
        </span>
      ) : null}
    </button>
  );
}

function ChevronFirst(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  );
}

function ChevronLast(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 17l5-5-5-5M6 17l5-5-5-5" />
    </svg>
  );
}

function ChevronPrev(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronNext(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

function VideoLessonsPagination(props: {
  listPage: number;
  totalListPages: number;
  totalItems: number;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  onLast: () => void;
  onGoToPage: (page: number) => void;
  idPrefix: string;
  className?: string;
}) {
  const {
    listPage,
    totalListPages,
    totalItems,
    pageSize,
    onPageSizeChange,
    onPrev,
    onNext,
    onFirst,
    onLast,
    onGoToPage,
    idPrefix,
    className = "",
  } = props;

  const [jumpValue, setJumpValue] = useState("");
  const slots = useMemo(() => visiblePageSlots(totalListPages, listPage), [totalListPages, listPage]);
  const showPageNav = totalListPages > 1;

  const applyJump = () => {
    const n = parseInt(jumpValue.trim(), 10);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(totalListPages, Math.max(1, n));
    onGoToPage(clamped);
    setJumpValue("");
  };

  return (
    <div
      className={`rounded-2xl border border-pink-200/70 bg-gradient-to-r from-white via-pink-50/40 to-rose-50/30 p-3 shadow-sm ring-1 ring-pink-100/60 sm:p-4 ${className}`}
    >
      {showPageNav ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-pink-700/90">Page</span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={onFirst}
                disabled={listPage <= 1}
                title="First page"
                aria-label="First page"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-neutral-700 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronFirst className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onPrev}
                disabled={listPage <= 1}
                title="Previous page"
                aria-label="Previous page"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-neutral-700 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronPrev className="h-4 w-4" />
              </button>
            </div>

            <div
              className="flex max-w-full flex-wrap items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="navigation"
              aria-label="Page numbers"
            >
              {slots.map((slot, i) =>
                slot === "gap" ? (
                  <span key={`g-${i}`} className="px-1 text-xs font-medium text-neutral-400">
                    …
                  </span>
                ) : (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => onGoToPage(slot)}
                    aria-current={listPage === slot ? "page" : undefined}
                    className={`min-h-9 min-w-9 shrink-0 rounded-lg px-2.5 text-sm font-semibold transition ${
                      listPage === slot
                        ? "bg-pink-600 text-white shadow-md shadow-pink-300/40"
                        : "border border-transparent bg-white/80 text-neutral-800 hover:border-pink-200 hover:bg-pink-50"
                    }`}
                  >
                    {slot}
                  </button>
                ),
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={onNext}
                disabled={listPage >= totalListPages}
                title="Next page"
                aria-label="Next page"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-neutral-700 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronNext className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onLast}
                disabled={listPage >= totalListPages}
                title="Last page"
                aria-label="Last page"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-pink-200/90 bg-white text-neutral-700 shadow-sm transition hover:bg-pink-50 disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronLast className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <label htmlFor={`${idPrefix}-jump`} className="sr-only">
              Go to page number
            </label>
            <span className="hidden text-xs font-medium text-neutral-500 sm:inline">Go to</span>
            <input
              id={`${idPrefix}-jump`}
              type="text"
              inputMode="numeric"
              placeholder="#"
              autoComplete="off"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyJump();
              }}
              className="h-9 w-14 rounded-lg border border-pink-200/90 bg-white px-2 text-center text-sm font-semibold text-neutral-900 shadow-inner outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-200/80"
            />
            <button
              type="button"
              onClick={applyJump}
              className="h-9 rounded-lg border border-pink-300 bg-white px-3 text-xs font-semibold text-pink-800 shadow-sm transition hover:bg-pink-50"
            >
              Go
            </button>
            <label htmlFor={`${idPrefix}-size`} className="sr-only">
              Videos per page
            </label>
            <select
              id={`${idPrefix}-size`}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 cursor-pointer rounded-lg border border-pink-200/90 bg-white pl-2 pr-8 text-xs font-semibold text-neutral-800 shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-200/80"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-neutral-600">
            {totalItems > 0 ? (
              <>
                Showing all <span className="tabular-nums font-semibold text-neutral-800">{totalItems}</span>{" "}
                {totalItems === 1 ? "video" : "videos"} on one page. Use a smaller page size to split into pages.
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${idPrefix}-size`} className="text-xs font-semibold text-neutral-600">
              Grid size
            </label>
            <select
              id={`${idPrefix}-size`}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 cursor-pointer rounded-lg border border-pink-200/90 bg-white pl-2 pr-8 text-xs font-semibold text-neutral-800 shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-200/80"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <p
        className={`text-center text-[11px] font-medium text-neutral-500 sm:text-left ${
          showPageNav ? "mt-3 border-t border-pink-100/80 pt-3" : "mt-2"
        }`}
      >
        {showPageNav ? (
          <>
            Page <span className="tabular-nums text-neutral-700">{listPage}</span> of{" "}
            <span className="tabular-nums text-neutral-700">{totalListPages}</span>
            <span className="text-neutral-400"> · </span>
            <span className="tabular-nums text-neutral-600">{totalItems}</span> total
          </>
        ) : (
          <>
            <span className="tabular-nums text-neutral-600">{totalItems}</span>{" "}
            {totalItems === 1 ? "video" : "videos"}
          </>
        )}
      </p>
    </div>
  );
}

function VideoGridSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-2xl border border-pink-100/90 bg-white shadow-md ring-1 ring-pink-50">
          <div className="aspect-video animate-pulse bg-gradient-to-br from-pink-100/80 to-rose-100/60" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-[88%] max-w-full animate-pulse rounded bg-pink-100/90" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-pink-50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorkspaceYoutubeSection() {
  const [folder, setFolder] = useState<JlptPlaylistKey | null>(null);
  const [data, setData] = useState<FetchState>({ status: "idle" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => readStoredPageSize() ?? 24);
  const [sortOrder, setSortOrder] = useState<SortOption>(() => readStoredSort() ?? "playlist");
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const gridAnchorRef = useRef<HTMLDivElement>(null);
  const playerAnchorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const skipScrollToGridRef = useRef(true);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_SORT, sortOrder);
  }, [sortOrder]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_PAGE_SIZE, String(pageSize));
  }, [pageSize]);

  const load = useCallback(async (def: JlptPlaylistDef) => {
    setData({ status: "loading" });
    setSearchQuery("");
    setSelectedVideoId(null);
    try {
      const res = await fetch(`/api/youtube/playlist?playlistId=${encodeURIComponent(def.playlistId)}`);
      const json = (await res.json()) as {
        error?: string;
        playlistTitle?: string | null;
        videos?: YoutubePlaylistVideo[];
        feedNote?: string;
        source?: "youtube_data_api" | "youtube_oauth" | "rss";
      };
      if (!res.ok) {
        setData({ status: "error", message: json.error || `Request failed (${res.status})` });
        return;
      }
      const videos = Array.isArray(json.videos) ? json.videos : [];
      setListPage(1);
      setData({
        status: "ok",
        playlistTitle: json.playlistTitle ?? null,
        videos,
        feedNote: typeof json.feedNote === "string" ? json.feedNote : "",
        source: json.source,
      });
      if (videos.length > 0) {
        setSelectedVideoId(videos[0].videoId);
      }
    } catch {
      setData({ status: "error", message: "Could not load the playlist." });
    }
  }, []);

  useEffect(() => {
    skipScrollToGridRef.current = true;
  }, [folder]);

  useEffect(() => {
    if (!folder) {
      setData({ status: "idle" });
      setSelectedVideoId(null);
      setSearchQuery("");
      return;
    }
    const def = JLPT_YOUTUBE_PLAYLISTS.find((p) => p.key === folder);
    if (def) void load(def);
  }, [folder, load]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, sortOrder]);

  const filteredVideos = useMemo(() => {
    if (data.status !== "ok") return [];
    const q = searchQuery.trim().toLowerCase();
    const base = !q ? data.videos : data.videos.filter((v) => v.title.toLowerCase().includes(q));
    return sortVideos(base, sortOrder);
  }, [data, searchQuery, sortOrder]);

  const totalFiltered = filteredVideos.length;
  const totalListPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    if (listPage > totalListPages) setListPage(totalListPages);
  }, [listPage, totalListPages]);

  const paginatedVideos = useMemo(() => {
    const start = (listPage - 1) * pageSize;
    return filteredVideos.slice(start, start + pageSize);
  }, [filteredVideos, listPage, pageSize]);

  const rangeStart = totalFiltered === 0 ? 0 : (listPage - 1) * pageSize + 1;
  const rangeEnd = totalFiltered === 0 ? 0 : Math.min(listPage * pageSize, totalFiltered);

  const selectedVideo =
    data.status === "ok" && selectedVideoId
      ? data.videos.find((v) => v.videoId === selectedVideoId) ?? null
      : null;

  const pickFolder = (key: JlptPlaylistKey) => {
    setFolder(key);
  };

  const scrollGridIntoView = useCallback(() => {
    gridAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (data.status !== "ok" || totalFiltered === 0) return;
    if (skipScrollToGridRef.current) {
      skipScrollToGridRef.current = false;
      return;
    }
    scrollGridIntoView();
  }, [listPage, pageSize, data.status, totalFiltered, scrollGridIntoView]);

  const handlePageSizeChange = (n: number) => {
    setPageSize(n);
    setListPage(1);
  };

  const goToPage = (p: number) => {
    setListPage(Math.min(totalListPages, Math.max(1, p)));
  };

  const selectVideoFromGrid = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
    requestAnimationFrame(() => {
      playerAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const copyWatchLink = useCallback(async () => {
    if (!selectedVideoId) return;
    const url = watchUrl(selectedVideoId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyHint("Link copied to clipboard");
      window.setTimeout(() => setCopyHint(null), 2200);
    } catch {
      setCopyHint("Could not copy — try again or check browser permissions");
      window.setTimeout(() => setCopyHint(null), 2800);
    }
  }, [selectedVideoId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-pink-200/70 bg-white/95 shadow-[0_8px_40px_-12px_rgba(219,39,119,0.25)] sm:rounded-3xl">
      <div className="relative overflow-hidden border-b border-pink-100/90 bg-gradient-to-br from-pink-50 via-white to-amber-50/30 px-4 py-6 sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-pink-300/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-10 h-44 w-44 rounded-full bg-rose-200/30 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pink-600">Lesson prep</p>
            {folder ? (
              <span className="rounded-full border border-pink-200/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-700 shadow-sm">
                {JLPT_YOUTUBE_PLAYLISTS.find((p) => p.key === folder)?.label ?? folder}
              </span>
            ) : null}
          </div>
          <HeadingWithInfo
            className="mt-2"
            infoLabel="Video lessons"
            heading={
              <h2 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Video Lessons</h2>
            }
          >
            {folder === null ? (
              <p>
                Pick a JLPT folder to load its playlist. Video stays in this workspace — no extra tabs needed. After
                you open a folder, use sort and search to find lessons quickly.
              </p>
            ) : (
              <p>Switch folders, sort or search lessons, and page through long playlists with the controls below.</p>
            )}
          </HeadingWithInfo>

          <div
            className={
              folder === null
                ? "mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5"
                : "mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4"
            }
            role={folder === null ? undefined : "tablist"}
            aria-label={folder === null ? "Choose JLPT level folder" : "JLPT video folders"}
          >
            {JLPT_YOUTUBE_PLAYLISTS.map((p) => (
              <JlptFolderCard
                key={p.key}
                def={p}
                selected={folder === p.key}
                compact={folder !== null}
                onSelect={pickFolder}
              />
            ))}
          </div>

        </div>
      </div>

      <div className="relative bg-gradient-to-b from-white via-pink-50/20 to-rose-50/25 px-4 py-8 sm:px-8 sm:py-10">
        {folder === null ? (
          <p className="text-center text-sm font-medium text-neutral-500">
            Select <span className="text-neutral-800">N5</span>, <span className="text-neutral-800">N4</span>, or{" "}
            <span className="text-neutral-800">N3</span> above to load videos.
          </p>
        ) : data.status === "loading" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3 py-6 text-sm font-medium text-neutral-600">
              <span
                className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"
                aria-hidden
              />
              Loading playlist…
            </div>
            <VideoGridSkeleton />
          </div>
        ) : null}

        {folder !== null && data.status === "error" && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 shadow-sm" role="alert">
            {data.message}
          </p>
        )}

        {folder !== null && data.status === "ok" && (
          <>
            {data.playlistTitle ? (
              <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-pink-100/90 bg-white/70 px-4 py-3 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-neutral-900">{data.playlistTitle}</p>
                </div>
                {data.source ? (
                  <span className="shrink-0 rounded-lg bg-pink-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-pink-800 ring-1 ring-pink-100">
                    {data.source === "youtube_data_api"
                      ? "Data API"
                      : data.source === "youtube_oauth"
                        ? "Google account"
                        : "RSS preview"}
                  </span>
                ) : null}
              </div>
            ) : null}

            {selectedVideoId && (
              <div ref={playerAnchorRef} className="mb-8 scroll-mt-24 space-y-4">
                <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-pink-100 bg-neutral-950 shadow-2xl shadow-pink-300/25 ring-1 ring-white/10">
                  <div className="aspect-video w-full">
                    <iframe
                      title={selectedVideo?.title ?? "Video"}
                      src={embedUrl(selectedVideoId)}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                </div>
                <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-3 border-b border-pink-100/80 pb-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug text-neutral-900">{selectedVideo?.title ?? "Video"}</p>
                    {selectedVideo?.publishedAt ? (
                      <p className="mt-1 text-xs text-neutral-500 tabular-nums">{formatPublished(selectedVideo.publishedAt)}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyWatchLink()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-900 shadow-sm transition hover:border-pink-400 hover:bg-pink-50"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m0 4h6a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-2" />
                      </svg>
                      Copy link
                    </button>
                  </div>
                </div>
                {copyHint ? (
                  <p className="mx-auto max-w-4xl text-center text-xs font-medium text-pink-700" role="status">
                    {copyHint}
                  </p>
                ) : null}
              </div>
            )}

            <div ref={gridAnchorRef} className="scroll-mt-4" />

            <div className="mb-6 rounded-2xl border border-pink-200/80 bg-gradient-to-b from-white to-pink-50/40 p-4 shadow-md shadow-pink-100/40 ring-1 ring-pink-100/70 sm:p-5">
              <div className="grid grid-cols-1 gap-y-3 md:grid-cols-12 md:gap-x-5 md:gap-y-2">
                <div className="flex items-end justify-between gap-2 md:col-span-8 md:row-start-1">
                  <label htmlFor="video-lessons-search" className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-600">
                    Search this folder
                  </label>
                  <span
                    className="hidden pb-0.5 text-[10px] font-medium text-neutral-400 lg:inline"
                    title="Focus search when not typing in a field"
                  >
                    <kbd className="rounded-md border border-pink-200/90 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-600 shadow-sm">
                      /
                    </kbd>
                  </span>
                </div>
                <div className="relative md:col-span-8 md:row-start-2 md:col-start-1">
                  <input
                    ref={searchInputRef}
                    id="video-lessons-search"
                    type="search"
                    placeholder="Filter by title…"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearchQuery("");
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="h-11 w-full rounded-xl border-2 border-pink-200/90 bg-white py-2.5 pr-[4.5rem] pl-4 text-sm font-medium text-neutral-900 shadow-inner outline-none transition placeholder:text-neutral-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-200/45"
                  />
                  {searchQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-pink-700 transition hover:bg-pink-100"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <label
                  htmlFor="video-lessons-sort"
                  className="flex items-end md:col-span-4 md:col-start-9 md:row-start-1"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-600">Sort by</span>
                </label>
                <select
                  id="video-lessons-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOption)}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl border-2 border-pink-200/90 bg-white bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat py-2.5 pr-10 pl-3 text-sm font-semibold text-neutral-900 shadow-sm outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-200/45 md:col-span-4 md:col-start-9 md:row-start-2"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  }}
                >
                  <option value="playlist">Playlist order</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title_az">Title A → Z</option>
                  <option value="title_za">Title Z → A</option>
                </select>
              </div>

              {data.videos.length > 0 ? (
                <div className="mt-5 flex flex-col gap-3 border-t border-pink-100/90 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-pink-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm ring-1 ring-pink-50">
                      <span className="text-neutral-500">Showing </span>
                      <span className="tabular-nums text-neutral-900">{rangeStart}</span>
                      <span className="text-neutral-400">–</span>
                      <span className="tabular-nums text-neutral-900">{rangeEnd}</span>
                      <span className="text-neutral-500"> of </span>
                      <span className="tabular-nums font-bold text-pink-800">{totalFiltered}</span>
                      <span className="text-neutral-500">{totalFiltered === 1 ? " video" : " videos"}</span>
                      {totalFiltered !== data.videos.length ? (
                        <span className="ml-1 text-neutral-400">({data.videos.length} in playlist)</span>
                      ) : null}
                    </span>
                    {searchQuery.trim() ? (
                      <span className="text-xs text-neutral-500">
                        Filter: <span className="font-semibold text-neutral-700">{searchQuery.trim()}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedVideoId ? (
                      <button
                        type="button"
                        onClick={() =>
                          playerAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                        className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-800 shadow-sm transition hover:bg-pink-50"
                      >
                        ↑ Back to player
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {totalListPages > 1 ? (
                <VideoLessonsPagination
                  idPrefix="video-lessons-top"
                  listPage={listPage}
                  totalListPages={totalListPages}
                  totalItems={totalFiltered}
                  pageSize={pageSize}
                  onPageSizeChange={handlePageSizeChange}
                  onPrev={() => goToPage(listPage - 1)}
                  onNext={() => goToPage(listPage + 1)}
                  onFirst={() => goToPage(1)}
                  onLast={() => goToPage(totalListPages)}
                  onGoToPage={goToPage}
                  className="mt-5 border-t border-pink-100/90 pt-5"
                />
              ) : null}
            </div>

            {data.videos.length === 0 ? (
              <p className="text-sm text-neutral-600">No videos in this list yet.</p>
            ) : filteredVideos.length === 0 ? (
              <p className="text-sm text-neutral-600">No titles match your search. Clear the filter to see all videos.</p>
            ) : (
              <>
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedVideos.map((v) => {
                    const publishedLabel = formatPublished(v.publishedAt);
                    const isActive = selectedVideoId === v.videoId;
                    return (
                      <li key={v.videoId}>
                        <button
                          type="button"
                          onClick={() => selectVideoFromGrid(v.videoId)}
                          aria-pressed={isActive}
                          aria-label={`Play: ${v.title}`}
                          className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-lg shadow-pink-100/50 ring-1 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
                            isActive
                              ? "border-pink-500 ring-2 ring-pink-400/60"
                              : "border-pink-100/90 ring-pink-50/80 hover:border-pink-300"
                          }`}
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-neutral-900/5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic ytimg hosts */}
                            <img
                              src={v.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-95"
                              loading="lazy"
                            />
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 transition group-hover:opacity-100">
                              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-pink-600 shadow-xl ring-2 ring-white/50">
                                <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </span>
                            </span>
                            {isActive ? (
                              <span className="absolute left-2 top-2 rounded-md bg-pink-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                                Now playing
                              </span>
                            ) : null}
                          </div>
                          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
                            <p className="line-clamp-2 text-sm font-semibold leading-snug text-neutral-900 group-hover:text-pink-900">
                              {v.title}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                              {publishedLabel ? <span className="tabular-nums">{publishedLabel}</span> : null}
                              <span className="font-semibold text-pink-600 group-hover:text-pink-700">Watch here</span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <VideoLessonsPagination
                  idPrefix="video-lessons-bottom"
                  listPage={listPage}
                  totalListPages={totalListPages}
                  totalItems={totalFiltered}
                  pageSize={pageSize}
                  onPageSizeChange={handlePageSizeChange}
                  onPrev={() => goToPage(listPage - 1)}
                  onNext={() => goToPage(listPage + 1)}
                  onFirst={() => goToPage(1)}
                  onLast={() => goToPage(totalListPages)}
                  onGoToPage={goToPage}
                  className="mt-8"
                />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
