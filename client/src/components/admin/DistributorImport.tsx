import { useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Plus,
  CheckCheck,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  RotateCcw,
  Table2,
} from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  "create-info": "New item",
  "update-info": "Update",
  "price-only": "Price only",
  error: "Error",
};
const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "create-info": "default",
  "update-info": "secondary",
  "price-only": "outline",
  error: "destructive",
};

type PreviewData = inferRouterOutputs<AppRouter>["distributorAdmin"]["importPreview"];
type PreviewRow = PreviewData["rows"][number];
type XlsxSheet = inferRouterOutputs<AppRouter>["distributorAdmin"]["parseXlsxColumns"]["sheets"][number];

/** Green/yellow/red confidence indicator for each row */
function MatchBadge({ row }: { row: PreviewRow }) {
  const conf = (row as PreviewRow & { matchConfidence?: string }).matchConfidence;
  if (conf === "exact") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
        <CheckCheck className="h-3.5 w-3.5" /> Exact
      </span>
    );
  }
  if (conf === "normalized" || conf === "alias") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
        <AlertCircle className="h-3.5 w-3.5" />
        {conf === "alias" ? "Alias" : "Fuzzy"}
      </span>
    );
  }
  if (row.action === "create-info") {
    return (
      <span className="inline-flex items-center gap-1 text-blue-500 text-xs font-medium">
        <Plus className="h-3.5 w-3.5" /> New
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
      <HelpCircle className="h-3.5 w-3.5" /> No match
    </span>
  );
}

/** Row background based on confidence */
function rowBg(row: PreviewRow): string {
  const conf = (row as PreviewRow & { matchConfidence?: string }).matchConfidence;
  if (row.action === "error") return "bg-destructive/5";
  if (conf === "exact") return "";
  if (conf === "normalized" || conf === "alias") return "bg-amber-50 dark:bg-amber-950/20";
  if (row.action === "create-info") return "bg-blue-50 dark:bg-blue-950/20";
  return "bg-destructive/5";
}

