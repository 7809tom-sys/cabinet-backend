/**
 * Distributor product spreadsheet import — pure parsing + validation helpers.
 *
 * Distributors export their catalog from any spreadsheet tool as CSV. We accept
 * a small, well-defined column set keyed by the platform `masterCode` so the
 * import can upsert cabinet descriptions/info and (optionally) per-style pricing
 * without any native xlsx dependency (Node-only deploy runtime safe).
 *
 * Everything here is pure and unit-tested; the tRPC router calls these to build
 * a dry-run preview and to validate before committing writes.
 */

/** Canonical column keys we understand, mapped from many header spellings. */
export type ImportColumnKey =
  | "masterCode"
  | "description"
  | "category"
  | "subCategory"
  | "width"
  | "height"
  | "depth"
  | "listPrice"
  | "yourCost"
  | "styleCode";

/** Header aliases (lower-cased, trimmed) -> canonical key. */
const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  // identity
  "mastercode": "masterCode",
  "master code": "masterCode",
  "code": "masterCode",
  "item": "masterCode",
  "item code": "masterCode",
  "sku": "masterCode",
  "model": "masterCode",
  // description / info
  "description": "description",
  "desc": "description",
  "name": "description",
  "product description": "description",
  "product name": "description",
  // taxonomy
  "category": "category",
  "type": "category",
  "subcategory": "subCategory",
  "sub category": "subCategory",
  "sub-category": "subCategory",
  // dimensions
  "width": "width",
  "w": "width",
  "height": "height",
  "h": "height",
  "depth": "depth",
  "d": "depth",
  // pricing
  "listprice": "listPrice",
  "list price": "listPrice",
  "msrp": "listPrice",
  "price": "listPrice",
  "yourcost": "yourCost",
  "your cost": "yourCost",
  "cost": "yourCost",
  "dealer cost": "yourCost",
  // style
  "stylecode": "styleCode",
  "style code": "styleCode",
  "style": "styleCode",
  "door style": "styleCode",
  "finish": "styleCode",
};

export const VALID_CATEGORIES = [
  "Base",
  "Wall",
  "Tall",
  "ADA",
  "Vanity",
  "Accessory",
] as const;

/** A single parsed CSV record (raw string cells keyed by canonical column). */
export interface RawImportRow {
  rowNumber: number; // 1-based data row (excludes header)
  cells: Partial<Record<ImportColumnKey, string>>;
}

export interface ParsedImport {
  /** Canonical columns detected in the header, in order. */
  columns: ImportColumnKey[];
  /** Unrecognized header labels (ignored, surfaced to the user). */
  unknownHeaders: string[];
  rows: RawImportRow[];
}

/**
 * RFC-4180-ish CSV line splitter that handles quoted fields, escaped quotes
 * (""), and commas inside quotes. Returns an array of cell strings.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Split raw CSV text into physical lines, tolerating quoted newlines. */
export function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      // Toggle, but keep the quote so splitCsvLine can interpret escaping.
      inQuotes = !inQuotes || normalized[i + 1] === '"';
      if (normalized[i + 1] === '"' && inQuotes) {
        cur += '""';
        i++;
        continue;
      }
      cur += ch;
    } else if (ch === "\n" && !inQuotes) {
      rows.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

/** Parse CSV text into canonical rows + header diagnostics. */
export function parseDistributorCsv(text: string): ParsedImport {
  const lines = splitCsvRows(text).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [], unknownHeaders: [], rows: [] };
  }
  const headerCells = splitCsvLine(lines[0]);
  const columns: ImportColumnKey[] = [];
  const unknownHeaders: string[] = [];
  const colIndexToKey: (ImportColumnKey | null)[] = headerCells.map((h) => {
    const key = HEADER_ALIASES[h.toLowerCase().trim()];
    if (key) {
      if (!columns.includes(key)) columns.push(key);
      return key;
    }
    if (h.trim()) unknownHeaders.push(h.trim());
    return null;
  });

  const rows: RawImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const record: Partial<Record<ImportColumnKey, string>> = {};
    colIndexToKey.forEach((key, idx) => {
      if (key && cells[idx] !== undefined && cells[idx] !== "") {
        // Last column with a given key wins, but we keep first non-empty.
        if (record[key] === undefined) record[key] = cells[idx];
      }
    });
    rows.push({ rowNumber: i, cells: record });
  }
  return { columns, unknownHeaders, rows };
}

