import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  DISTRIBUTOR_ROUND_TRIP_HEADERS,
  DISTRIBUTOR_ROUND_TRIP_VERSION,
  parseDistributorRoundTripCsv,
} from "./distributorRoundTrip";

/**
 * Dry run of the administrator distributor-connections import.
 * Reads the committed workbook, turns the sheet into CSV the same way a
 * spreadsheet save would, then parses it with parseDistributorRoundTripCsv.
 * No database and no round-trip preview/commit procedure is called.
 */
const workbookPath = new URL(
  "../data/distributor-connections/cabinet-descriptions-corrected-2026-10-26.xlsx",
  import.meta.url
);

describe("corrected cabinet descriptions round-trip workbook", () => {
  it("parses with the admin round-trip contract: 8 columns, 618 rows, template version 1, no errors", () => {
    const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: false });
    expect(workbook.SheetNames).toHaveLength(1);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const header = (matrix[0] ?? []).map((cell) => String(cell).trim());
    expect(header).toEqual([...DISTRIBUTOR_ROUND_TRIP_HEADERS]);
    expect(header).toHaveLength(8);

    const csv = XLSX.utils.sheet_to_csv(sheet);
    const parsed = parseDistributorRoundTripCsv(csv);
    expect(parsed.errors, parsed.errors.join("\n")).toEqual([]);
    expect(parsed.rows).toHaveLength(618);
    expect(matrix).toHaveLength(619);
    expect(new Set(parsed.rows.map((row) => row.templateVersion))).toEqual(new Set([DISTRIBUTOR_ROUND_TRIP_VERSION]));
    expect(parsed.rows.every((row) => row.templateVersion === DISTRIBUTOR_ROUND_TRIP_VERSION)).toBe(true);
  });
});
