import type { CSSProperties } from "react";
import type { SheetCellStyle } from "@/lib/google-sheets-grid-parse";

export function sheetCellStyleToCss(s: SheetCellStyle | null | undefined): CSSProperties {
  if (!s) return {};
  return {
    backgroundColor: s.backgroundColor,
    color: s.color,
    fontWeight: s.fontWeight as CSSProperties["fontWeight"],
    fontStyle: s.fontStyle,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    textDecoration: s.textDecoration,
    textAlign: s.textAlign,
  };
}
