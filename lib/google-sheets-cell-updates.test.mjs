import assert from "node:assert/strict";
import test from "node:test";

import { buildGoogleSheetCellValueRanges } from "./google-sheets-cell-updates.ts";

test("maps edits relative to the configured range", () => {
  assert.deepEqual(
    buildGoogleSheetCellValueRanges("'Quiz new'!B2:AA200", [
      { rowIndex: 0, columnIndex: 0, value: "first" },
      { rowIndex: 2, columnIndex: 26, value: "wide" },
    ]),
    [
      { range: "'Quiz new'!B2", values: [["first"]] },
      { range: "'Quiz new'!AB4", values: [["wide"]] },
    ]
  );
});

test("uses the final separator when a quoted sheet title contains an exclamation mark", () => {
  assert.deepEqual(
    buildGoogleSheetCellValueRanges("'Quiz! new'!A1:Z20", [
      { rowIndex: 1, columnIndex: 1, value: "kept" },
    ]),
    [{ range: "'Quiz! new'!B2", values: [["kept"]] }]
  );
});

test("deduplicates edits to the same cell using the newest value", () => {
  assert.deepEqual(
    buildGoogleSheetCellValueRanges("Sheet1!A1:Z20", [
      { rowIndex: 0, columnIndex: 0, value: "old" },
      { rowIndex: 0, columnIndex: 0, value: "new" },
    ]),
    [{ range: "Sheet1!A1", values: [["new"]] }]
  );
});

test("supports whole-column and whole-row ranges", () => {
  assert.deepEqual(
    buildGoogleSheetCellValueRanges("Sheet1!C:F", [
      { rowIndex: 1, columnIndex: 0, value: "column range" },
    ]),
    [{ range: "Sheet1!C2", values: [["column range"]] }]
  );
  assert.deepEqual(
    buildGoogleSheetCellValueRanges("Sheet1!5:20", [
      { rowIndex: 0, columnIndex: 1, value: "row range" },
    ]),
    [{ range: "Sheet1!B5", values: [["row range"]] }]
  );
});

test("rejects invalid update coordinates", () => {
  assert.throws(
    () =>
      buildGoogleSheetCellValueRanges("Sheet1!A1:Z20", [
        { rowIndex: -1, columnIndex: 0, value: "bad" },
      ]),
    /non-negative/
  );
});