// ─── Add Distributor Dialog ────────────────────────────────────────────────
function AddDistributorDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const mut = trpc.distributorAdmin.addDistributor.useMutation({
    onSuccess: (r) => {
      onCreated(r.id, r.name);
      setName("");
      setBrandName("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add distributor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Internal name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Skyline Cabinetry"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Brand name (optional)</Label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Skyline"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || mut.isPending}
            onClick={() => mut.mutate({ name: name.trim(), brandName: brandName.trim() || undefined })}
          >
            {mut.isPending ? <Spinner className="mr-1.5 h-4 w-4" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Door Style Dialog ─────────────────────────────────────────────────
function AddDoorStyleDialog({
  open,
  distributorId,
  onClose,
  onCreated,
}: {
  open: boolean;
  distributorId: number;
  onClose: () => void;
  onCreated: (id: number, ourName: string) => void;
}) {
  const [ourName, setOurName] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const mut = trpc.distributorAdmin.addDoorStyle.useMutation({
    onSuccess: (r) => {
      onCreated(r.id, r.ourName);
      setOurName("");
      setStyleCode("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add door style</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Display name *</Label>
            <Input
              value={ourName}
              onChange={(e) => setOurName(e.target.value)}
              placeholder="e.g. White Shaker Skyline"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Style code *</Label>
            <Input
              value={styleCode}
              onChange={(e) => setStyleCode(e.target.value)}
              placeholder="e.g. WS-SKY"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!ourName.trim() || !styleCode.trim() || mut.isPending || !distributorId}
            onClick={() =>
              mut.mutate({ distributorId, ourName: ourName.trim(), styleCode: styleCode.trim() })
            }
          >
            {mut.isPending ? <Spinner className="mr-1.5 h-4 w-4" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Column Mapping Step ───────────────────────────────────────────────────
/**
 * After an XLSX/CSV is parsed, this step lets the admin choose:
 *  - Which sheet (if multi-sheet workbook)
 *  - Which column = model/SKU
 *  - Which column = price
 *  - Whether price is list or cost
 *  - Which column = description (optional)
 */
function ColumnMappingStep({
  sheets,
  distributorId,
  styleId,
  fileBase64,
  filename,
  onDone,
  onReset,
}: {
  sheets: XlsxSheet[];
  distributorId: number;
  styleId: number;
  fileBase64: string;
  filename: string;
  onDone: () => void;
  onReset: () => void;
}) {
  const [sheetName, setSheetName] = useState(sheets[0]?.name ?? "");
  const activeSheet = sheets.find((s) => s.name === sheetName) ?? sheets[0];
  const headers = activeSheet?.headers ?? [];

  // Auto-detect common column names
  function autoDetect(candidates: string[]): string {
    for (const c of candidates) {
      const found = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()));
      if (found) return found;
    }
    return "";
  }

  const [skuCol, setSkuCol] = useState(() =>
    autoDetect(["model", "sku", "item", "code", "part", "number"])
  );
  const [priceCol, setPriceCol] = useState(() =>
    autoDetect(["list", "price", "msrp", "cost", "dealer"])
  );
  const [priceType, setPriceType] = useState<"listPrice" | "yourCost">(() => {
    const p = autoDetect(["list", "msrp"]);
    return p ? "listPrice" : "yourCost";
  });
  const [descCol, setDescCol] = useState(() =>
    autoDetect(["desc", "name", "product"])
  );

  const importMut = trpc.distributorAdmin.importWithMapping.useMutation({
    onSuccess: (r) => {
      if (r.dryRun) return; // handled below
      const aliasMsg = r.aliasesLearned ? `, ${r.aliasesLearned} aliases learned` : "";
      const unmatchedMsg = r.unmatched > 0 ? ` (${r.unmatched} unmatched — see below)` : "";
      toast.success(`Import complete — ${r.matched} matched, ${r.priced} priced, ${r.skipped} skipped${aliasMsg}${unmatchedMsg}.`);
      if (r.unmatched === 0) onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const dryRunResult = importMut.data?.dryRun ? importMut.data : null;
  const commitResult = importMut.data && !importMut.data.dryRun ? importMut.data : null;

  const canRun = Boolean(skuCol) && Boolean(priceCol) && Boolean(distributorId) && Boolean(styleId);

  // Preview table of first rows using current mapping
  const previewRows = (activeSheet?.previewRows ?? []).slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Table2 className="h-4 w-4" /> Map columns
        </h3>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Choose different file
        </Button>
      </div>

      {/* Sheet selector (only shown for multi-sheet workbooks) */}
      {sheets.length > 1 && (
        <div>
          <Label className="text-xs font-medium">Sheet</Label>
          <Select value={sheetName} onValueChange={setSheetName}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.headers.length} columns, {s.previewRows.length}+ rows)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Column mapping grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* SKU column */}
        <div>
          <Label className="text-xs font-medium">
            Model / SKU column <span className="text-destructive">*</span>
          </Label>
          <Select value={skuCol} onValueChange={setSkuCol}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue placeholder="Select column…" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price column */}
        <div>
          <Label className="text-xs font-medium">
            Price column <span className="text-destructive">*</span>
          </Label>
          <Select value={priceCol} onValueChange={setPriceCol}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue placeholder="Select column…" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price type */}
        <div>
          <Label className="text-xs font-medium">
            Price type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={priceType}
            onValueChange={(v) => setPriceType(v as "listPrice" | "yourCost")}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="listPrice">List price (MSRP)</SelectItem>
              <SelectItem value="yourCost">My cost (dealer cost)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Description column (optional) */}
        <div>
          <Label className="text-xs font-medium">
            Description column <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Select value={descCol} onValueChange={setDescCol}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue placeholder="Skip description" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Skip —</SelectItem>
              {headers.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data preview table */}
      {previewRows.length > 0 && skuCol && priceCol && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Preview of first {previewRows.length} rows with your mapping:
          </p>
          <div className="overflow-x-auto rounded-md border text-xs">
            <table className="w-full text-left">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Model / SKU</th>
                  <th className="px-2 py-1.5 font-medium">
                    {priceType === "listPrice" ? "List price" : "My cost"}
                  </th>
                  {descCol && <th className="px-2 py-1.5 font-medium">Description</th>}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1 font-mono">{row[skuCol] || "—"}</td>
                    <td className="px-2 py-1">{row[priceCol] || "—"}</td>
                    {descCol && <td className="px-2 py-1 truncate max-w-[200px]">{row[descCol] || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unmatched codes from last run */}
      {commitResult && commitResult.unmatched > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {commitResult.unmatched} model numbers did not match any cabinet in the master catalog:
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {commitResult.unmatchedCodes.slice(0, 30).map((c) => (
              <code key={c} className="text-[10px] bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded font-mono text-amber-900 dark:text-amber-200">
                {c}
              </code>
            ))}
            {commitResult.unmatchedCodes.length > 30 && (
              <span className="text-[10px] text-amber-700">+{commitResult.unmatchedCodes.length - 30} more</span>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canRun || importMut.isPending}
          variant="outline"
          onClick={() =>
            importMut.mutate({
              fileBase64,
              filename,
              sheetName,
              skuColumn: skuCol,
              priceColumn: priceCol,
              priceType,
              descriptionColumn: descCol || undefined,
              distributorId,
              styleId,
              dryRun: true,
            })
          }
        >
          {importMut.isPending && importMut.variables?.dryRun ? (
            <Spinner className="mr-1.5 h-4 w-4" />
          ) : null}
          Preview
        </Button>

        {dryRunResult && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-emerald-600 font-medium">{dryRunResult.matched} will match</span>
            {dryRunResult.unmatched > 0 && (
              <span className="text-amber-600">{dryRunResult.unmatched} unmatched</span>
            )}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        <Button
          disabled={!canRun || importMut.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() =>
            importMut.mutate({
              fileBase64,
              filename,
              sheetName,
              skuColumn: skuCol,
              priceColumn: priceCol,
              priceType,
              descriptionColumn: descCol || undefined,
              distributorId,
              styleId,
              dryRun: false,
            })
          }
        >
          {importMut.isPending && !importMut.variables?.dryRun ? (
            <Spinner className="mr-1.5 h-4 w-4" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Import prices
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function DistributorImport() {
  const [distributorId, setDistributorId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [csv, setCsv] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const xlsxFileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const [showAddDist, setShowAddDist] = useState(false);
  const [showAddStyle, setShowAddStyle] = useState(false);

  const { data: dists, refetch: refetchDists } = trpc.distributorAdmin.adminList.useQuery();
  const { data: styles, refetch: refetchStyles } = trpc.distributorAdmin.adminStyles.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: Boolean(distributorId) }
  );

  const [preview, setPreview] = useState<PreviewData | null>(null);

  // ── XLSX/CSV column-mapping flow ─────────────────────────────────────────
  const [xlsxFile, setXlsxFile] = useState<{ base64: string; name: string } | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<XlsxSheet[] | null>(null);
  const [xlsxParsing, setXlsxParsing] = useState(false);

  const parseColumnsMut = trpc.distributorAdmin.parseXlsxColumns.useQuery(
    { fileBase64: xlsxFile?.base64 ?? "", filename: xlsxFile?.name ?? "" },
    { enabled: Boolean(xlsxFile) }
  );

  // React to parse results
  const parseData = parseColumnsMut.data;
  const parseError = parseColumnsMut.error;
  const prevParseDataRef = useRef<typeof parseData>(undefined);
  const prevParseErrorRef = useRef<typeof parseError>(undefined);
  if (parseData !== prevParseDataRef.current) {
    prevParseDataRef.current = parseData;
    if (parseData) setXlsxSheets(parseData.sheets);
  }
  if (parseError !== prevParseErrorRef.current) {
    prevParseErrorRef.current = parseError;
    if (parseError) { toast.error(parseError.message); setXlsxFile(null); }
  }

  function onXlsxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setXlsxSheets(null);
    setXlsxParsing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      setXlsxFile({ base64: b64, name: f.name });
      setXlsxParsing(false);
    };
    reader.readAsDataURL(f);
    // Reset the input so the same file can be re-selected
    e.target.value = "";
  }

  // ── CSV paste / legacy flow ───────────────────────────────────────────────
  const previewMut = trpc.distributorAdmin.importPreview.useMutation({
    onSuccess: (data) => setPreview(data),
    onError: (e) => toast.error(e.message),
  });
  const commitMut = trpc.distributorAdmin.importCommit.useMutation({
    onSuccess: (r) => {
      const aliasMsg = r.aliasesLearned ? `, ${r.aliasesLearned} aliases learned` : "";
      toast.success(
        `Imported: ${r.created} created, ${r.updated} updated, ${r.priced} priced, ${r.skipped} skipped${aliasMsg}.`
      );
      setPreview(null);
      setCsv("");
    },
    onError: (e) => toast.error(e.message),
  });

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

  const canRunCsv = Boolean(distributorId) && csv.trim().length > 0;

  // Summary stats for confidence breakdown
  const confidenceCounts = preview
    ? {
        exact: preview.rows.filter((r) => (r as PreviewRow & { matchConfidence?: string }).matchConfidence === "exact").length,
        fuzzy: preview.rows.filter((r) => {
          const c = (r as PreviewRow & { matchConfidence?: string }).matchConfidence;
          return c === "normalized" || c === "alias";
        }).length,
        none: preview.rows.filter((r) => (r as PreviewRow & { matchConfidence?: string }).matchConfidence === "none" && r.action !== "create-info").length,
        newItems: preview.rows.filter((r) => r.action === "create-info").length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Add Distributor Dialog */}
      <AddDistributorDialog
        open={showAddDist}
        onClose={() => setShowAddDist(false)}
        onCreated={(id, name) => {
          refetchDists();
          setDistributorId(String(id));
          setShowAddDist(false);
          toast.success(`Now using "${name}" as the active distributor.`);
        }}
      />

      {/* Add Door Style Dialog */}
      <AddDoorStyleDialog
        open={showAddStyle}
        distributorId={Number(distributorId)}
        onClose={() => setShowAddStyle(false)}
        onCreated={(id, ourName) => {
          refetchStyles();
          setStyleId(String(id));
          setShowAddStyle(false);
          toast.success(`Style "${ourName}" created and selected.`);
        }}
      />

      {/* ── Master catalog export ─────────────────────────────────────────── */}
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
          <Button onClick={downloadMasterCatalog} disabled={exporting} className="shrink-0">
            {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            Download master catalog (CSV)
          </Button>
        </CardContent>
      </Card>

      {/* ── Distributor + style selectors ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Distributor price import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Upload a distributor's price list (XLSX or CSV) to import prices for a door style.
            Pick your file — the system detects the columns and lets you choose which one is the
            model number and which is the price before anything is saved.
          </p>

          {/* Distributor + style row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-sm font-medium">Distributor line</Label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={distributorId}
                  onValueChange={(v) => {
                    setDistributorId(v);
                    setStyleId("");
                    setPreview(null);
                    setXlsxSheets(null);
                    setXlsxFile(null);
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a distributor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dists ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}{d.brandName ? ` (${d.brandName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  title="Add new distributor"
                  onClick={() => setShowAddDist(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">
                Door style <span className="text-muted-foreground text-xs">(required for price import)</span>
              </Label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={styleId}
                  onValueChange={(v) => {
                    setStyleId(v);
                    setPreview(null);
                  }}
                  disabled={!distributorId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a style" />
                  </SelectTrigger>
                  <SelectContent>
                    {(styles ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.ourName} ({s.styleCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  title="Add new door style"
                  disabled={!distributorId}
                  onClick={() => setShowAddStyle(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── XLSX/CSV upload with column mapping ─────────────────────── */}
          <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Upload spreadsheet (XLSX or CSV)</p>
              {xlsxSheets && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setXlsxFile(null); setXlsxSheets(null); }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Change file
                </Button>
              )}
            </div>

            {!xlsxSheets ? (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={xlsxFileRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={onXlsxFile}
                />
                <Button
                  variant="outline"
                  disabled={xlsxParsing || parseColumnsMut.isFetching}
                  onClick={() => xlsxFileRef.current?.click()}
                >
                  {(xlsxParsing || parseColumnsMut.isFetching) ? (
                    <Spinner className="mr-1.5 h-4 w-4" />
                  ) : (
                    <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                  )}
                  {xlsxFile ? xlsxFile.name : "Choose file…"}
                </Button>
                <p className="text-xs text-muted-foreground self-center">
                  Supports .xlsx and .csv — any column layout, any number of columns
                </p>
              </div>
            ) : (
              <ColumnMappingStep
                sheets={xlsxSheets}
                distributorId={Number(distributorId)}
                styleId={Number(styleId)}
                fileBase64={xlsxFile!.base64}
                filename={xlsxFile!.name}
                onDone={() => { setXlsxFile(null); setXlsxSheets(null); }}
                onReset={() => { setXlsxFile(null); setXlsxSheets(null); }}
              />
            )}

            {!xlsxSheets && !distributorId && (
              <p className="text-xs text-amber-600">Select a distributor first before uploading.</p>
            )}
            {!xlsxSheets && distributorId && !styleId && (
              <p className="text-xs text-amber-600">Select a door style before uploading so prices are saved correctly.</p>
            )}
          </div>

          {/* ── CSV paste / legacy flow ──────────────────────────────────── */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Advanced: paste CSV or use template format
            </summary>
            <div className="mt-3 space-y-3 pl-4 border-l border-border">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-1.5 h-4 w-4" /> Download template
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onCsvFile}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" /> Upload CSV file
                </Button>
              </div>

              <div>
                <Label className="text-sm font-medium">Or paste CSV</Label>
                <Textarea
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Master Code,List Price,Your Cost"
                  className="mt-1 h-32 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Minimal format: <code>Master Code</code> + <code>List Price</code> (or <code>Your Cost</code>).
                  Use <code>NA</code>, <code>X</code>, or leave blank to mark as unavailable.
                </p>
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
                  {previewMut.isPending ? <Spinner className="mr-1.5 h-4 w-4" /> : null}
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
            </div>
          </details>
        </CardContent>
      </Card>

      {/* ── CSV preview results ───────────────────────────────────────────── */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.fatalErrors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4" /> Fix before importing
                </div>
                <ul className="list-disc pl-5">
                  {preview.fatalErrors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="default">{preview.summary.toCreate} new</Badge>
              <Badge variant="secondary">{preview.summary.toUpdate} update</Badge>
              <Badge variant="outline">{preview.summary.priceOnly} price-only</Badge>
              {preview.summary.errors > 0 && (
                <Badge variant="destructive">{preview.summary.errors} error</Badge>
              )}
              <span className="text-muted-foreground self-center">
                {preview.summary.total} rows total
              </span>
            </div>

            {confidenceCounts && (
              <div className="flex flex-wrap gap-4 text-xs border rounded-md px-3 py-2 bg-muted/30">
                <span className="font-medium text-muted-foreground">Match quality:</span>
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCheck className="h-3.5 w-3.5" /> {confidenceCounts.exact} exact
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5" /> {confidenceCounts.fuzzy} fuzzy/alias
                </span>
                {confidenceCounts.newItems > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-500">
                    <Plus className="h-3.5 w-3.5" /> {confidenceCounts.newItems} new
                  </span>
                )}
                {confidenceCounts.none > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <HelpCircle className="h-3.5 w-3.5" /> {confidenceCounts.none} unmatched
                  </span>
                )}
              </div>
            )}

            {preview.unknownHeaders.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ignored columns: {preview.unknownHeaders.join(", ")}
              </p>
            )}

            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Match</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Changes</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r: PreviewRow) => (
                    <tr key={r.rowNumber} className={`border-t ${rowBg(r)}`}>
                      <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-mono">{r.masterCode || "—"}</td>
                      <td className="px-3 py-2">
                        <MatchBadge row={r} />
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={ACTION_VARIANT[r.action]}>
                          {ACTION_LABEL[r.action]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[...r.fields, r.priceTouched ? "price" : null]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.errors.length > 0 && (
                          <span className="text-destructive block">{r.errors.join(" ")}</span>
                        )}
                        {r.warnings.length > 0 && (
                          <span className="text-amber-600 block">{r.warnings.join(" ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
