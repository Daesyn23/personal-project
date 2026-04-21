"use client";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emptyCellPayload, type SheetCellPayload } from "@/lib/google-sheets-grid-parse";
import { parseSheetGidFromUrl, parseSpreadsheetId } from "@/lib/parse-spreadsheet-url";
import { sheetCellStyleToCss } from "@/lib/sheet-cell-style-react";
import type { SheetMergeCell } from "@/lib/sheet-merge-localize";
import { normalizeSheetsA1Range, spreadsheetIdLooksIncomplete } from "@/lib/sheets-a1";

const LS_ID = "workspace_google_sheets_spreadsheet_id";
const LS_RANGE = "workspace_google_sheets_range";
/** Cell-only range; sheet tab comes from the dropdown (or explicit 'Name'! in the field). */
const DEFAULT_RANGE = "A1:AA200";

function sheetIdStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_sheet_${spreadsheetId}`;
}

function frozenThroughColStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_frozen_through_${spreadsheetId}`;
}

function colWidthsStorageKey(spreadsheetId: string): string {
  return `workspace_google_sheets_col_widths_${spreadsheetId}`;
}

const MIN_COL_WIDTH_PX = 40;
const MAX_COL_WIDTH_PX = 560;

/** Whole Linked Google Sheet settings header: collapsed or expanded (localStorage so it survives reload after save). */
const LS_LINKED_SECTION_COLLAPSED = "workspace_google_sheets_linked_section_collapsed";
/** Legacy session-only key from older builds — read once to migrate. */
const LS_LINKED_SECTION_LEGACY_SESSION = "workspace_google_sheets_editor_collapsed";
const POLL_MS = 25_000;
const MAX_ROWS = 400;
/** Through column AZ (52 cols); wide grade sheets often need AA–AD. */
const MAX_COLS = 52;

/** Grade % = (x − y) / x × 100, rounded to nearest 0.01 (two decimal places). */
function parseGradeCount(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function computeGradePercentString(totalItems: number, mistakes: number): string | null {
  if (!Number.isFinite(totalItems) || totalItems <= 0) return null;
  if (!Number.isFinite(mistakes) || mistakes < 0 || mistakes > totalItems) return null;
  const pct = ((totalItems - mistakes) / totalItems) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return rounded.toFixed(2);
}

/** A1-style column label (0 → A, 25 → Z, 26 → AA). */
function columnLetterFromIndex(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeRows(values: string[][]): string[][] {
  const cols = values.reduce((m, r) => Math.max(m, r.length), 0);
  return values.map((row) => {
    const next = [...row];
    while (next.length < cols) next.push("");
    return next;
  });
}

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function emptyMetaGrid(rows: number, cols: number): SheetCellPayload[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => emptyCellPayload())
  );
}

function syncMetaToValues(values: string[][], meta: SheetCellPayload[][] | undefined): SheetCellPayload[][] {
  return values.map((row, ri) =>
    row.map((v, ci) => {
      const p = meta?.[ri]?.[ci];
      return p ? { ...p, display: v } : { display: v, baseStyle: null };
    })
  );
}

function buildMergeRenderMask(rows: number, cols: number, merges: SheetMergeCell[]) {
  const covered: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const anchor: (null | { rowSpan: number; colSpan: number })[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );
  for (const m of merges) {
    if (m.r < 0 || m.c < 0 || m.r >= rows || m.c >= cols) continue;
    const rowSpan = Math.min(m.rowspan, rows - m.r);
    const colSpan = Math.min(m.colspan, cols - m.c);
    if (rowSpan < 1 || colSpan < 1) continue;
    if (rowSpan === 1 && colSpan === 1) continue;
    anchor[m.r][m.c] = { rowSpan, colSpan };
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < colSpan; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r2 = m.r + dr;
        const c2 = m.c + dc;
        if (r2 < rows && c2 < cols) covered[r2][c2] = true;
      }
    }
  }
  return { covered, anchor };
}

function SheetDataCell({
  value,
  payload,
  onChange,
  ariaLabel,
  rowSpan = 1,
  colSpan = 1,
  cellRow,
  cellCol,
  isSelected,
  onSelectCell,
  onRequestFreezeMenu,
  stickyLeftPx,
  isLastFrozenColumn,
  rowStripeEven,
}: {
  value: string;
  payload: SheetCellPayload;
  onChange: (v: string) => void;
  ariaLabel: string;
  rowSpan?: number;
  colSpan?: number;
  cellRow: number;
  cellCol: number;
  isSelected: boolean;
  onSelectCell: (r: number, c: number) => void;
  onRequestFreezeMenu: (e: ReactMouseEvent, columnIndex: number) => void;
  stickyLeftPx: number | null;
  isLastFrozenColumn: boolean;
  rowStripeEven: boolean;
}) {
  const base = sheetCellStyleToCss(payload.baseStyle);
  const rich = payload.richSpans && payload.richSpans.length > 0;
  const rs = rowSpan > 1 ? rowSpan : undefined;
  const cs = colSpan > 1 ? colSpan : undefined;
  const select = () => onSelectCell(cellRow, cellCol);
  const ringSelected = isSelected
    ? "z-[2] ring-2 ring-inset ring-pink-600 shadow-[inset_0_0_0_9999px_rgba(253,242,248,0.45)]"
    : "hover:ring-1 hover:ring-inset hover:ring-pink-200/90";

  const fallbackBg = rowStripeEven ? "#ffffff" : "#fff7f8";
  const stickyBg = base.backgroundColor || fallbackBg;

  const stickyStyle: CSSProperties =
    stickyLeftPx != null
      ? {
          position: "sticky",
          left: stickyLeftPx,
          zIndex: 15 + cellCol + (isSelected ? 25 : 0),
          boxShadow: isLastFrozenColumn
            ? "1px 0 0 rgba(0,0,0,0.06), 6px 0 14px -2px rgba(0,0,0,0.12)"
            : undefined,
          backgroundColor: stickyBg,
          backgroundImage: `linear-gradient(${stickyBg}, ${stickyBg})`,
        }
      : {};

  const openFreezeContext = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRequestFreezeMenu(e, cellCol);
  };

  return (
    <td
      rowSpan={rs}
      colSpan={cs}
      title="Left-click to select for grade calculator. Right-click for column freeze."
      className={`relative h-auto min-w-0 max-w-none cursor-pointer overflow-hidden border-b border-r border-neutral-200/70 align-middle px-2 py-1.5 first:border-l first:border-neutral-200/70 ${ringSelected}`}
      style={{
        backgroundColor: stickyLeftPx != null ? "#ffffff" : base.backgroundColor,
        ...stickyStyle,
      }}
      onClick={select}
      onContextMenu={openFreezeContext}
    >
      {rich ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              select();
            }
          }}
          className="min-h-[2.75rem] min-w-0 max-w-full cursor-pointer overflow-hidden rounded-md px-1 py-1.5 text-[13px] leading-snug font-sans [field-sizing:content] outline-none focus-visible:ring-2 focus-visible:ring-pink-400 break-words [overflow-wrap:anywhere]"
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "hidden",
            color: base.color,
            fontSize: base.fontSize,
            fontFamily: base.fontFamily,
            textAlign: base.textAlign,
          }}
          onContextMenu={openFreezeContext}
          title="Click to select this cell for the grade calculator. Mixed styles from Google — edit in Sheets or overwrite from here."
        >
          {payload.richSpans!.map((span, i) => (
            <span key={i} style={sheetCellStyleToCss(span.style)}>
              {span.text}
            </span>
          ))}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            e.stopPropagation();
            select();
          }}
          onContextMenu={openFreezeContext}
          onFocus={select}
          style={{
            ...base,
            backgroundColor: base.backgroundColor ? "transparent" : undefined,
          }}
          className="box-border min-h-[2.75rem] min-w-0 w-full max-w-full cursor-text rounded-md px-2 py-2 text-[13px] font-sans tabular-nums text-neutral-900 outline-none transition [field-sizing:content] placeholder:text-neutral-400 focus:bg-pink-50/40 focus:ring-2 focus:ring-inset focus:ring-pink-400/80"
          aria-label={ariaLabel}
        />
      )}
    </td>
  );
}

