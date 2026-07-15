// Pure, testable builder for the master catalog spreadsheet export.
// One row per cabinet with the columns the user reviews physically.

export interface CatalogExportRow {
  masterCode: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | number | null;
  height: string | number | null;
  depth: string | number | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  graphicType: string | null;
  linesWithSku?: number | null; // how many supply lines carry this item
  imageUrl?: string | null; // generic cabinet profile photo URL (master-level)
  // Door style columns — one cabinet may appear in multiple styles.
  // Values are pipe-separated ("|") when multiple styles carry this cabinet.
  styleAliases?: string | null; // alias (white-label public) names
  styleNames?: string | null;   // internal ourName values
  styleCodes?: string | null;   // style codes
}

export const CATALOG_EXPORT_HEADERS = [
  "Code",
  "Description",
  "Category",
  "SubCategory",
  "Width",
  "Height",
  "Depth",
  "Doors",
  "Drawers",
  "GraphicType",
  "LinesWithSKU",
  "ImageUrl",
  "StyleAliases",
  "StyleNames",
  "StyleCodes",
] as const;

export function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function dim(v: string | number | null): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

/** Build the full master-catalog CSV string from cabinet rows. */
export function buildCatalogCsv(rows: CatalogExportRow[]): string {
  const lines: string[] = [];
  lines.push(CATALOG_EXPORT_HEADERS.join(","));
  for (const r of rows) {
    lines.push(
      [
        r.masterCode,
        r.description ?? "",
        r.category ?? "",
        r.subCategory ?? "",
        dim(r.width),
        dim(r.height),
        dim(r.depth),
        r.numberOfDoors ?? 0,
        r.numberOfDrawers ?? 0,
        r.graphicType ?? "",
        r.linesWithSku ?? 0,
        r.imageUrl ?? "",
        r.styleAliases ?? "",
        r.styleNames ?? "",
        r.styleCodes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  // Trailing newline for POSIX-friendly files.
  return lines.join("\n") + "\n";
}