/** A numeric parse that tolerates $, commas, and quotes; returns null if blank. */
export function parseMoney(v: string | undefined): number | null {
  if (v === undefined) return null;
  const cleaned = v.replace(/[$,"\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function parseDimension(v: string | undefined): number | null {
  if (v === undefined) return null;
  const cleaned = v.replace(/["\s]/g, "").replace(/in$|inch(es)?$/i, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export interface RowValidation {
  rowNumber: number;
  masterCode: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a parsed import in isolation (no DB). Confirms required columns and
 * per-row sanity. DB-aware create/update diffing happens in the router.
 */
export function validateImport(parsed: ParsedImport): {
  fatalErrors: string[];
  rowResults: RowValidation[];
} {
  const fatalErrors: string[] = [];
  if (!parsed.columns.includes("masterCode")) {
    fatalErrors.push(
      'Missing required "Master Code" column (accepted headers: Master Code, Code, Item, SKU, Model).'
    );
  }
  const hasContent =
    parsed.columns.includes("description") ||
    parsed.columns.includes("listPrice") ||
    parsed.columns.includes("yourCost");
  if (!hasContent) {
    fatalErrors.push(
      "Provide at least a Description or a Price column so there is something to import."
    );
  }

  const seen = new Set<string>();
  const rowResults: RowValidation[] = parsed.rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const masterCode = (row.cells.masterCode ?? "").trim();
    if (!masterCode) {
      errors.push("Missing master code.");
    } else if (seen.has(masterCode.toUpperCase())) {
      errors.push(`Duplicate master code "${masterCode}" in this file.`);
    } else {
      seen.add(masterCode.toUpperCase());
    }

    if (row.cells.category) {
      const match = VALID_CATEGORIES.find(
        (c) => c.toLowerCase() === row.cells.category!.toLowerCase()
      );
      if (!match)
        warnings.push(
          `Unknown category "${row.cells.category}" — will be ignored (kept as-is).`
        );
    }

    for (const [label, raw] of [
      ["list price", row.cells.listPrice],
      ["your cost", row.cells.yourCost],
    ] as const) {
      const n = parseMoney(raw);
      if (n !== null && Number.isNaN(n))
        errors.push(`Invalid ${label} "${raw}".`);
      if (typeof n === "number" && n < 0)
        errors.push(`${label} cannot be negative.`);
    }
    for (const [label, raw] of [
      ["width", row.cells.width],
      ["height", row.cells.height],
      ["depth", row.cells.depth],
    ] as const) {
      const n = parseDimension(raw);
      if (n !== null && Number.isNaN(n))
        errors.push(`Invalid ${label} "${raw}".`);
    }

    return {
      rowNumber: row.rowNumber,
      masterCode,
      ok: errors.length === 0,
      errors,
      warnings,
    };
  });

  return { fatalErrors, rowResults };
}

/** The CSV template we hand distributors to fill in. */
export const IMPORT_TEMPLATE_CSV = [
  "Master Code,Description,Category,Sub Category,Width,Height,Depth,List Price,Your Cost,Style Code",
  'B-24,"24"" Double Door Base Cabinet",Base,Door Base,24,34.5,24,310.00,108.50,SHW',
  'W-30-30,"30"" Double Door Wall Cabinet",Wall,Double Door,30,30,12,182.00,63.70,SHW',
].join("\n");