export function WorkspaceGoogleSheetSection() {
  const [status, setStatus] = useState<{
    oauthClientConfigured: boolean;
    refreshTokenSet: boolean;
    canQuery: boolean;
  } | null>(null);

  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [values, setValues] = useState<string[][]>([]);
  const [cellMeta, setCellMeta] = useState<SheetCellPayload[][]>([]);
  /** Merged regions from Google (top-left anchor + span); re-clipped when row/col count changes. */
  const [sheetMerges, setSheetMerges] = useState<SheetMergeCell[]>([]);
  const [importFormatting, setImportFormatting] = useState(true);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [lastSaveAt, setLastSaveAt] = useState<Date | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [linkedSectionCollapsed, setLinkedSectionCollapsed] = useState(false);
  const [subtleSync, setSubtleSync] = useState(false);

  const [sheetTabs, setSheetTabs] = useState<{ sheetId: number; title: string; index: number }[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [tabsError, setTabsError] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);

  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const [gradeTotalItems, setGradeTotalItems] = useState("");
  const [gradeMistakes, setGradeMistakes] = useState("");
  const [gradeCalcError, setGradeCalcError] = useState<string | null>(null);

  /** Last column index (0-based) included in horizontal sticky freeze; null = none. */
  const [frozenThroughCol, setFrozenThroughCol] = useState<number | null>(null);
  const tableMeasureRef = useRef<HTMLTableElement>(null);
  /** Column widths (px); drives colgroup + header + sticky left offsets. Filled from DOM when col count changes, then user-resizable. */
  const [columnWidthsPx, setColumnWidthsPx] = useState<number[]>([]);
  const [measureTick, setMeasureTick] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Bumped after reading localStorage so persist effects run with restored URL/range, not initial "". */
  const [browserPrefsReady, setBrowserPrefsReady] = useState(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const spreadsheetId = useMemo(
    () => parseSpreadsheetId(spreadsheetInput),
    [spreadsheetInput]
  );

  const sheetGid = useMemo(
    () => parseSheetGidFromUrl(spreadsheetInput),
    [spreadsheetInput]
  );

  const idLooksIncomplete = Boolean(
    spreadsheetId && spreadsheetIdLooksIncomplete(spreadsheetId)
  );

  const rangeHasSheetName = normalizeSheetsA1Range(range).includes("!");
  /** Prefer explicit picker; fall back to gid in URL until tabs load. */
  const effectiveSheetGid = selectedSheetId ?? sheetGid;
  const needsTabForCells =
    !rangeHasSheetName && Boolean(spreadsheetId) && !idLooksIncomplete;

  const activeSheetTitle = useMemo(() => {
    const gid = selectedSheetId ?? sheetGid;
    if (gid == null) return null;
    return sheetTabs.find((t) => t.sheetId === gid)?.title ?? null;
  }, [sheetTabs, selectedSheetId, sheetGid]);

  const rangeCellsOnly = useMemo(() => {
    const n = normalizeSheetsA1Range(range);
    return n.includes("!") ? (n.split("!")[1] ?? n) : n;
  }, [range]);

  useEffect(() => {
    try {
      const id = localStorage.getItem(LS_ID) ?? "";
      const r = localStorage.getItem(LS_RANGE) ?? DEFAULT_RANGE;
      setSpreadsheetInput(id);
      setRange(r || DEFAULT_RANGE);
      let collapsed = localStorage.getItem(LS_LINKED_SECTION_COLLAPSED);
      if (collapsed == null) {
        const fromSession = sessionStorage.getItem(LS_LINKED_SECTION_COLLAPSED);
        if (fromSession === "1") {
          collapsed = "1";
          try {
            localStorage.setItem(LS_LINKED_SECTION_COLLAPSED, "1");
            sessionStorage.removeItem(LS_LINKED_SECTION_COLLAPSED);
          } catch {
            /* ignore */
          }
        }
      }
      const legacySession = sessionStorage.getItem(LS_LINKED_SECTION_LEGACY_SESSION);
      if (collapsed === "1" || legacySession === "1") {
        setLinkedSectionCollapsed(true);
      }
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      setBrowserPrefsReady(1);
    });
  }, []);

  useEffect(() => {
    if (browserPrefsReady === 0) return;
    try {
      localStorage.setItem(LS_LINKED_SECTION_COLLAPSED, linkedSectionCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [linkedSectionCollapsed, browserPrefsReady]);

  useEffect(() => {
    if (browserPrefsReady === 0) return;
    try {
      if (spreadsheetInput.trim()) localStorage.setItem(LS_ID, spreadsheetInput.trim());
      else localStorage.removeItem(LS_ID);
      if (range.trim()) localStorage.setItem(LS_RANGE, range.trim());
    } catch {
      /* ignore */
    }
  }, [spreadsheetInput, range, browserPrefsReady]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google-sheets/status");
      const data = (await res.json()) as {
        oauthClientConfigured: boolean;
        refreshTokenSet: boolean;
        canQuery: boolean;
      };
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!status?.canQuery || !spreadsheetId || idLooksIncomplete) {
      setSheetTabs([]);
      setSelectedSheetId(null);
      setTabsError(null);
      setTabsLoading(false);
      return;
    }
    let cancelled = false;
    const debounceMs = 400;
    const t = window.setTimeout(() => {
      setTabsLoading(true);
      setTabsError(null);
      setSheetTabs([]);
      setSelectedSheetId(null);
      fetch(`/api/google-sheets/tabs?spreadsheetId=${encodeURIComponent(spreadsheetId)}`)
        .then(async (r) => {
          const data = (await r.json()) as {
            sheets?: { sheetId: number; title: string; index: number }[];
            error?: string;
          };
          if (!r.ok) throw new Error(data.error || "Could not list sheet tabs");
          return data.sheets ?? [];
        })
        .then((tabs) => {
          if (cancelled) return;
          setSheetTabs(tabs);
          const urlGid = parseSheetGidFromUrl(spreadsheetInput);
          let saved: number | null = null;
          try {
            const raw = localStorage.getItem(sheetIdStorageKey(spreadsheetId));
            if (raw != null) {
              const n = parseInt(raw, 10);
              if (Number.isFinite(n)) saved = n;
            }
          } catch {
            /* ignore */
          }
          setSelectedSheetId(() => {
            if (urlGid != null && tabs.some((x) => x.sheetId === urlGid)) return urlGid;
            if (saved != null && tabs.some((x) => x.sheetId === saved)) return saved;
            return null;
          });
        })
        .catch((e) => {
          if (!cancelled) setTabsError(e instanceof Error ? e.message : "Failed to load tabs");
        })
        .finally(() => {
          if (!cancelled) setTabsLoading(false);
        });
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [spreadsheetId, status?.canQuery, idLooksIncomplete, spreadsheetInput]);

  const loadFromServer = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!spreadsheetId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      else setSubtleSync(true);
      setError(null);
      setFormatWarning(null);
      try {
        const rangeUsed = rangeRef.current.trim() || DEFAULT_RANGE;
        const norm = normalizeSheetsA1Range(rangeUsed);
        const needsGid = !norm.includes("!");
        const gid = selectedSheetId ?? sheetGid;
        if (needsGid && gid == null) {
          throw new Error(
            "Choose a sheet tab in the dropdown, or put the tab in the range (e.g. 'Quiz new'!A1:AA200)."
          );
        }
        const q = new URLSearchParams({
          spreadsheetId,
          range: rangeUsed,
          includeFormat: importFormatting ? "true" : "false",
        });
        if (needsGid && gid != null) q.set("gid", String(gid));
        const res = await fetch(`/api/google-sheets/values?${q.toString()}`);
        const text = await res.text();
        let data: {
          values?: string[][];
          cells?: SheetCellPayload[][];
          merges?: SheetMergeCell[];
          error?: string;
          formatFallback?: boolean;
          formatError?: string;
        };
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          const preview = text.replace(/\s+/g, " ").trim().slice(0, 120);
          throw new Error(
            preview.startsWith("<") || preview.startsWith("Internal")
              ? "Server error (non-JSON response). Check the terminal running npm run dev."
              : `Invalid response: ${preview}`
          );
        }
        if (!res.ok) {
          throw new Error(data.error || "Could not load sheet");
        }
        const raw = data.values ?? [];
        const capped = raw.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLS));
        const grid = capped.length ? normalizeRows(capped) : emptyGrid(1, 6);
        setValues(grid);
        if (data.formatFallback && data.formatError) {
          setFormatWarning(data.formatError);
        }
        if (importFormatting && data.cells?.length) {
          const sliced = data.cells
            .slice(0, MAX_ROWS)
            .map((row) => row.slice(0, MAX_COLS));
          setCellMeta(syncMetaToValues(grid, sliced));
        } else {
          setCellMeta(syncMetaToValues(grid, undefined));
        }
        setSheetMerges(
          data.formatFallback || !Array.isArray(data.merges) ? [] : data.merges
        );
        setSelectedCell(null);
        setLastSynced(new Date());
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
        setSheetMerges([]);
      } finally {
        setLoading(false);
        setSubtleSync(false);
      }
    },
    [spreadsheetId, selectedSheetId, sheetGid, importFormatting]
  );

  useEffect(() => {
    if (!status?.canQuery || !spreadsheetId) return;
    const norm = normalizeSheetsA1Range(rangeRef.current.trim() || DEFAULT_RANGE);
    const needsGid = !norm.includes("!");
    const gid = selectedSheetId ?? sheetGid;
    if (needsGid && gid == null) return;
    if (needsGid && tabsLoading) return;
    void loadFromServer({ silent: false });
  }, [
    status?.canQuery,
    spreadsheetId,
    selectedSheetId,
    sheetGid,
    tabsLoading,
    loadFromServer,
  ]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!status?.canQuery || !spreadsheetId) return;

    pollRef.current = setInterval(() => {
      if (dirtyRef.current) return;
      const norm = normalizeSheetsA1Range(rangeRef.current.trim() || DEFAULT_RANGE);
      const needsGid = !norm.includes("!");
      if (needsGid && selectedSheetId == null && sheetGid == null) return;
      void loadFromServer({ silent: true });
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status?.canQuery, spreadsheetId, loadFromServer, selectedSheetId, sheetGid]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!status?.canQuery || !spreadsheetId || dirtyRef.current) return;
      const norm = normalizeSheetsA1Range(rangeRef.current.trim() || DEFAULT_RANGE);
      const needsGid = !norm.includes("!");
      if (needsGid && selectedSheetId == null && sheetGid == null) return;
      void loadFromServer({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status?.canQuery, spreadsheetId, loadFromServer, selectedSheetId, sheetGid]);

  const colCount = values.length ? values[0].length : 0;
  const rowCount = values.length;

  const showWorksheetGrid = Boolean(
    status?.canQuery &&
      spreadsheetId &&
      !idLooksIncomplete &&
      (!needsTabForCells || effectiveSheetGid != null) &&
      (values.length > 0 || loading)
  );

  const mergeMask = useMemo(
    () => buildMergeRenderMask(rowCount, colCount, sheetMerges),
    [rowCount, colCount, sheetMerges]
  );

  const gradePreview = useMemo(() => {
    const x = parseGradeCount(gradeTotalItems);
    const y = parseGradeCount(gradeMistakes);
    if (x == null || y == null) return null;
    return computeGradePercentString(x, y);
  }, [gradeTotalItems, gradeMistakes]);

  const handleSelectCell = useCallback((r: number, c: number) => {
    setSelectedCell({ r, c });
    setGradeCalcError(null);
  }, []);

  const [freezeColumnMenu, setFreezeColumnMenu] = useState<{
    x: number;
    y: number;
    col: number;
  } | null>(null);
  const freezeColumnMenuRef = useRef<HTMLDivElement>(null);

  const openFreezeColumnMenu = useCallback((e: ReactMouseEvent, col: number) => {
    setFreezeColumnMenu({ x: e.clientX, y: e.clientY, col });
  }, []);

  useEffect(() => {
    if (!freezeColumnMenu) return;
    const onDown = (ev: globalThis.MouseEvent) => {
      if (freezeColumnMenuRef.current?.contains(ev.target as Node)) return;
      setFreezeColumnMenu(null);
    };
    const onEsc = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") setFreezeColumnMenu(null);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onEsc, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onEsc, true);
    };
  }, [freezeColumnMenu]);

  const freezeMenuLayout = useMemo(() => {
    if (!freezeColumnMenu || typeof window === "undefined") return null;
    const w = 280;
    const h = 120;
    return {
      left: Math.max(8, Math.min(freezeColumnMenu.x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(freezeColumnMenu.y, window.innerHeight - h - 8)),
      colLetter: columnLetterFromIndex(freezeColumnMenu.col),
      colIndex: freezeColumnMenu.col,
    };
  }, [freezeColumnMenu]);

  useEffect(() => {
    setSelectedCell((prev) => {
      if (!prev) return null;
      if (prev.r >= rowCount || prev.c >= colCount) return null;
      return prev;
    });
  }, [rowCount, colCount]);

  useEffect(() => {
    setFrozenThroughCol((prev) => {
      if (prev == null) return null;
      if (colCount === 0) return null;
      if (prev >= colCount) return colCount - 1;
      return prev;
    });
  }, [colCount]);

  useEffect(() => {
    if (!spreadsheetId) {
      setFrozenThroughCol(null);
      return;
    }
    try {
      const raw = localStorage.getItem(frozenThroughColStorageKey(spreadsheetId));
      if (raw == null || raw === "") {
        setFrozenThroughCol(null);
        return;
      }
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) setFrozenThroughCol(n);
    } catch {
      /* ignore */
    }
  }, [spreadsheetId]);

  useEffect(() => {
    if (!spreadsheetId) return;
    try {
      if (frozenThroughCol == null) {
        localStorage.removeItem(frozenThroughColStorageKey(spreadsheetId));
      } else {
        localStorage.setItem(frozenThroughColStorageKey(spreadsheetId), String(frozenThroughCol));
      }
    } catch {
      /* ignore */
    }
  }, [spreadsheetId, frozenThroughCol]);

  useEffect(() => {
    const onResize = () => setMeasureTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const table = tableMeasureRef.current;
    if (!table || colCount === 0) {
      setColumnWidthsPx([]);
      return;
    }
    const run = () => {
      const tr = table.tBodies[0]?.rows[0] ?? null;
      if (!tr) {
        setColumnWidthsPx([]);
        return;
      }
      const widths: number[] = [];
      tr.querySelectorAll("td").forEach((cell) => {
        const el = cell as HTMLTableCellElement;
        const w = el.getBoundingClientRect().width;
        const cs = el.colSpan || 1;
        const each = w / cs;
        for (let j = 0; j < cs; j++) widths.push(each);
      });
      while (widths.length < colCount) widths.push(72);
      const mw = widths
        .slice(0, colCount)
        .map((w) => Math.min(MAX_COL_WIDTH_PX, Math.max(MIN_COL_WIDTH_PX, w)));

      setColumnWidthsPx((prev) => {
        if (prev.length !== colCount) return mw;
        return prev;
      });
    };
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [values, colCount, rowCount, frozenThroughCol, sheetMerges, measureTick]);

  const colStickyLeftPx = useMemo(() => {
    if (colCount === 0 || columnWidthsPx.length !== colCount) return [];
    const lefts: number[] = [];
    let acc = 0;
    for (let c = 0; c < colCount; c++) {
      lefts.push(acc);
      acc += columnWidthsPx[c] ?? 0;
    }
    return lefts;
  }, [columnWidthsPx, colCount]);

  const tableBodyWidthPx = useMemo(() => {
    if (columnWidthsPx.length !== colCount) return 0;
    return columnWidthsPx.reduce((s, w) => s + w, 0);
  }, [columnWidthsPx, colCount]);

  /** Alias for readability in markup (same as `columnWidthsPx`). */
  const colWidthsPx = columnWidthsPx;

  useEffect(() => {
    if (!spreadsheetId) return;
    try {
      const raw = localStorage.getItem(colWidthsStorageKey(spreadsheetId));
      if (!raw) return;
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return;
      const nums = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return;
      setColumnWidthsPx((prev) => {
        if (colCount > 0 && nums.length === colCount) {
          return nums.map((n) => Math.min(MAX_COL_WIDTH_PX, Math.max(MIN_COL_WIDTH_PX, n)));
        }
        return prev;
      });
    } catch {
      /* ignore */
    }
  }, [spreadsheetId, colCount]);

  useEffect(() => {
    if (!spreadsheetId || columnWidthsPx.length === 0 || columnWidthsPx.length !== colCount) return;
    try {
      localStorage.setItem(colWidthsStorageKey(spreadsheetId), JSON.stringify(columnWidthsPx));
    } catch {
      /* ignore */
    }
  }, [spreadsheetId, columnWidthsPx, colCount]);

  const onColumnResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, colIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (columnWidthsPx.length !== colCount) return;
      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startW = columnWidthsPx[colIndex] ?? 72;
      el.setPointerCapture(pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const nextW = Math.min(MAX_COL_WIDTH_PX, Math.max(MIN_COL_WIDTH_PX, startW + dx));
        setColumnWidthsPx((prev) => {
          if (prev.length !== colCount) return prev;
          const next = [...prev];
          if (next[colIndex] === nextW) return prev;
          next[colIndex] = nextW;
          return next;
        });
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [columnWidthsPx, colCount]
  );

  const setCell = (r: number, c: number, v: string) => {
    setValues((prev) => {
      const next = prev.map((row) => [...row]);
      if (!next[r]) return prev;
      const row = [...next[r]];
      row[c] = v;
      next[r] = row;
      return next;
    });
    setCellMeta((prev) => {
      if (!prev[r]) return prev;
      const next = prev.map((row) => [...row]);
      const cur = prev[r]?.[c];
      next[r][c] = { display: v, baseStyle: cur?.baseStyle ?? null };
      return next;
    });
    setDirty(true);
  };

  const applyGradeToSelectedCell = () => {
    if (selectedCell == null) {
      setGradeCalcError("Click a cell in the Spreadsheet section above to select it, then save.");
      return;
    }
    const x = parseGradeCount(gradeTotalItems);
    const y = parseGradeCount(gradeMistakes);
    if (x == null || y == null) {
      setGradeCalcError("Enter total items (x) and mistakes (y) as numbers.");
      return;
    }
    const pct = computeGradePercentString(x, y);
    if (pct == null) {
      setGradeCalcError("Need x > 0 and 0 ≤ y ≤ x.");
      return;
    }
    setGradeCalcError(null);
    setCell(selectedCell.r, selectedCell.c, pct);
  };

  const addRow = () => {
    setValues((prev) => {
      const cols = prev.length ? prev[0].length : 6;
      return [...prev, Array.from({ length: cols }, () => "")];
    });
    setCellMeta((prev) => {
      const cols = prev.length ? prev[0].length : 6;
      return [...prev, Array.from({ length: cols }, () => emptyCellPayload())];
    });
    setDirty(true);
  };

  const addColumn = () => {
    setValues((prev) => {
      if (prev.length === 0) return emptyGrid(1, 1);
      return prev.map((row) => [...row, ""]);
    });
    setCellMeta((prev) => {
      if (prev.length === 0) return emptyMetaGrid(1, 1);
      return prev.map((row) => [...row, emptyCellPayload()]);
    });
    setDirty(true);
  };

  const removeLastRow = () => {
    if (values.length <= 1) return;
    setValues((prev) => prev.slice(0, -1));
    setCellMeta((prev) => prev.slice(0, -1));
    setDirty(true);
  };

  const removeLastColumn = () => {
    if (colCount <= 1) return;
    setValues((prev) => prev.map((row) => row.slice(0, -1)));
    setCellMeta((prev) => prev.map((row) => row.slice(0, -1)));
    setDirty(true);
  };

  const saveToGoogle = async () => {
    if (!spreadsheetId) return;
    setSaving(true);
    setError(null);
    try {
      const norm = normalizeSheetsA1Range(range.trim() || DEFAULT_RANGE);
      const needsGid = !norm.includes("!");
      const gid = selectedSheetId ?? sheetGid;
      const res = await fetch("/api/google-sheets/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId,
          range: range.trim() || DEFAULT_RANGE,
          values,
          ...(needsGid && gid != null ? { gid } : {}),
        }),
      });
      const text = await res.text();
      let data: { error?: string };
      try {
        data = JSON.parse(text) as { error?: string };
      } catch {
        throw new Error(
          text.trim().startsWith("<") || text.includes("Internal Server")
            ? "Server error while saving. Check the terminal running npm run dev."
            : "Save failed: invalid response from server."
        );
      }
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDirty(false);
      setLastSynced(new Date());
      setLastSaveAt(new Date());
      setLinkedSectionCollapsed(true);
      setSaveFlash(true);
      window.setTimeout(() => setSaveFlash(false), 2800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = () => {
    if (dirty) {
      if (!window.confirm("You have unsaved edits. Discard them and reload from Google Sheets?")) {
        return;
      }
    }
    void loadFromServer({ silent: false });
  };

  const openGid = selectedSheetId ?? sheetGid;
  const sheetUrl = spreadsheetId
    ? openGid != null
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${openGid}`
      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;

  const btnGhost =
    "rounded-xl border border-pink-200/90 bg-white/90 px-3.5 py-2 text-xs font-semibold text-pink-900 shadow-sm shadow-pink-100/40 transition hover:border-pink-300 hover:bg-pink-50/90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";
  const btnNeutral =
    "rounded-xl border border-neutral-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div
        className={`relative overflow-hidden rounded-2xl border border-pink-200/60 bg-white/95 shadow-lg shadow-pink-200/25 ring-1 ring-pink-100/50 transition-shadow ${saveFlash ? "shadow-emerald-100/30 ring-2 ring-emerald-400/70" : ""}`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-400 via-pink-500 to-fuchsia-400 opacity-90"
          aria-hidden
        />

        <div className="border-b border-pink-100/80 bg-gradient-to-br from-rose-50/80 via-white to-pink-50/40 px-5 pb-4 pt-6 sm:px-7 sm:pt-7">
          <button
            type="button"
            onClick={() => setLinkedSectionCollapsed((c) => !c)}
            className="flex w-full min-w-0 items-start gap-3 rounded-xl p-1 text-left transition hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
            aria-expanded={!linkedSectionCollapsed}
          >
            <span
              className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pink-200/80 bg-white text-pink-600 shadow-sm transition-transform duration-200 ${linkedSectionCollapsed ? "" : "rotate-90"}`}
              aria-hidden
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-pink-600/90">Google Sheets</span>
              <h2 className="mt-0.5 bg-gradient-to-r from-pink-700 via-rose-600 to-pink-600 bg-clip-text text-xl font-bold tracking-tight text-transparent sm:text-2xl">
                Linked Google Sheet
              </h2>
              {linkedSectionCollapsed ? (
                <p className="mt-2 text-sm leading-snug text-neutral-600">
                  {spreadsheetId ? (
                    <>
                      <span className="font-medium text-neutral-800">{activeSheetTitle ?? "Sheet"}</span>
                      <span className="text-neutral-400"> · </span>
                      <span className="font-mono text-xs text-pink-900">{rangeCellsOnly}</span>
                      {values.length > 0 && (
                        <>
                          <span className="text-neutral-400"> · </span>
                          {rowCount}×{colCount}
                        </>
                      )}
                      {dirty && <span className="font-semibold text-amber-700"> · Unsaved edits</span>}
                      {lastSaveAt && (
                        <span className="text-emerald-700">
                          {" "}
                          · Saved {lastSaveAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-neutral-500">
                        Click to expand Google Sheet connection settings.
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-500">Paste a spreadsheet link — click to expand.</span>
                  )}
                </p>
              ) : (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
                  Paste your link, pick a tab, and edit in the workspace. Changes sync to Google when you save.
                  Auto-refresh every {POLL_MS / 1000}s when there are no unsaved edits.
                </p>
              )}
            </span>
          </button>
        </div>

        <div
          className={`grid min-w-0 transition-[grid-template-rows] duration-300 ease-out ${linkedSectionCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="min-w-0 space-y-5 px-5 pb-7 pt-5 sm:px-7">
        {status && !status.oauthClientConfigured && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            Add <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_SECRET</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code>, then open{" "}
            <a className="font-semibold text-pink-700 underline" href="/api/google-sheets/auth">
              Connect Google
            </a>{" "}
            and paste <code className="rounded bg-amber-100 px-1">GOOGLE_REFRESH_TOKEN</code> from the result page.
          </p>
        )}

        {status?.oauthClientConfigured && !status.refreshTokenSet && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            Open{" "}
            <a className="font-semibold text-pink-700 underline" href="/api/google-sheets/auth">
              Connect Google
            </a>{" "}
            in this browser, approve access, then add <code className="rounded bg-amber-100 px-1">GOOGLE_REFRESH_TOKEN</code>{" "}
            to <code className="rounded bg-amber-100 px-1">.env.local</code> and restart the dev server.
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-800">
            Spreadsheet URL or ID
            <input
              type="text"
              value={spreadsheetInput}
              onChange={(e) => setSpreadsheetInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border border-pink-100 bg-white px-3 py-2.5 font-mono text-xs text-neutral-900 shadow-inner outline-none ring-pink-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-200 sm:text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              Saved automatically in this browser (localStorage) when you change the link or clear it.
            </span>
            {idLooksIncomplete && (
              <span className="mt-1 block text-xs font-medium text-amber-800">
                This ID looks cut off. Copy the full URL from the address bar (the part after{" "}
                <code className="rounded bg-amber-100 px-1">/d/</code> is usually ~44 characters).
              </span>
            )}
          </label>
          <label className="block text-sm font-medium text-neutral-800">
            Range (A1 notation)
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              onBlur={() => setRange((r) => normalizeSheetsA1Range(r))}
              placeholder={DEFAULT_RANGE}
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border border-pink-100 bg-white px-3 py-2.5 font-mono text-sm text-neutral-900 shadow-inner outline-none ring-pink-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-200"
            />
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              For ranges like <code className="rounded bg-pink-50 px-1">A1:AA200</code>, pick the sheet in the dropdown
              below. Or include the tab in the range, e.g.{" "}
              <code className="rounded bg-pink-50 px-1 text-[11px]">{"'Quiz new'!A1:AA200"}</code>.
            </span>
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-800">
            Sheet tab
            <select
              value={selectedSheetId == null ? "" : String(selectedSheetId)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setSelectedSheetId(null);
                  return;
                }
                const n = parseInt(v, 10);
                if (!Number.isFinite(n)) return;
                setSelectedSheetId(n);
                try {
                  if (spreadsheetId) {
                    localStorage.setItem(sheetIdStorageKey(spreadsheetId), String(n));
                  }
                } catch {
                  /* ignore */
                }
              }}
              disabled={!spreadsheetId || tabsLoading || sheetTabs.length === 0}
              className="mt-1.5 w-full max-w-xl rounded-xl border border-pink-100 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900 shadow-inner outline-none ring-pink-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {tabsLoading ? "Loading tabs…" : "Choose a sheet tab…"}
              </option>
              {sheetTabs.map((t) => (
                <option key={t.sheetId} value={String(t.sheetId)}>
                  {t.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              Required when the range is only cells (no tab name). Your choice is saved for this spreadsheet.
            </span>
            {tabsError && (
              <p className="mt-2 text-xs font-medium text-red-600" role="alert">
                {tabsError}
              </p>
            )}
          </label>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={importFormatting}
            onChange={(e) => setImportFormatting(e.target.checked)}
            className="h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500"
          />
          <span>
            Import cell formatting (background, text style, alignment). Includes{" "}
            <strong className="font-semibold text-neutral-800">conditional formatting</strong> as rendered in Google
            Sheets. Slightly larger API response.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={
              !status?.canQuery ||
              !spreadsheetId ||
              loading ||
              tabsLoading ||
              (needsTabForCells && effectiveSheetGid == null)
            }
            onClick={() => void loadFromServer({ silent: false })}
            className={btnGhost}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            disabled={
              !status?.canQuery ||
              !spreadsheetId ||
              saving ||
              values.length === 0 ||
              (needsTabForCells && effectiveSheetGid == null)
            }
            onClick={() => void saveToGoogle()}
            className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-pink-300/40 transition hover:from-pink-700 hover:to-rose-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:from-pink-600 disabled:hover:to-rose-600"
          >
            {saving ? "Saving…" : "Save to Google Sheet"}
          </button>
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className={`${btnNeutral} inline-flex items-center gap-1.5 px-4 py-2.5 text-sm`}
            >
              Open in Sheets
            </a>
          )}
          <a
            href="/api/google-sheets/auth"
            className={`${btnNeutral} inline-flex px-4 py-2.5 text-sm font-medium text-neutral-600`}
          >
            Connect Google
          </a>
        </div>

        {error && (
          <p className="mt-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        {formatWarning && !error && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950" role="status">
            Showing values only (formatting could not be loaded). {formatWarning}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          {loading && spreadsheetId && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-pink-800">
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"
                aria-hidden
              />
              Loading sheet…
            </span>
          )}
          {lastSynced && (
            <span>
              Last synced: {lastSynced.toLocaleString()}
              {subtleSync && " · checking…"}
            </span>
          )}
          {dirty && <span className="font-semibold text-amber-700">Unsaved edits</span>}
          {spreadsheetInput.trim().length > 0 && !spreadsheetId && (
            <span className="text-red-600">Could not parse spreadsheet ID from that text.</span>
          )}
        </div>
            </div>
          </div>
        </div>
      </div>

      {showWorksheetGrid && (
        <div className="relative min-w-0 max-w-full overflow-clip rounded-2xl border border-neutral-200/80 bg-white shadow-lg shadow-neutral-200/30 ring-1 ring-pink-100/40">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-pink-400 via-rose-400 to-fuchsia-400 opacity-80" aria-hidden />
          <div className="border-b border-neutral-100/95 bg-gradient-to-r from-neutral-50/90 to-white px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Spreadsheet</p>
                <h3 className="mt-0.5 text-lg font-bold text-neutral-900">Worksheet grid</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  {loading && values.length === 0 ? (
                    <span className="inline-flex items-center gap-2 font-medium text-pink-800">
                      <span
                        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-pink-200 border-t-pink-600"
                        aria-hidden
                      />
                      Loading cells from Google…
                    </span>
                  ) : (
                    <>
                      <span className="font-medium text-neutral-800">{activeSheetTitle ?? "Sheet"}</span>
                      <span className="text-neutral-400"> · </span>
                      <span className="font-mono text-xs text-pink-900">{rangeCellsOnly}</span>
                      <span className="text-neutral-400"> · </span>
                      {rowCount}×{colCount}
                      {sheetMerges.length > 0 && (
                        <span className="text-neutral-500"> · {sheetMerges.length} merged region(s)</span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={
                  saving ||
                  loading ||
                  values.length === 0 ||
                  (needsTabForCells && effectiveSheetGid == null)
                }
                onClick={() => void saveToGoogle()}
                className="shrink-0 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-pink-300/35 transition hover:from-pink-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={addRow} disabled={loading} className={btnGhost}>
                Add row
              </button>
              <button type="button" onClick={addColumn} disabled={loading} className={btnGhost}>
                Add column
              </button>
              <button type="button" onClick={removeLastRow} disabled={loading || rowCount <= 1} className={btnNeutral}>
                Remove last row
              </button>
              <button type="button" onClick={removeLastColumn} disabled={loading || colCount <= 1} className={btnNeutral}>
                Remove last column
              </button>
              <button type="button" onClick={onRefresh} disabled={loading} className={btnNeutral}>
                Reload from sheet
              </button>
            </div>
          </div>

          <div className="relative min-h-0 w-full">
            {loading && values.length > 0 && (
              <div
                className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[1px]"
                role="status"
                aria-live="polite"
                aria-label="Loading spreadsheet"
              >
                <span
                  className="h-11 w-11 animate-spin rounded-full border-[3px] border-pink-100 border-t-pink-600"
                  aria-hidden
                />
                <p className="text-sm font-semibold text-neutral-800">Refreshing from Google…</p>
              </div>
            )}

            {values.length === 0 && loading ? (
              <div className="flex min-h-[min(52vh,520px)] flex-col items-center justify-center gap-4 border-t border-neutral-200/80 bg-gradient-to-b from-neutral-50/90 to-white px-6 py-16">
                <span
                  className="h-12 w-12 animate-spin rounded-full border-[3px] border-pink-100 border-t-pink-600"
                  aria-hidden
                />
                <p className="text-center text-base font-semibold text-neutral-800">Loading spreadsheet…</p>
                <p className="max-w-md text-center text-sm text-neutral-600">
                  Pulling range <span className="font-mono text-pink-900">{rangeCellsOnly}</span>
                  {activeSheetTitle ? (
                    <>
                      {" "}
                      from <span className="font-medium text-neutral-800">{activeSheetTitle}</span>
                    </>
                  ) : null}
                  .
                </p>
                <div className="mt-4 w-full max-w-md space-y-2" aria-hidden>
                  <div className="h-2 animate-pulse rounded-full bg-pink-100/80" />
                  <div className="h-2 w-[92%] animate-pulse rounded-full bg-pink-50/90" />
                  <div className="h-2 w-[78%] animate-pulse rounded-full bg-pink-50/80" />
                </div>
              </div>
            ) : (
          <div className="flex h-[min(72vh,640px)] min-h-0 w-full min-w-0 max-w-full flex-col border-t border-neutral-200/80 bg-white isolate [-webkit-overflow-scrolling:touch]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
              {/*
                Outer grid uses a fixed h-[min(72vh,640px)] so this flex-1 child fills it; inner overflow-auto then scrolls vertically.
              */}
              <div className="min-h-0 flex-1 overflow-auto overscroll-x-contain overscroll-y-contain bg-white [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                {colCount > 0 && (
                  <div className="sticky top-0 z-[500] isolate border-b border-neutral-200/80 bg-neutral-100">
                    <div
                      className="flex min-w-full bg-neutral-100"
                      style={
                        tableBodyWidthPx > 0
                          ? { width: `${tableBodyWidthPx}px`, minWidth: "100%" }
                          : { minWidth: "100%" }
                      }
                    >
                      {Array.from({ length: colCount }, (_, ci) => {
                        const w = colWidthsPx[ci] ?? 72;
                        const canStick = colStickyLeftPx.length >= colCount;
                        const inFrozen =
                          frozenThroughCol != null && ci <= frozenThroughCol && canStick;
                        const cellStyle: CSSProperties = {
                          width: w,
                          minWidth: w,
                          maxWidth: w,
                          flex: "0 0 auto",
                          backgroundColor: inFrozen ? "#e5e5e5" : "#f5f5f5",
                          ...(inFrozen
                            ? {
                                position: "sticky",
                                left: colStickyLeftPx[ci] ?? 0,
                                zIndex: 60 + ci,
                                boxShadow:
                                  frozenThroughCol === ci
                                    ? "1px 0 0 rgba(0,0,0,0.06), 6px 0 14px -2px rgba(0,0,0,0.12)"
                                    : undefined,
                              }
                            : {}),
                        };
                        return (
                          <div
                            key={ci}
                            role="columnheader"
                            className="relative box-border overflow-hidden border-t border-b border-r border-neutral-200/80 bg-clip-padding px-2 py-1.5 text-center first:border-l first:border-neutral-200/80"
                            style={cellStyle}
                          >
                            <span
                              className={`inline-flex min-h-[1.75rem] min-w-[2rem] cursor-[context-menu] select-none items-center justify-center rounded-md px-2 py-1 font-mono text-[11px] font-bold ${
                                frozenThroughCol === ci
                                  ? "bg-pink-600 text-white shadow-sm"
                                  : "text-neutral-700"
                              }`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openFreezeColumnMenu(e, ci);
                              }}
                              title={`Column ${columnLetterFromIndex(ci)} — right-click to freeze; drag right edge to resize`}
                            >
                              {columnLetterFromIndex(ci)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Resize column ${columnLetterFromIndex(ci)}`}
                              title="Drag to resize column"
                              className="absolute bottom-0 right-0 top-0 z-[80] w-2 translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 hover:bg-pink-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                              onPointerDown={(ev) => onColumnResizePointerDown(ev, ci)}
                              onClick={(ev) => ev.preventDefault()}
                              onContextMenu={(ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <table
                  ref={tableMeasureRef}
                  className="min-w-full border-separate border-spacing-0 text-sm"
                  style={
                    tableBodyWidthPx > 0 && colWidthsPx.length === colCount
                      ? {
                          width: tableBodyWidthPx,
                          minWidth: "100%",
                          tableLayout: "fixed",
                        }
                      : { minWidth: "100%" }
                  }
                >
                  {colWidthsPx.length === colCount && (
                    <colgroup>
                      {colWidthsPx.map((w, i) => (
                        <col key={i} style={{ width: `${w}px` }} />
                      ))}
                    </colgroup>
                  )}
                  <tbody>
                {values.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`transition-colors ${ri % 2 === 0 ? "bg-white" : "bg-rose-50/[0.35]"}`}
                  >
                    {row.map((cell, ci) => {
                      if (mergeMask.covered[ri]?.[ci]) return null;
                      const span = mergeMask.anchor[ri]?.[ci];
                      const canStick = colStickyLeftPx.length >= colCount;
                      const cellColSpan = span?.colSpan ?? 1;
                      /** A merged cell that extends past the frozen range would pin a wide banner across the viewport — let it scroll naturally. */
                      const mergeExtendsBeyondFrozen =
                        frozenThroughCol != null && ci + cellColSpan - 1 > frozenThroughCol;
                      const inFrozen =
                        frozenThroughCol != null &&
                        ci <= frozenThroughCol &&
                        canStick &&
                        !mergeExtendsBeyondFrozen;
                      const sl = inFrozen ? colStickyLeftPx[ci] ?? 0 : null;
                      return (
                        <SheetDataCell
                          key={`${ri}-${ci}`}
                          rowSpan={span?.rowSpan ?? 1}
                          colSpan={span?.colSpan ?? 1}
                          cellRow={ri}
                          cellCol={ci}
                          isSelected={selectedCell?.r === ri && selectedCell?.c === ci}
                          onSelectCell={handleSelectCell}
                          onRequestFreezeMenu={openFreezeColumnMenu}
                          stickyLeftPx={inFrozen ? sl : null}
                          isLastFrozenColumn={Boolean(inFrozen && frozenThroughCol === ci)}
                          rowStripeEven={ri % 2 === 0}
                          value={cell}
                          payload={
                            cellMeta[ri]?.[ci] ?? {
                              display: cell,
                              baseStyle: null,
                            }
                          }
                          onChange={(v) => setCell(ri, ci, v)}
                          ariaLabel={`Row ${ri + 1} column ${ci + 1}`}
                        />
                      );
                    })}
                  </tr>
                ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
            )}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-pink-200/80 bg-white/95 shadow-lg shadow-pink-200/30 ring-1 ring-pink-100/50">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-400 via-pink-500 to-fuchsia-400 opacity-90"
          aria-hidden
        />
        <div className="border-b border-pink-100/90 bg-gradient-to-br from-rose-50/95 via-white to-pink-50/60 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-600/90">Calculator</p>
          <h3 className="mt-0.5 bg-gradient-to-r from-pink-700 via-rose-600 to-pink-600 bg-clip-text text-lg font-bold tracking-tight text-transparent">
            Grade calculator
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-600">
            Percent score ={" "}
            <code className="rounded bg-pink-50/90 px-1.5 py-0.5 font-mono text-[11px] text-pink-900 shadow-sm ring-1 ring-pink-100/80">
              (x − y) / x × 100
            </code>
            , rounded to the nearest hundredth (two decimals).{" "}
            <span className="font-medium text-neutral-800">x</span> = total items,{" "}
            <span className="font-medium text-neutral-800">y</span> = mistakes. Select a cell in the{" "}
            <strong className="font-semibold text-pink-800">Spreadsheet</strong> section above (click or focus), then
            press <strong className="font-semibold text-pink-800">Save</strong> to insert the value.
          </p>
        </div>
        <div className="p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-800">
              Total items (x)
              <input
                type="text"
                inputMode="decimal"
                value={gradeTotalItems}
                onChange={(e) => {
                  setGradeTotalItems(e.target.value);
                  setGradeCalcError(null);
                }}
                placeholder="e.g. 50"
                spellCheck={false}
                className="mt-1.5 w-full max-w-md rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-sm text-neutral-900 shadow-inner outline-none ring-pink-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-200"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-800">
              Total mistakes (y)
              <input
                type="text"
                inputMode="decimal"
                value={gradeMistakes}
                onChange={(e) => {
                  setGradeMistakes(e.target.value);
                  setGradeCalcError(null);
                }}
                placeholder="e.g. 3"
                spellCheck={false}
                className="mt-1.5 w-full max-w-md rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-sm text-neutral-900 shadow-inner outline-none ring-pink-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-200"
              />
            </label>
          </div>
          {gradePreview != null && (
            <p className="mt-3 text-sm text-pink-900">
              Preview: <span className="font-mono font-semibold tabular-nums">{gradePreview}</span>
              <span className="text-neutral-600"> %</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={applyGradeToSelectedCell}
              disabled={values.length === 0}
              className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-pink-300/40 transition hover:from-pink-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-pink-600 disabled:hover:to-rose-600"
            >
              Save
            </button>
            {selectedCell != null && values.length > 0 ? (
              <span className="text-xs text-pink-800/90">
                Selected: row {selectedCell.r + 1}, column {selectedCell.c + 1}
              </span>
            ) : (
              <span className="text-xs text-neutral-600">
                {values.length === 0
                  ? "Load the spreadsheet section above to enable cell selection."
                  : "No cell selected yet — click a cell in the worksheet grid above."}
              </span>
            )}
          </div>
          {gradeCalcError != null && (
            <p className="mt-2 text-xs font-medium text-red-600" role="alert">
              {gradeCalcError}
            </p>
          )}
        </div>
      </div>

      {freezeMenuLayout != null &&
        createPortal(
          <div
            ref={freezeColumnMenuRef}
            role="menu"
            aria-label="Column freeze"
            className="fixed z-[9999] w-[17.5rem] overflow-hidden rounded-xl border border-neutral-200/90 bg-white py-1 text-sm shadow-2xl shadow-neutral-900/25 ring-1 ring-neutral-100/80"
            style={{ left: freezeMenuLayout.left, top: freezeMenuLayout.top }}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2.5 text-left text-neutral-800 transition hover:bg-pink-50/90"
              onClick={() => {
                setFrozenThroughCol(freezeMenuLayout.colIndex);
                setFreezeColumnMenu(null);
              }}
            >
              Freeze through column{" "}
              <span className="font-mono font-semibold text-pink-700">{freezeMenuLayout.colLetter}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={frozenThroughCol == null}
              className="w-full px-3 py-2.5 text-left text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                setFrozenThroughCol(null);
                setFreezeColumnMenu(null);
              }}
            >
              Clear column freeze
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
