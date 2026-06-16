"use client";

import { LessonNotesFullscreen } from "@/components/LessonNotesFullscreen";
import { LessonNotesMarkdown } from "@/components/LessonNotesMarkdown";
import { HeadingWithInfo } from "@/components/InfoTip";
import { createWorkspaceFolder, listWorkspaceFolders } from "@/lib/documents-repo";
import { createCardSet } from "@/lib/flashcards-repo";
import {
  compileFlashcardNotesMarkdown,
  jlptLevelLabel,
  loadLessonDashboardData,
  shortVideoTabLabel,
  suggestedFlashcardSetName,
  suggestedLessonFolderName,
  type LessonDashboardData,
} from "@/lib/lesson-dashboard";
import {
  completeCurrentLesson,
  loadLessonProgress,
  saveLessonProgress,
  type LessonProgress,
} from "@/lib/workspace-lesson-progress";
import { navigateWorkspaceDetail } from "@/lib/workspace-nav";
import { JLPT_YOUTUBE_PLAYLISTS, type JlptPlaylistKey } from "@/lib/youtube-jlpt-playlists";
import { useCallback, useEffect, useMemo, useState } from "react";

function DashboardCard(props: {
  title: string;
  status: string;
  statusTone?: "ok" | "warn" | "muted";
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const tone =
    props.statusTone === "ok"
      ? "text-emerald-700"
      : props.statusTone === "warn"
        ? "text-amber-700"
        : "text-neutral-500";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-pink-100/90 bg-white p-4 shadow-md shadow-pink-100/35 ring-1 ring-pink-50 sm:p-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-pink-700">{props.title}</h3>
        <p className={`mt-2 text-sm font-medium ${tone}`}>{props.status}</p>
        {props.children ? <div className="mt-3">{props.children}</div> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{props.actions}</div>
    </article>
  );
}

type NotesTabId = "flashcards" | string;

const notesTabBtn = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:text-sm ${
    active
      ? "bg-violet-600 text-white shadow-sm"
      : "text-violet-800 hover:bg-violet-100/80"
  }`;

const notesBtnGhost =
  "inline-flex shrink-0 min-h-8 items-center justify-center rounded-full border border-violet-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45";

const btnPrimary =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 text-xs font-bold text-white shadow-sm transition hover:brightness-[1.05] disabled:opacity-45";
const btnGhost =
  "inline-flex min-h-9 items-center justify-center rounded-xl border border-pink-200 bg-white px-4 text-xs font-semibold text-pink-900 shadow-sm transition hover:bg-pink-50 disabled:opacity-45";

type Props = {
  onOpenFlashcardSet: (setId: string) => void;
};

export function WorkspaceLessonDashboard({ onOpenFlashcardSet }: Props) {
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [data, setData] = useState<LessonDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesFullscreen, setNotesFullscreen] = useState(false);
  const [activeNotesTab, setActiveNotesTab] = useState<NotesTabId | null>(null);
  const [jumpValue, setJumpValue] = useState("");

  const reload = useCallback(async (p: LessonProgress) => {
    setLoading(true);
    setError(null);
    try {
      const dash = await loadLessonDashboardData(p.lessonNumber, p.jlptLevel);
      setData(dash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load lesson dashboard.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLessonProgress().then((p) => {
      if (cancelled) return;
      setProgress(p);
      setJumpValue(String(p.lessonNumber));
      void reload(p);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const updateProgress = useCallback(
    async (next: LessonProgress) => {
      setBusy(true);
      try {
        const saved = await saveLessonProgress(next);
        setProgress(saved);
        setJumpValue(String(saved.lessonNumber));
        await reload(saved);
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const openDocuments = useCallback(() => {
    if (!progress || !data) return;
    navigateWorkspaceDetail({
      area: "documents",
      documentsTrail: data.documentsTrail.length ? data.documentsTrail : undefined,
    });
  }, [data, progress]);

  const createLessonFolder = useCallback(async () => {
    if (!progress) return;
    setBusy(true);
    setError(null);
    try {
      let levelId = data?.levelFolder?.id ?? null;
      if (!levelId) {
        const roots = await listWorkspaceFolders(null);
        const existing = roots.find((f) => f.name.toUpperCase().includes(progress.jlptLevel.toUpperCase()));
        if (existing) {
          levelId = existing.id;
        } else {
          levelId = await createWorkspaceFolder(progress.jlptLevel.toUpperCase(), null);
        }
      }
      const lessonId = await createWorkspaceFolder(suggestedLessonFolderName(progress.lessonNumber), levelId);
      const levelName =
        data?.levelFolder?.name ?? progress.jlptLevel.toUpperCase();
      navigateWorkspaceDetail({
        area: "documents",
        documentsTrail: [
          { id: levelId, name: levelName },
          { id: lessonId, name: suggestedLessonFolderName(progress.lessonNumber) },
        ],
      });
      await reload(progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create lesson folder.");
    } finally {
      setBusy(false);
    }
  }, [data, progress, reload]);

  const createFlashcardSet = useCallback(async () => {
    if (!progress) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createCardSet(suggestedFlashcardSetName(progress.lessonNumber));
      onOpenFlashcardSet(id);
      navigateWorkspaceDetail({ area: "flashcards", flashcardSetId: id });
      await reload(progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create flashcard set.");
    } finally {
      setBusy(false);
    }
  }, [onOpenFlashcardSet, progress, reload]);

  const openFlashcards = useCallback(() => {
    if (!data?.flashcardSet) return;
    onOpenFlashcardSet(data.flashcardSet.id);
    navigateWorkspaceDetail({ area: "flashcards", flashcardSetId: data.flashcardSet.id });
  }, [data, onOpenFlashcardSet]);

  const openVideos = useCallback(
    (videoId?: string) => {
      if (!progress) return;
      navigateWorkspaceDetail({
        area: "youtube",
        youtube: {
          jlptKey: progress.jlptLevel,
          lessonNumber: progress.lessonNumber,
          videoId,
        },
      });
    },
    [progress]
  );

  const completeLesson = useCallback(async () => {
    if (!progress) return;
    setBusy(true);
    try {
      const next = await completeCurrentLesson(progress);
      setProgress(next);
      setJumpValue(String(next.lessonNumber));
      await reload(next);
    } finally {
      setBusy(false);
    }
  }, [progress, reload]);

  const applyJump = useCallback(() => {
    if (!progress) return;
    const n = parseInt(jumpValue.trim(), 10);
    if (!Number.isFinite(n) || n < 1) return;
    void updateProgress({ ...progress, lessonNumber: n });
  }, [jumpValue, progress, updateProgress]);

  const lessonNumber = progress?.lessonNumber ?? 1;
  const lessonLabel = `Lesson ${lessonNumber}`;
  const levelLabel = progress ? jlptLevelLabel(progress.jlptLevel) : "";
  const videoNotesCount = data?.lessonNotes.length ?? 0;
  const flashcardNotesCount = data?.flashcardNotes.length ?? 0;
  const hasAnyNotes = videoNotesCount > 0 || flashcardNotesCount > 0;

  const defaultNotesTab = useMemo<NotesTabId>(() => {
    if (data?.lessonNotes[0]) return data.lessonNotes[0].videoId;
    return "flashcards";
  }, [data?.lessonNotes]);

  const effectiveNotesTab = activeNotesTab ?? defaultNotesTab;

  useEffect(() => {
    if (!data) return;
    if (activeNotesTab === "flashcards") return;
    if (activeNotesTab && data.lessonNotes.some((n) => n.videoId === activeNotesTab)) return;
    setActiveNotesTab(defaultNotesTab);
  }, [activeNotesTab, data, defaultNotesTab]);

  const activeVideoNote = useMemo(
    () => data?.lessonNotes.find((n) => n.videoId === effectiveNotesTab) ?? null,
    [data?.lessonNotes, effectiveNotesTab]
  );

  const notesFullscreenContent = useMemo(() => {
    if (!data || !progress) return null;
    if (effectiveNotesTab === "flashcards") {
      const markdown = compileFlashcardNotesMarkdown(progress.lessonNumber, data.flashcardNotes);
      if (!markdown) return null;
      return {
        title: `${lessonLabel} — flashcard notes`,
        markdown,
        metaLine: `${levelLabel} · ${data.flashcardNotes.length} card${data.flashcardNotes.length === 1 ? "" : "s"} with teacher research`,
      };
    }
    if (!activeVideoNote) return null;
    return {
      title: activeVideoNote.videoTitle,
      markdown: activeVideoNote.notes,
      metaLine: `${levelLabel} · Video lesson write-up`,
    };
  }, [activeVideoNote, data, effectiveNotesTab, lessonLabel, levelLabel, progress]);

  const canFullscreenNotes = Boolean(notesFullscreenContent);

  if (!progress) {
    return (
      <p className="text-center text-sm text-neutral-500" aria-live="polite">
        Loading lesson dashboard…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-pink-200/80 bg-gradient-to-br from-pink-50 via-white to-violet-50/40 p-5 shadow-lg shadow-pink-200/25 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-600">Today&apos;s lesson</p>
            <HeadingWithInfo
              className="mt-2"
              infoLabel="Lesson dashboard"
              heading={
                <h2 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">{lessonLabel}</h2>
              }
            >
              <p>
                Your home base for Minna no Nihongo prep. Jump to documents, flashcards, videos, and compiled notes for
                this lesson — then mark it done to move on.
              </p>
            </HeadingWithInfo>
            <p className="mt-2 text-sm text-neutral-600">{levelLabel} · Minna no Nihongo</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">JLPT level</span>
              <select
                value={progress.jlptLevel}
                disabled={busy}
                onChange={(e) => void updateProgress({ ...progress, jlptLevel: e.target.value as JlptPlaylistKey })}
                className="mt-1 block h-10 min-w-[8rem] rounded-xl border border-pink-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/60"
              >
                {JLPT_YOUTUBE_PLAYLISTS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Jump to lesson</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyJump();
                  }}
                  className="h-10 w-16 rounded-xl border border-pink-200 bg-white px-2 text-center text-sm font-semibold shadow-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/60"
                />
                <button type="button" onClick={applyJump} disabled={busy} className={btnGhost}>
                  Go
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-pink-100/80 pt-5">
          <button type="button" disabled={busy} onClick={() => void completeLesson()} className={btnPrimary}>
            Done — next lesson ({progress.lessonNumber + 1})
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500" aria-live="polite">
          Loading lesson resources…
        </p>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardCard
              title="Documents"
              status={
                data.lessonFolder
                  ? data.documentFiles.length
                    ? `${data.documentFiles.length} file${data.documentFiles.length === 1 ? "" : "s"} in ${data.lessonFolder.name}`
                    : `Folder ready — ${data.lessonFolder.name} (no files yet)`
                  : data.levelFolder
                    ? `Open ${data.levelFolder.name} — no Lesson ${progress.lessonNumber} folder yet`
                    : `No ${levelLabel} folder yet`
              }
              statusTone={data.documentFiles.length ? "ok" : data.lessonFolder ? "muted" : "warn"}
              actions={
                <>
                  {data.documentsTrail.length ? (
                    <button type="button" onClick={openDocuments} className={btnGhost}>
                      Open documents
                    </button>
                  ) : null}
                  {!data.lessonFolder ? (
                    <button type="button" disabled={busy} onClick={() => void createLessonFolder()} className={btnPrimary}>
                      Create lesson folder
                    </button>
                  ) : null}
                </>
              }
            >
              {data.documentFiles.length > 0 ? (
                <ul className="space-y-1 text-xs text-neutral-600">
                  {data.documentFiles.slice(0, 4).map((f) => (
                    <li key={f.id} className="truncate">
                      {f.filename}
                    </li>
                  ))}
                  {data.documentFiles.length > 4 ? (
                    <li className="text-neutral-400">+{data.documentFiles.length - 4} more</li>
                  ) : null}
                </ul>
              ) : null}
            </DashboardCard>

            <DashboardCard
              title="Flashcards"
              status={
                data.flashcardSet
                  ? `${data.flashcardSet.card_count ?? 0} card${(data.flashcardSet.card_count ?? 0) === 1 ? "" : "s"} · ${data.flashcardSet.name}`
                  : `No flashcard set for Lesson ${progress.lessonNumber} yet`
              }
              statusTone={data.flashcardSet ? "ok" : "warn"}
              actions={
                data.flashcardSet ? (
                  <button type="button" onClick={openFlashcards} className={btnPrimary}>
                    Open flashcards
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void createFlashcardSet()} className={btnPrimary}>
                    Create flashcards
                  </button>
                )
              }
            />

            <DashboardCard
              title="Video lessons"
              status={
                data.youtubeVideos.length
                  ? `${data.youtubeVideos.length} video${data.youtubeVideos.length === 1 ? "" : "s"} for this lesson`
                  : "No matching videos in the playlist yet"
              }
              statusTone={data.youtubeVideos.length ? "ok" : "warn"}
              actions={
                <button
                  type="button"
                  onClick={() => openVideos(data.youtubeVideos[0]?.videoId)}
                  className={btnGhost}
                  disabled={!data.youtubeVideos.length}
                >
                  Open in Video Lessons
                </button>
              }
            >
              {data.youtubeVideos.length > 0 ? (
                <ul className="space-y-2">
                  {data.youtubeVideos.map((v) => (
                    <li key={v.videoId}>
                      <button
                        type="button"
                        onClick={() => openVideos(v.videoId)}
                        className="text-left text-xs font-medium text-violet-800 underline decoration-violet-300/80 underline-offset-2 hover:text-violet-950"
                      >
                        {v.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </DashboardCard>

            <DashboardCard
              title="Notes"
              status={
                hasAnyNotes
                  ? `${videoNotesCount} video write-up${videoNotesCount === 1 ? "" : "s"} · ${flashcardNotesCount} flashcard note${flashcardNotesCount === 1 ? "" : "s"}`
                  : data.youtubeVideos.length || data.flashcardSet
                    ? "Generate video notes or enrich flashcards to see them here"
                    : "No notes saved for this lesson yet"
              }
              statusTone={hasAnyNotes ? "ok" : "muted"}
              actions={
                <>
                  {canFullscreenNotes ? (
                    <button type="button" onClick={() => setNotesFullscreen(true)} className={btnPrimary}>
                      Fullscreen notes
                    </button>
                  ) : null}
                  {data.flashcardSet ? (
                    <button type="button" onClick={openFlashcards} className={btnGhost}>
                      Open flashcards
                    </button>
                  ) : null}
                  <button type="button" onClick={() => openVideos()} className={btnGhost}>
                    {data.compiledNotes ? "Open videos" : "Go to videos"}
                  </button>
                </>
              }
            />
          </div>

          <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-white to-violet-50/30 shadow-md ring-1 ring-violet-100/70">
            <div className="border-b border-violet-100/90 bg-violet-50/50">
              <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Lesson notes</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">{lessonLabel}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">{levelLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotesFullscreen(true)}
                    disabled={!canFullscreenNotes}
                    className={notesBtnGhost}
                  >
                    Fullscreen
                  </button>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-2xl border border-violet-200/90 bg-white p-1 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="tablist"
                    aria-label="Notes type"
                  >
                    {data.lessonNotes.map((note) => (
                      <button
                        key={note.videoId}
                        type="button"
                        role="tab"
                        aria-selected={effectiveNotesTab === note.videoId}
                        title={note.videoTitle}
                        onClick={() => setActiveNotesTab(note.videoId)}
                        className={notesTabBtn(effectiveNotesTab === note.videoId)}
                      >
                        {shortVideoTabLabel(note.videoTitle)}
                      </button>
                    ))}
                    {data.lessonNotes.length > 0 ? (
                      <span className="mx-0.5 h-5 w-px shrink-0 bg-violet-200" aria-hidden />
                    ) : null}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveNotesTab === "flashcards"}
                      onClick={() => setActiveNotesTab("flashcards")}
                      className={notesTabBtn(effectiveNotesTab === "flashcards")}
                    >
                      Flashcards
                      {flashcardNotesCount > 0 ? (
                        <span className="ml-1.5 tabular-nums opacity-80">({flashcardNotesCount})</span>
                      ) : null}
                    </button>
                  </div>
                </div>

                {activeVideoNote && effectiveNotesTab !== "flashcards" ? (
                  <p className="truncate text-xs text-neutral-500" title={activeVideoNote.videoTitle}>
                    {activeVideoNote.videoTitle}
                  </p>
                ) : effectiveNotesTab === "flashcards" && data.flashcardSet ? (
                  <p className="truncate text-xs text-neutral-500">{data.flashcardSet.name}</p>
                ) : null}
              </div>
            </div>

            <div className="max-h-[min(60vh,36rem)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {effectiveNotesTab !== "flashcards" ? (
                activeVideoNote ? (
                  <LessonNotesMarkdown markdown={activeVideoNote.notes} />
                ) : (
                  <p className="text-sm text-neutral-600">
                    No saved video write-ups for Lesson {progress.lessonNumber} yet. Open{" "}
                    <button
                      type="button"
                      onClick={() => openVideos()}
                      className="font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
                    >
                      Video Lessons
                    </button>{" "}
                    and use <strong className="font-medium text-neutral-800">Generate lesson notes</strong> on the vocab
                    and grammar videos.
                  </p>
                )
              ) : data.flashcardNotes.length > 0 ? (
                <ul className="space-y-4">
                  {data.flashcardNotes.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-violet-100/90 bg-white/80 p-4 shadow-sm sm:p-5"
                    >
                      <h3 className="text-base font-bold text-neutral-900">{item.headline}</h3>
                      {(item.phoneticReading || item.categoryLabel) && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {[item.phoneticReading, item.categoryLabel].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                        {item.teacherResearch}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : data.flashcardSet ? (
                <p className="text-sm text-neutral-600">
                  No teacher notes on flashcards yet. Open{" "}
                  <button
                    type="button"
                    onClick={openFlashcards}
                    className="font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
                  >
                    {data.flashcardSet.name}
                  </button>{" "}
                  and use bulk edit or enrich to add <strong className="font-medium text-neutral-800">teacher research</strong>{" "}
                  per card.
                </p>
              ) : (
                <p className="text-sm text-neutral-600">
                  No flashcard set for Lesson {progress.lessonNumber} yet.{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createFlashcardSet()}
                    className="font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950 disabled:opacity-50"
                  >
                    Create flashcards
                  </button>{" "}
                  first, then add teacher notes per card.
                </p>
              )}
            </div>
          </section>

          <LessonNotesFullscreen
            open={notesFullscreen && Boolean(notesFullscreenContent)}
            videoTitle={notesFullscreenContent?.title ?? lessonLabel}
            markdown={notesFullscreenContent?.markdown ?? ""}
            metaLine={notesFullscreenContent?.metaLine}
            onClose={() => setNotesFullscreen(false)}
          />
        </>
      ) : null}
    </div>
  );
}
