/**
 * CabinetSpreadsheetAdmin — Download/upload cabinet data spreadsheet.
 *
 * Upload flow (3 steps):
 *   1. Choose file → calls cabinets.parseXlsxColumns to detect headers
 *   2. Map Columns → admin assigns each spreadsheet column to a cabinet field
 *   3. Preview & Import → dry-run shows first 3 rows, then commit
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import AddCabinetDialog from "@/components/admin/AddCabinetDialog";

const CABINET_FIELDS = [
  { key: "masterCode", label: "Master Code (required)", required: true },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub-Category" },
  { key: "width", label: "Width (inches)" },
  { key: "height", label: "Height (inches)" },
  { key: "depth", label: "Depth (inches)" },
  { key: "isActive", label: "Active (TRUE/FALSE)" },
  { key: "placementType", label: "Placement Type" },
  { key: "numberOfDoors", label: "Number of Doors" },
  { key: "numberOfDrawers", label: "Number of Drawers" },
  { key: "hingeSide", label: "Hinge Side" },
  { key: "graphicType", label: "Graphic Type" },
] as const;

type CabinetFieldKey = (typeof CABINET_FIELDS)[number]["key"];

function guessField(header: string): CabinetFieldKey | null {
  const h = header.toLowerCase().replace(/[\s_-]/g, "");
  const map: Record<string, CabinetFieldKey> = {
    mastercode: "masterCode", code: "masterCode", sku: "masterCode", model: "masterCode",
    description: "description", desc: "description", name: "description",
    category: "category", type: "category",
    subcategory: "subCategory", sub: "subCategory",
    width: "width", w: "width",
    height: "height", h: "height",
    depth: "depth", d: "depth",
    isactive: "isActive", active: "isActive",
    placementtype: "placementType", placement: "placementType",
    numberofdoors: "numberOfDoors", doors: "numberOfDoors",
    numberofdrawers: "numberOfDrawers", drawers: "numberOfDrawers",
    hingeside: "hingeSide", hinge: "hingeSide",
    graphictype: "graphicType", graphic: "graphicType",
  };
  return map[h] ?? null;
}

type Step = "upload" | "map" | "preview" | "done";

export default function CabinetSpreadsheetAdmin() {
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);

  function downloadSpreadsheet() {
    setExporting(true);
    utils.cabinets.adminExport
      .fetch()
      .then(({ xlsx, filename, count }) => {
        const byteChars = atob(xlsx);
        const byteNums = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteNums], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${count} cabinets → ${filename}`);
      })
      .catch((e) => toast.error(e?.message ?? "Export failed"))
      .finally(() => setExporting(false));
  }

  const [step, setStep] = useState<Step>("upload");
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Array<{ name: string; headers: string[]; previewRows: Array<Record<string, string>> }>>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{
    updated: number; skipped: number; errors: string[];
    preview: Array<{ masterCode: string; changes: Record<string, unknown> }>;
  } | null>(null);

  const parseColumns = trpc.cabinets.parseXlsxColumns.useMutation({
    onSuccess: (data) => {
      setSheets(data.sheets);
      const firstSheet = data.sheets[0];
      setSelectedSheet(firstSheet?.name ?? "");
      if (firstSheet) {
        const autoMap: Record<string, string> = {};
        for (const h of firstSheet.headers) {
          const guess = guessField(h);
          if (guess) autoMap[h] = guess;
        }
        setMapping(autoMap);
      }
      setStep("map");
    },
    onError: (e) => toast.error(e.message),
  });

  const importWithMapping = trpc.cabinets.adminImportWithMapping.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      if (d.preview && d.preview.length > 0) {
        setImportResult(d);
        setStep("preview");
      } else {
        setImportResult(d);
        setStep("done");
        toast.success(`Import complete: ${d.updated} updated, ${d.skipped} skipped`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      setFileBase64(b64);
      parseColumns.mutate({ fileBase64: b64, filename: f.name });
    };
    reader.readAsDataURL(f);
  }

  function reset() {
    setStep("upload");
    setFileBase64("");
    setFileName("");
    setSheets([]);
    setSelectedSheet("");
    setMapping({});
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const currentSheet = sheets.find((s) => s.name === selectedSheet);
  const masterCodeMapped = Object.values(mapping).includes("masterCode");

  function buildMappingInput(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field && field !== "__skip__") out[col] = field;
    }
    return out;
  }

  function runDryRun() {
    setImportResult(null);
    importWithMapping.mutate({
      fileBase64, filename: fileName,
      sheetName: selectedSheet || undefined,
      mapping: buildMappingInput(),
      dryRun: true,
    });
  }

  function runImport() {
    importWithMapping.mutate({
      fileBase64, filename: fileName,
      sheetName: selectedSheet || undefined,
      mapping: buildMappingInput(),
      dryRun: false,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Cabinet Catalog Management</h3>
        <AddCabinetDialog onCreated={() => utils.cabinets.adminExport.invalidate()} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Download cabinet spreadsheet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground max-w-xl">
            Downloads every cabinet as one row in an Excel workbook (.xlsx). Editable columns:
            description, category, sub-category, placement type, dimensions (W/H/D), doors,
            drawers, hinge side, corner flag, corner side, graphic type, and active status.
            The <strong>masterCode</strong> column is the lookup key — do not change it.
          </p>
          <Button
            onClick={downloadSpreadsheet}
            disabled={exporting}
            className="gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
          >
            {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            Download cabinets.xlsx
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload corrected spreadsheet
            {step !== "upload" && (
              <Button size="sm" variant="ghost" className="ml-auto gap-1 text-xs" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Start over
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {step === "upload" && (
            <>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Upload any .xlsx or .csv file. You will map the columns to cabinet fields in the next step.
                  Each row is matched by <strong>masterCode</strong>.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileRef.current?.click()}
                  disabled={parseColumns.isPending}
                >
                  {parseColumns.isPending ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                  {fileName ? fileName : "Choose .xlsx or .csv file…"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={onFile}
                />
              </div>
            </>
          )}

          {step === "map" && currentSheet && (
            <div className="space-y-4">
              {sheets.length > 1 && (
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0">Sheet:</Label>
                  <Select value={selectedSheet} onValueChange={(v) => {
                    setSelectedSheet(v);
                    const s = sheets.find((sh) => sh.name === v);
                    if (s) {
                      const autoMap: Record<string, string> = {};
                      for (const h of s.headers) {
                        const guess = guessField(h);
                        if (guess) autoMap[h] = guess;
                      }
                      setMapping(autoMap);
                    }
                  }}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Detected <strong>{currentSheet.headers.length}</strong> columns in <strong>{fileName}</strong>.
                Map each column to a cabinet field, or leave as "(skip)" to ignore it.
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Spreadsheet Column</th>
                      <th className="text-left px-3 py-2 font-medium">Preview (row 1)</th>
                      <th className="text-left px-3 py-2 font-medium">Maps to Cabinet Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.headers.map((header) => {
                      const preview = currentSheet.previewRows[0]?.[header] ?? "";
                      return (
                        <tr key={header} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{header}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[140px]">{preview}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={mapping[header] || "__skip__"}
                              onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v === "__skip__" ? "" : v }))}
                            >
                              <SelectTrigger className="h-7 text-xs w-52"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">(skip)</SelectItem>
                                {CABINET_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!masterCodeMapped && (
                <p className="text-xs text-destructive font-medium">
                  You must map a column to "Master Code" before you can import.
                </p>
              )}
              <Button
                disabled={!masterCodeMapped || importWithMapping.isPending}
                onClick={runDryRun}
                className="gap-2"
              >
                {importWithMapping.isPending ? <Spinner className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                Preview import
              </Button>
            </div>
          )}

          {step === "preview" && importResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Preview of the first {importResult.preview.length} rows that would be updated.
                Review the changes below, then click <strong>Commit Import</strong> to apply.
              </p>
              <div className="rounded-md border overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Master Code</th>
                      <th className="text-left px-3 py-2 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono">{row.masterCode}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {Object.entries(row.changes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setStep("map")}>← Back to mapping</Button>
                <Button
                  onClick={runImport}
                  disabled={importWithMapping.isPending}
                  className="gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                >
                  {importWithMapping.isPending ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  Commit import
                </Button>
              </div>
            </div>
          )}

          {step === "done" && importResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {importResult.updated} updated
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  {importResult.skipped} skipped
                </Badge>
                {importResult.errors.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1 max-h-48 overflow-y-auto">
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive font-mono">{e}</p>
                  ))}
                </div>
              )}
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Upload another file
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
