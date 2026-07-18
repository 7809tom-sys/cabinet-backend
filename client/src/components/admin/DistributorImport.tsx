import { useState, useRef, useCallback } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Link2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

// ─── CSV import helpers ────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  "create-info": "New item",
  "update-info": "Update",
  "price-only": "Price only",
  error: "Error",
};
const ACTION_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "create-info": "default",
  "update-info": "secondary",
  "price-only": "outline",
  error: "destructive",
};

// ─── XLSX column-mapping types ─────────────────────────────────────────────────

type ParsedColumn = {
  colIdx: number;
  rawHeader: string;
  label: string;
  role: string;
  styleId: number | null;
  styleCode: string | null;
  styleLabel: string | null;
  sampleValues: string[];
};

type ParseResult = inferRouterOutputs<AppRouter>["distributorAdmin"]["parseXlsxColumns"];
type ImportResult = inferRouterOutputs<AppRouter>["distributorAdmin"]["importWithMapping"];

const ROLE_LABELS: Record<string, string> = {
  sku: "SKU / Item Code",
  category: "Category",
  subCategory: "Sub-Category",
  description: "Description",
  dimensions: "Dimensions",
  priceStyle: "Price (door style)",
  ignore: "Ignore",
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function DistributorImport() {
  // ── shared state ──────────────────────────────────────────────────────────
  const [distributorId, setDistributorId] = useState<string>("");
  const utils = trpc.useUtils();
  const { data: dists } = trpc.distributorAdmin.adminList.useQuery();

  // ── CSV import state ──────────────────────────────────────────────────────
  const [styleId, setStyleId] = useState<string>("");
  const [csv, setCsv] = useState<string>("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const { data: styles } = trpc.distributorAdmin.adminStyles.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: Boolean(distributorId) }
  );
  type PreviewData = inferRouterOutputs<AppRouter>["distributorAdmin"]["importPreview"];
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const previewMut = trpc.distributorAdmin.importPreview.useMutation({
    onSuccess: (data) => setPreview(data),
    onError: (e) => toast.error(e.message),
  });
  const commitMut = trpc.distributorAdmin.importCommit.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Imported: ${r.created} created, ${r.updated} updated, ${r.priced} priced, ${r.skipped} skipped.`
      );
      setPreview(null);
      setCsv("");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── XLSX import state ─────────────────────────────────────────────────────
  type XlsxStep = "upload" | "mapping" | "preview" | "done";
  const [xlsxStep, setXlsxStep] = useState<XlsxStep>("upload");
  const [xlsxFileBase64, setXlsxFileBase64] = useState<string>("");
  const [xlsxFilename, setXlsxFilename] = useState<string>("");
  const [xlsxSheetName, setXlsxSheetName] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ParsedColumn[]>([]);
  const [xlsxResult, setXlsxResult] = useState<ImportResult | null>(null);
  const xlsxFileRef = useRef<HTMLInputElement>(null);

  const parseMut = trpc.distributorAdmin.parseXlsxColumns.useMutation({
    onSuccess: (data) => {
      setParseResult(data);
      const firstSheet = data.sheets[0];
      if (firstSheet) {
        setXlsxSheetName(firstSheet.name);
        setColumnMapping(firstSheet.columns as ParsedColumn[]);
      }
      setXlsxStep("mapping");
    },
    onError: (e) => toast.error(`Parse failed: ${e.message}`),
  });

  const xlsxPreviewMut = trpc.distributorAdmin.importWithMapping.useMutation({
    onSuccess: (data) => {
      setXlsxResult(data);
      setXlsxStep("preview");
    },
    onError: (e) => toast.error(`Preview failed: ${e.message}`),
  });

  const xlsxCommitMut = trpc.distributorAdmin.importWithMapping.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Import complete: ${data.created} created, ${data.updated} updated, ${data.priced} price rows upserted, ${data.skipped} skipped.`
      );
      setXlsxStep("done");
      setXlsxResult(data);
    },
    onError: (e) => toast.error(`Commit failed: ${e.message}`),
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  const [exporting, setExporting] = useState(false);
  function downloadMasterCatalog() {
    setExporting(true);
    utils.distributorAdmin.catalogExport
      .fetch()
      .then(({ csv, filename, count }) => {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${count} cabinets to ${filename}`);
      })
      .catch((e) => toast.error(e?.message ?? "Export failed"))
      .finally(() => setExporting(false));
  }

  function downloadTemplate() {
    utils.distributorAdmin.importTemplate.fetch().then(({ csv }) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cabinet-dealz-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.readAsText(f);
  }

  const onXlsxFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!distributorId) {
        toast.error("Please select a distributor first.");
        return;
      }
      setXlsxFilename(f.name);
      setXlsxStep("upload");
      setParseResult(null);
      setXlsxResult(null);
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1] ?? "";
        setXlsxFileBase64(b64);
        parseMut.mutate({
          fileBase64: b64,
          filename: f.name,
          distributorId: Number(distributorId),
        });
      };
      reader.readAsDataURL(f);
    },
    [distributorId, parseMut]
  );

  function updateColRole(colIdx: number, newRole: string) {
    setColumnMapping((prev) =>
      prev.map((c) =>
        c.colIdx === colIdx ? { ...c, role: newRole } : c
      )
    );
  }

  function updateColStyle(colIdx: number, newStyleId: string) {
    const style = parseResult?.distributorStyles.find(
      (s) => String(s.id) === newStyleId
    );
    setColumnMapping((prev) =>
      prev.map((c) =>
        c.colIdx === colIdx
          ? {
              ...c,
              role: "priceStyle",
              styleId: style ? style.id : null,
              styleCode: style?.styleCode ?? null,
              styleLabel: style?.ourName ?? null,
            }
          : c
      )
    );
  }

  function runXlsxImport(dryRun: boolean) {
    const mappingInput = columnMapping.map((c) => ({
      colIdx: c.colIdx,
      role: c.role as
        | "sku"
        | "category"
        | "subCategory"
        | "description"
        | "dimensions"
        | "priceStyle"
        | "ignore",
      styleId: c.styleId ?? undefined,
    }));
    const payload = {
      fileBase64: xlsxFileBase64,
      filename: xlsxFilename,
      sheetName: xlsxSheetName,
      distributorId: Number(distributorId),
      columnMapping: mappingInput,
      dryRun,
    };
    if (dryRun) {
      xlsxPreviewMut.mutate(payload);
    } else {
      xlsxCommitMut.mutate(payload);
    }
  }

  function resetXlsx() {
    setXlsxStep("upload");
    setXlsxFileBase64("");
    setXlsxFilename("");
    setXlsxSheetName("");
    setParseResult(null);
    setColumnMapping([]);
    setXlsxResult(null);
    if (xlsxFileRef.current) xlsxFileRef.current.value = "";
  }

  const canRunCsv = Boolean(distributorId) && csv.trim().length > 0;
  const priceStyleCols = columnMapping.filter(
    (c) => c.role === "priceStyle" && c.styleId != null
  );
  const skuCol = columnMapping.find((c) => c.role === "sku");

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Master catalog export ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Master catalog export
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-xl">
            Download every cabinet as one row (code, description, category,
            sub-category, dimensions, doors/drawers, graphic type, and how many
            supply lines carry it). Review and mark corrections, then re-import
            via the panel below.
          </p>
          <Button
            onClick={downloadMasterCatalog}
            disabled={exporting}
            className="shrink-0"
          >
            {exporting ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download master catalog (CSV)
          </Button>
        </CardContent>
      </Card>

      {/* ── Import tabs ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Distributor product import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Distributor picker — shared across both tabs */}
          <div className="max-w-xs">
            <label className="text-sm font-medium">
              Distributor line <span className="text-destructive">*</span>
            </label>
            <Select
              value={distributorId}
              onValueChange={(v) => {
                setDistributorId(v);
                setStyleId("");
                setPreview(null);
                resetXlsx();
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a distributor" />
              </SelectTrigger>
              <SelectContent>
                {(dists ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                    {d.brandName ? ` (${d.brandName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="xlsx">
            <TabsList>
              <TabsTrigger value="xlsx">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> XLSX / Excel
              </TabsTrigger>
              <TabsTrigger value="csv">CSV / paste</TabsTrigger>
            </TabsList>

            {/* ── XLSX tab ─────────────────────────────────────────────────── */}
            <TabsContent value="xlsx" className="space-y-5 pt-2">
              {/* Step indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {(["upload", "mapping", "preview", "done"] as XlsxStep[]).map(
                  (s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight className="h-3 w-3" />}
                      <span
                        className={
                          xlsxStep === s
                            ? "font-semibold text-foreground"
                            : xlsxStep === "done" ||
                              (["upload", "mapping", "preview"] as XlsxStep[]).indexOf(
                                xlsxStep
                              ) >
                                (["upload", "mapping", "preview"] as XlsxStep[]).indexOf(s)
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                        }
                      >
                        {s === "upload"
                          ? "1. Upload"
                          : s === "mapping"
                          ? "2. Map columns"
                          : s === "preview"
                          ? "3. Preview"
                          : "4. Done"}
                      </span>
                    </span>
                  )
                )}
              </div>

              {/* Step 1: Upload */}
              <div>
                <input
                  ref={xlsxFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={onXlsxFile}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={!distributorId || parseMut.isPending}
                    onClick={() => xlsxFileRef.current?.click()}
                  >
                    {parseMut.isPending ? (
                      <Spinner className="mr-1.5 h-4 w-4" />
                    ) : (
                      <Upload className="mr-1.5 h-4 w-4" />
                    )}
                    {xlsxFilename
                      ? `Re-upload (${xlsxFilename})`
                      : "Upload XLSX / Excel file"}
                  </Button>
                  {xlsxFilename && (
                    <span className="text-sm text-muted-foreground">
                      {xlsxFilename}
                    </span>
                  )}
                  {(xlsxStep === "mapping" ||
                    xlsxStep === "preview" ||
                    xlsxStep === "done") && (
                    <Button variant="ghost" size="sm" onClick={resetXlsx}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Start over
                    </Button>
                  )}
                </div>
                {!distributorId && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Select a distributor above before uploading.
                  </p>
                )}
              </div>

              {/* Sheet selector (if multiple sheets) */}
              {parseResult && parseResult.sheets.length > 1 && (
                <div className="max-w-xs">
                  <label className="text-sm font-medium">Sheet</label>
                  <Select
                    value={xlsxSheetName}
                    onValueChange={(v) => {
                      setXlsxSheetName(v);
                      const sheet = parseResult.sheets.find((s) => s.name === v);
                      if (sheet) setColumnMapping(sheet.columns as ParsedColumn[]);
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parseResult.sheets.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Step 2: Column mapping */}
              {(xlsxStep === "mapping" ||
                xlsxStep === "preview" ||
                xlsxStep === "done") &&
                columnMapping.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Column mapping
                      </h3>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {priceStyleCols.length} price column
                          {priceStyleCols.length !== 1 ? "s" : ""} mapped
                        </span>
                        {skuCol ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            SKU: col {skuCol.colIdx + 1}
                          </span>
                        ) : (
                          <span className="text-destructive font-medium">
                            No SKU column!
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border overflow-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/80 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Col</th>
                            <th className="px-3 py-2 text-left">Header</th>
                            <th className="px-3 py-2 text-left">Role</th>
                            <th className="px-3 py-2 text-left">
                              Door style (if price)
                            </th>
                            <th className="px-3 py-2 text-left">Sample</th>
                          </tr>
                        </thead>
                        <tbody>
                          {columnMapping.map((col) => (
                            <tr
                              key={col.colIdx}
                              className={`border-t ${
                                col.role === "ignore"
                                  ? "opacity-40"
                                  : col.role === "priceStyle" && col.styleId
                                  ? "bg-emerald-50/30 dark:bg-emerald-950/10"
                                  : col.role === "sku"
                                  ? "bg-blue-50/30 dark:bg-blue-950/10"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-1.5 text-muted-foreground text-xs">
                                {col.colIdx + 1}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-xs max-w-[140px] truncate">
                                {col.label}
                              </td>
                              <td className="px-3 py-1.5">
                                <Select
                                  value={col.role}
                                  onValueChange={(v) =>
                                    updateColRole(col.colIdx, v)
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs w-36">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(ROLE_LABELS).map(
                                      ([v, label]) => (
                                        <SelectItem
                                          key={v}
                                          value={v}
                                          className="text-xs"
                                        >
                                          {label}
                                        </SelectItem>
                                      )
                                    )}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-1.5">
                                {col.role === "priceStyle" ? (
                                  <Select
                                    value={
                                      col.styleId ? String(col.styleId) : ""
                                    }
                                    onValueChange={(v) =>
                                      updateColStyle(col.colIdx, v)
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs w-44">
                                      <SelectValue placeholder="Assign style…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(
                                        parseResult?.distributorStyles ?? []
                                      ).map((s) => (
                                        <SelectItem
                                          key={s.id}
                                          value={String(s.id)}
                                          className="text-xs"
                                        >
                                          {s.styleCode} — {s.ourName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-[160px] truncate">
                                {col.sampleValues.slice(0, 2).join(", ") ||
                                  "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Validation warnings */}
                    {!skuCol && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                        <AlertTriangle className="inline mr-1 h-3.5 w-3.5" />
                        No SKU / Item Code column mapped. Please assign one
                        column the "SKU / Item Code" role.
                      </div>
                    )}
                    {priceStyleCols.filter((c) => !c.styleId).length > 0 && (
                      <div className="rounded-md border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="inline mr-1 h-3.5 w-3.5" />
                        {priceStyleCols.filter((c) => !c.styleId).length}{" "}
                        price column(s) have no door style assigned — they will
                        be skipped.
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        disabled={
                          !skuCol ||
                          xlsxPreviewMut.isPending ||
                          xlsxStep === "done"
                        }
                        variant="outline"
                        onClick={() => runXlsxImport(true)}
                      >
                        {xlsxPreviewMut.isPending ? (
                          <Spinner className="mr-1.5 h-4 w-4" />
                        ) : null}
                        Preview import
                      </Button>
                    </div>
                  </div>
                )}

              {/* Step 3: Preview results */}
              {xlsxStep === "preview" && xlsxResult && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Preview results</h3>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="default">{xlsxResult.created} new</Badge>
                    <Badge variant="secondary">
                      {xlsxResult.updated} update
                    </Badge>
                    <Badge variant="outline">
                      {xlsxResult.priced} price rows
                    </Badge>
                    {xlsxResult.skipped > 0 && (
                      <Badge variant="destructive">
                        {xlsxResult.skipped} skipped
                      </Badge>
                    )}
                    {xlsxResult.aliasMatched > 0 && (
                      <Badge
                        variant="outline"
                        className="border-blue-400 text-blue-700 dark:text-blue-300"
                      >
                        <Link2 className="mr-1 h-3 w-3" />
                        {xlsxResult.aliasMatched} alias match
                        {xlsxResult.aliasMatched !== 1 ? "es" : ""}
                      </Badge>
                    )}
                    {xlsxResult.unmatchedCount > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {xlsxResult.unmatchedCount} unmatched
                      </Badge>
                    )}
                  </div>

                  {xlsxResult.unmatchedCount > 0 && (
                    <div className="rounded-md border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                      <p className="font-medium mb-1">
                        {xlsxResult.unmatchedCount} SKU(s) could not be
                        matched and will be skipped (no Description+Category
                        to create new cabinets):
                      </p>
                      <p className="font-mono">
                        {xlsxResult.unmatchedCodes.slice(0, 20).join(", ")}
                        {xlsxResult.unmatchedCount > 20 ? " …" : ""}
                      </p>
                    </div>
                  )}

                  {xlsxResult.previewRows.length > 0 && (
                    <div className="max-h-72 overflow-auto rounded-md border">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-muted/80 uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Row</th>
                            <th className="px-3 py-2">Code</th>
                            <th className="px-3 py-2">Match</th>
                            <th className="px-3 py-2">Action</th>
                            <th className="px-3 py-2">Styles priced</th>
                            <th className="px-3 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {xlsxResult.previewRows.map((r) => (
                            <tr key={r.rowNum} className="border-t">
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.rowNum}
                              </td>
                              <td className="px-3 py-1.5 font-mono">
                                {r.code}
                                {r.matchHow === "alias" &&
                                  r.resolvedCode && (
                                    <span className="ml-1.5 text-blue-600 dark:text-blue-400">
                                      → {r.resolvedCode}
                                    </span>
                                  )}
                              </td>
                              <td className="px-3 py-1.5">
                                <Badge
                                  variant={
                                    r.matchHow === "exact"
                                      ? "default"
                                      : r.matchHow === "alias"
                                      ? "outline"
                                      : "destructive"
                                  }
                                  className="text-xs"
                                >
                                  {r.matchHow === "exact"
                                    ? "Exact"
                                    : r.matchHow === "alias"
                                    ? "Alias"
                                    : r.action === "create"
                                    ? "New"
                                    : "No match"}
                                </Badge>
                              </td>
                              <td className="px-3 py-1.5">
                                <Badge
                                  variant={
                                    r.action === "error"
                                      ? "destructive"
                                      : r.action === "create"
                                      ? "default"
                                      : r.action === "update"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {r.action}
                                </Badge>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.stylesPriced}
                              </td>
                              <td className="px-3 py-1.5 text-amber-600 dark:text-amber-400">
                                {r.warnings.join(" ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={xlsxCommitMut.isPending}
                      onClick={() => runXlsxImport(false)}
                    >
                      {xlsxCommitMut.isPending ? (
                        <Spinner className="mr-1.5 h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      )}
                      Commit import
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setXlsxStep("mapping")}
                    >
                      Back to mapping
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Done */}
              {xlsxStep === "done" && xlsxResult && (
                <div className="rounded-md border border-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="h-5 w-5" /> Import complete
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="default">{xlsxResult.created} created</Badge>
                    <Badge variant="secondary">
                      {xlsxResult.updated} updated
                    </Badge>
                    <Badge variant="outline">
                      {xlsxResult.priced} price rows upserted
                    </Badge>
                    {xlsxResult.skipped > 0 && (
                      <Badge variant="destructive">
                        {xlsxResult.skipped} skipped
                      </Badge>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={resetXlsx}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Import
                    another file
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── CSV tab ──────────────────────────────────────────────────── */}
            <TabsContent value="csv" className="space-y-4 pt-2">
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium">Required CSV columns</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>
                    <span className="font-mono">SKU</span> (or: Code, Item,
                    Model, Part #) — the distributor's own SKU or the platform
                    master code. Aliases are matched automatically.
                  </li>
                  <li>
                    <span className="font-mono">Door Style</span> (or: Style,
                    Style Code, Finish) — matched against this distributor's
                    door styles.
                  </li>
                  <li>
                    <span className="font-mono">List Price</span> and/or{" "}
                    <span className="font-mono">Your Cost</span>.
                  </li>
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">
                    Door style override{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      (optional — applies to all rows)
                    </span>
                  </label>
                  <Select
                    value={styleId}
                    onValueChange={(v) => {
                      setStyleId(v);
                      setPreview(null);
                    }}
                    disabled={!distributorId}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Use Door Style column per row" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">
                        Use Door Style column per row
                      </SelectItem>
                      {(styles ?? []).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.ourName}
                          {s.styleCode ? ` (${s.styleCode})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                >
                  <Download className="mr-1.5 h-4 w-4" /> Download template
                </Button>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onCsvFile}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => csvFileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" /> Upload CSV file
                </Button>
              </div>

              <div>
                <label className="text-sm font-medium">Or paste CSV</label>
                <Textarea
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="SKU,Door Style,List Price,Your Cost&#10;B-24,Shaker White,310.00,108.50&#10;W-30-30,Shaker White,182.00,63.70"
                  className="mt-1 h-32 font-mono text-xs"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={!canRunCsv || previewMut.isPending}
                  onClick={() =>
                    previewMut.mutate({
                      distributorId: Number(distributorId),
                      styleId: styleId ? Number(styleId) : undefined,
                      csv,
                    })
                  }
                >
                  {previewMut.isPending ? (
                    <Spinner className="mr-1.5 h-4 w-4" />
                  ) : null}
                  Preview import
                </Button>
                {preview && preview.fatalErrors.length === 0 && (
                  <Button
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={commitMut.isPending}
                    onClick={() =>
                      commitMut.mutate({
                        distributorId: Number(distributorId),
                        styleId: styleId ? Number(styleId) : undefined,
                        csv,
                      })
                    }
                  >
                    {commitMut.isPending ? (
                      <Spinner className="mr-1.5 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    )}
                    Commit import
                  </Button>
                )}
              </div>

              {/* CSV preview results */}
              {preview && (
                <div className="space-y-3">
                  {preview.fatalErrors.length > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                      <div className="mb-1 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-4 w-4" /> Fix before
                        importing
                      </div>
                      <ul className="list-disc pl-5">
                        {preview.fatalErrors.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="default">
                      {preview.summary.toCreate} new
                    </Badge>
                    <Badge variant="secondary">
                      {preview.summary.toUpdate} update
                    </Badge>
                    <Badge variant="outline">
                      {preview.summary.priceOnly} price-only
                    </Badge>
                    {preview.summary.errors > 0 && (
                      <Badge variant="destructive">
                        {preview.summary.errors} error
                      </Badge>
                    )}
                    {"aliasMatched" in preview.summary &&
                      (preview.summary as { aliasMatched: number })
                        .aliasMatched > 0 && (
                        <Badge
                          variant="outline"
                          className="border-blue-400 text-blue-700 dark:text-blue-300"
                        >
                          <Link2 className="mr-1 h-3 w-3" />
                          {
                            (preview.summary as { aliasMatched: number })
                              .aliasMatched
                          }{" "}
                          alias match
                          {(preview.summary as { aliasMatched: number })
                            .aliasMatched !== 1
                            ? "es"
                            : ""}
                        </Badge>
                      )}
                    <span className="text-muted-foreground self-center">
                      {preview.summary.total} rows total
                    </span>
                  </div>

                  {preview.unknownHeaders.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Ignored columns:{" "}
                      <span className="font-mono">
                        {preview.unknownHeaders.join(", ")}
                      </span>
                    </p>
                  )}

                  <div className="max-h-80 overflow-auto rounded-md border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Code</th>
                          <th className="px-3 py-2">Style</th>
                          <th className="px-3 py-2">Action</th>
                          <th className="px-3 py-2">Changes</th>
                          <th className="px-3 py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map(
                          (r: PreviewData["rows"][number]) => (
                            <tr key={r.rowNumber} className="border-t">
                              <td className="px-3 py-2 text-muted-foreground">
                                {r.rowNumber}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                <span>{r.masterCode || "—"}</span>
                                {"matchHow" in r &&
                                  (r as { matchHow: string }).matchHow ===
                                    "alias" && (
                                    <span className="ml-1.5 text-xs text-blue-600 dark:text-blue-400">
                                      →{" "}
                                      {
                                        (
                                          r as {
                                            resolvedMasterCode: string;
                                          }
                                        ).resolvedMasterCode
                                      }
                                    </span>
                                  )}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {"resolvedStyleName" in r
                                  ? (
                                      r as {
                                        resolvedStyleName: string | null;
                                      }
                                    ).resolvedStyleName ?? (
                                      <span className="text-amber-600">
                                        —
                                      </span>
                                    )
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant={ACTION_VARIANT[r.action]}>
                                  {ACTION_LABEL[r.action]}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {[
                                  ...r.fields,
                                  r.priceTouched ? "price" : null,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {r.errors.length > 0 && (
                                  <span className="text-destructive">
                                    {r.errors.join(" ")}
                                  </span>
                                )}
                                {r.warnings.length > 0 && (
                                  <span className="text-amber-600">
                                    {r.warnings
                                      .filter(
                                        (w: string) =>
                                          !w.startsWith("Matched via alias")
                                      )
                                      .join(" ")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
