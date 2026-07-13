import { useEffect, useRef, useState } from "react";
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
  Link2,
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
type ParseColumnsOutput = inferRouterOutputs<AppRouter>["distributorAdmin"]["parseXlsxColumns"];
type XlsxSheet = ParseColumnsOutput["sheets"][number];

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

// ─── Unmatched SKU Alias Resolution Panel ────────────────────────────────────
/**
 * After an import, shows all unmatched distributor SKU codes with an input
 * next to each one. Admin types the correct cabinet master code and clicks
 * "Save aliases" to create the mapping so the next import resolves them.
 */
function UnmatchedAliasPanel({
  unmatchedCodes,
  distributorId,
}: {
  unmatchedCodes: string[];
  distributorId: number;
}) {
  const [aliases, setAliases] = useState<Record<string, string>>(
    () => Object.fromEntries(unmatchedCodes.map((c) => [c, ""]))
  );
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const saveAliasesMut = trpc.distributorAdmin.saveSkuAliases.useMutation({
    onSuccess: (r) => {
      setSavedSet((prev) => {
        const next = new Set(prev);
        r.saved > 0 && Object.entries(aliases).forEach(([raw, master]) => {
          if (master.trim()) next.add(raw);
        });
        return next;
      });
      if (r.notFound.length > 0) {
        toast.error(`Cabinet codes not found: ${r.notFound.join(", ")}`);
      } else {
        toast.success(`${r.saved} alias${r.saved !== 1 ? "es" : ""} saved — re-import to apply.`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingCodes = unmatchedCodes.filter((c) => !savedSet.has(c));
  if (pendingCodes.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
        <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All aliases saved — re-import the file to apply them.
        </p>
      </div>
    );
  }

  const filledCount = pendingCodes.filter((c) => aliases[c]?.trim()).length;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {pendingCodes.length} model number{pendingCodes.length !== 1 ? "s" : ""} not found — type the correct cabinet code next to each one:
      </p>
      <div className="space-y-2">
        {pendingCodes.map((code) => (
          <div key={code} className="flex items-center gap-2">
            <code className="text-xs font-mono bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded text-amber-900 dark:text-amber-200 min-w-[120px] shrink-0">
              {code}
            </code>
            <span className="text-amber-600 text-xs shrink-0">=</span>
            <Input
              className="h-7 text-xs font-mono flex-1 max-w-[200px]"
              placeholder="e.g. B24, DB-24-3"
              value={aliases[code] ?? ""}
              onChange={(e) => setAliases((prev) => ({ ...prev, [code]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filledCount > 0) {
                  const toSave = pendingCodes
                    .filter((c) => aliases[c]?.trim())
                    .map((c) => ({ rawCode: c, masterCode: aliases[c].trim() }));
                  if (toSave.length > 0) saveAliasesMut.mutate({ aliases: toSave, distributorId });
                }
              }}
            />
          </div>
        ))}
      </div>
      <Button
        size="sm"
        disabled={filledCount === 0 || saveAliasesMut.isPending}
        className="bg-amber-600 hover:bg-amber-700 text-white"
        onClick={() => {
          const toSave = pendingCodes
            .filter((c) => aliases[c]?.trim())
            .map((c) => ({ rawCode: c, masterCode: aliases[c].trim() }));
          if (toSave.length > 0) saveAliasesMut.mutate({ aliases: toSave, distributorId });
        }}
      >
        {saveAliasesMut.isPending ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
        Save {filledCount > 0 ? filledCount : ""} alias{filledCount !== 1 ? "es" : ""}
      </Button>
    </div>
  );
}

// ─── Column Mapping Step ───────────────────────────────────────────────────
/**
 * Multi-column mapping step: shows ALL price columns from the spreadsheet in a
 * table. Each row lets the admin assign a door style (and price type) to that
 * column. Saved mappings are pre-filled from the database. Imports all selected
 * columns in one shot.
 */
function MultiColumnMappingStep({
  sheets,
  distributorId,
  fileBase64,
  filename,
  onDone,
  onReset,
}: {
  sheets: XlsxSheet[];
  distributorId: number;
  fileBase64: string;
  filename: string;
  onDone: () => void;
  onReset: () => void;
}) {
  const [sheetName, setSheetName] = useState(sheets[0]?.name ?? "");
  const activeSheet = sheets.find((s) => s.name === sheetName) ?? sheets[0];
  const headers = activeSheet?.headers ?? [];

  // Auto-detect the SKU column
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

  // Columns to skip (non-price columns)
  const SKIP_COLS = new Set(["description", "assemble", "assembled", "taxable", "hinge", "notes", "note"]);
  const priceColumns = headers.filter(
    (h) => h !== skuCol && !SKIP_COLS.has(h.toLowerCase())
  );

  // Load all door styles for this distributor
  const { data: allStyles } = trpc.distributorAdmin.adminStyles.useQuery(
    { distributorId },
    { enabled: distributorId > 0 }
  );

  // Load saved column mappings for this distributor
  const { data: savedMappings } = trpc.distributorAdmin.getColumnMappings.useQuery(
    { distributorId },
    { enabled: distributorId > 0 }
  );

  // Per-column state: { doorStyleId, priceType, enabled }
  type ColMapping = { doorStyleId: string; priceType: "list" | "cost"; enabled: boolean };
  const [colMappings, setColMappings] = useState<Record<string, ColMapping>>({});

  // Fuzzy match a column code against door style names/codes
  function autoMatchStyle(col: string): string {
    if (!allStyles || allStyles.length === 0) return "";
    const colLower = col.toLowerCase();
    // 1. Exact style code match
    const exactCode = allStyles.find((s) => s.styleCode?.toLowerCase() === colLower);
    if (exactCode) return String(exactCode.id);
    // 2. Style code starts with col
    const codePrefix = allStyles.find((s) => s.styleCode?.toLowerCase().startsWith(colLower));
    if (codePrefix) return String(codePrefix.id);
    // 3. Style name contains all letters of col as initials
    // e.g. SW → "Shaker White", GR → "Gray", SE → "Stone/Espresso"
    const nameWords = (name: string) => name.toLowerCase().split(/[\s\-_/]+/);
    const initials = allStyles.find((s) => {
      const words = nameWords(s.ourName);
      const firstLetters = words.map((w) => w[0] ?? "").join("");
      return firstLetters.includes(colLower) || firstLetters === colLower;
    });
    if (initials) return String(initials.id);
    // 4. Style name contains col as substring
    const nameContains = allStyles.find((s) => s.ourName.toLowerCase().includes(colLower));
    if (nameContains) return String(nameContains.id);
    return "";
  }

  // Pre-fill from saved mappings (or auto-suggest) once loaded — must be in useEffect, not render
  const savedRef = useRef(false);
  useEffect(() => {
    if (savedMappings !== undefined && allStyles !== undefined && !savedRef.current && priceColumns.length > 0) {
      savedRef.current = true;
      const initial: Record<string, ColMapping> = {};
      for (const col of priceColumns) {
        const saved = savedMappings.find((m) => m.columnCode === col);
        if (saved) {
          initial[col] = {
            doorStyleId: String(saved.doorStyleId),
            priceType: saved.priceType as "list" | "cost",
            enabled: true,
          };
        } else {
          const suggested = autoMatchStyle(col);
          initial[col] = {
            doorStyleId: suggested,
            priceType: "list",
            enabled: Boolean(suggested),
          };
        }
      }
      setColMappings(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMappings, allStyles, priceColumns.join("|")]);

  function setColField<K extends keyof ColMapping>(col: string, field: K, value: ColMapping[K]) {
    setColMappings((prev) => ({
      ...prev,
      [col]: { ...(prev[col] ?? { doorStyleId: "", priceType: "list", enabled: false }), [field]: value },
    }));
  }

  const activeMappings = priceColumns
    .filter((col) => colMappings[col]?.enabled && colMappings[col]?.doorStyleId)
    .map((col) => ({
      columnCode: col,
      doorStyleId: Number(colMappings[col].doorStyleId),
      priceType: colMappings[col].priceType,
    }));

  const importAllMut = trpc.distributorAdmin.importAllColumns.useMutation({
    onSuccess: (r) => {
      if (r.dryRun) return;
      const total = r.results.reduce((s, x) => s + x.priced, 0);
      const totalUnmatched = r.results.reduce((s, x) => s + x.unmatched, 0);
      toast.success(
        `Imported ${total} prices across ${r.results.length} styles.` +
        (totalUnmatched > 0 ? ` ${totalUnmatched} unmatched SKUs — see details below.` : "")
      );
      if (totalUnmatched === 0) onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const dryRunResult = importAllMut.data?.dryRun ? importAllMut.data : null;
  const commitResult = importAllMut.data && !importAllMut.data.dryRun ? importAllMut.data : null;

  const canImport = activeMappings.length > 0 && Boolean(skuCol);

  // Sample prices for the first data row (for preview column)
  const firstRow = activeSheet?.previewRows?.[0] ?? {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Table2 className="h-4 w-4" /> Map price columns to door styles
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

      {/* SKU column selector */}
      <div className="flex items-center gap-3">
        <Label className="text-xs font-medium whitespace-nowrap">
          Model / SKU column <span className="text-destructive">*</span>
        </Label>
        <Select value={skuCol} onValueChange={setSkuCol}>
          <SelectTrigger className="h-8 text-sm w-48">
            <SelectValue placeholder="Select column…" />
          </SelectTrigger>
          <SelectContent>
            {headers.map((h) => (
              <SelectItem key={h} value={h}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {activeSheet?.previewRows?.length ?? 0}+ rows detected
        </span>
      </div>

      {/* Multi-column mapping table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-8">
                <input
                  type="checkbox"
                  checked={priceColumns.every((c) => colMappings[c]?.enabled)}
                  onChange={(e) => {
                    setColMappings((prev) => {
                      const next = { ...prev };
                      for (const col of priceColumns) {
                        next[col] = { ...(prev[col] ?? { doorStyleId: "", priceType: "list" as const }), enabled: e.target.checked };
                      }
                      return next;
                    });
                  }}
                  className="cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Column</th>
              <th className="px-3 py-2 text-left font-medium">Sample price</th>
              <th className="px-3 py-2 text-left font-medium">Door style</th>
              <th className="px-3 py-2 text-left font-medium">Price type</th>
            </tr>
          </thead>
          <tbody>
            {priceColumns.map((col) => {
              const mapping = colMappings[col] ?? { doorStyleId: "", priceType: "list" as const, enabled: false };
              const sampleVal = firstRow[col];
              return (
                <tr key={col} className={`border-t transition-colors ${mapping.enabled ? "bg-background" : "bg-muted/20 opacity-60"}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={mapping.enabled}
                      onChange={(e) => setColField(col, "enabled", e.target.checked)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{col}</code>
                    {savedMappings?.find((m) => m.columnCode === col) && (
                      <span className="ml-1.5 text-[10px] text-emerald-600 font-medium">saved</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                    {sampleVal != null ? String(sampleVal) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={mapping.doorStyleId || "__none__"}
                      onValueChange={(v) => {
                        const val = v === "__none__" ? "" : v;
                        setColField(col, "doorStyleId", val);
                        if (val) setColField(col, "enabled", true);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-full min-w-[160px]">
                        <SelectValue placeholder="— Not imported —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Not imported —</SelectItem>
                        {(allStyles ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.ourName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={mapping.priceType}
                      onValueChange={(v) => setColField(col, "priceType", v as "list" | "cost")}
                      disabled={!mapping.enabled}
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="list">List price</SelectItem>
                        <SelectItem value="cost">My cost</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {activeMappings.length} of {priceColumns.length} columns selected for import.
        Mappings are saved automatically and pre-filled next time you upload this distributor's sheet.
      </p>

      {/* Dry-run results */}
      {dryRunResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Preview results:</p>
          <div className="space-y-1">
            {dryRunResult.results.map((r) => {
              const style = allStyles?.find((s) => s.id === r.doorStyleId);
              return (
                <div key={r.columnCode} className="flex items-center gap-3 text-xs">
                  <code className="font-mono bg-muted px-1 rounded">{r.columnCode}</code>
                  <span className="text-muted-foreground">{style?.ourName ?? `Style #${r.doorStyleId}`}</span>
                  <span className="text-emerald-600 font-medium">{r.matched} match</span>
                  {r.unmatched > 0 && <span className="text-amber-600">{r.unmatched} unmatched</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Commit results with unmatched codes — inline alias resolution */}
      {commitResult && commitResult.results.some((r) => r.unmatched > 0) && (
        <UnmatchedAliasPanel
          unmatchedCodes={Array.from(new Set(commitResult.results.flatMap((r) => r.unmatchedCodes)))}
          distributorId={distributorId}
        />
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canImport || importAllMut.isPending}
          variant="outline"
          onClick={() =>
            importAllMut.mutate({
              distributorId,
              fileBase64,
              filename,
              skuColumn: skuCol,
              mappings: activeMappings,
              dryRun: true,
            })
          }
        >
          {importAllMut.isPending && importAllMut.variables?.dryRun ? (
            <Spinner className="mr-1.5 h-4 w-4" />
          ) : null}
          Preview
        </Button>

        {dryRunResult && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-emerald-600 font-medium">
              {dryRunResult.results.reduce((s, r) => s + r.matched, 0)} will match
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        <Button
          disabled={!canImport || importAllMut.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() =>
            importAllMut.mutate({
              distributorId,
              fileBase64,
              filename,
              skuColumn: skuCol,
              mappings: activeMappings,
              dryRun: false,
            })
          }
        >
          {importAllMut.isPending && !importAllMut.variables?.dryRun ? (
            <Spinner className="mr-1.5 h-4 w-4" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Import {activeMappings.length} style{activeMappings.length !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

/**
 * Legacy single-column mapping step (kept for backward compatibility).
 * @deprecated Use MultiColumnMappingStep instead.
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
          <Select value={descCol || "__skip__"} onValueChange={(v) => setDescCol(v === "__skip__" ? "" : v)}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue placeholder="Skip description" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__skip__">— Skip —</SelectItem>
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

      {/* Unmatched codes from last run — inline alias resolution */}
      {commitResult && commitResult.unmatched > 0 && (
        <UnmatchedAliasPanel
          unmatchedCodes={commitResult.unmatchedCodes}
          distributorId={distributorId}
        />
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

  // ── Google Drive link flow ────────────────────────────────────────────────
  const [driveLink, setDriveLink] = useState("");
  const driveMut = trpc.distributorAdmin.fetchFromDriveLink.useMutation({
    onSuccess: (r) => {
      setXlsxFile({ base64: r.base64, name: r.filename });
      setDriveLink("");
      toast.success(`Downloaded "${r.filename}" from Google Drive (${(r.sizeBytes / 1024).toFixed(0)} KB)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const parseColumnsMut = trpc.distributorAdmin.parseXlsxColumns.useMutation({
    onSuccess: (data) => { setXlsxSheets(data.sheets); setXlsxParsing(false); },
    onError: (e) => { toast.error(e.message); setXlsxFile(null); setXlsxParsing(false); },
  });

  function onXlsxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setXlsxSheets(null);
    setXlsxParsing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const fileData = { base64: b64, name: f.name };
      setXlsxFile(fileData);
      parseColumnsMut.mutate({ fileBase64: b64, filename: f.name });
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

            {/* Loading overlay while parsing */}
            {(xlsxParsing || parseColumnsMut.isPending || driveMut.isPending) && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Spinner className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {driveMut.isPending ? "Downloading from Google Drive…" : "Parsing spreadsheet…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {xlsxFile?.name ?? "Reading file columns and rows"}
                  </p>
                </div>
                <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: "60%" }} />
                </div>
              </div>
            )}

            {!xlsxSheets && !(xlsxParsing || parseColumnsMut.isPending || driveMut.isPending) ? (
              <div className="space-y-3">
                {/* Local file upload */}
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
                    disabled={xlsxParsing || parseColumnsMut.isPending || driveMut.isPending}
                    onClick={() => xlsxFileRef.current?.click()}
                  >
                    {(xlsxParsing || parseColumnsMut.isPending) ? (
                      <Spinner className="mr-1.5 h-4 w-4" />
                    ) : (
                      <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                    )}
                    {xlsxFile ? xlsxFile.name : "Choose file from device…"}
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Supports .xlsx and .csv — any column layout
                  </p>
                </div>

                {/* Google Drive link */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Or paste a Google Drive share link
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={driveLink}
                      onChange={(e) => setDriveLink(e.target.value)}
                      placeholder="https://drive.google.com/file/d/…/view"
                      className="flex-1 h-8 text-sm font-mono"
                      disabled={driveMut.isPending}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!driveLink.trim() || driveMut.isPending}
                      onClick={() => driveMut.mutate({ url: driveLink.trim() })}
                    >
                      {driveMut.isPending ? (
                        <Spinner className="mr-1.5 h-4 w-4" />
                      ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                      )}
                      Fetch
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The file must be shared as <strong>"Anyone with the link can view"</strong>.
                    Supports Google Sheets and any .xlsx or .csv file in Drive.
                  </p>
                </div>
              </div>
            ) : !xlsxSheets ? null : (
              <MultiColumnMappingStep
                sheets={xlsxSheets}
                distributorId={Number(distributorId)}
                fileBase64={xlsxFile!.base64}
                filename={xlsxFile!.name}
                onDone={() => { setXlsxFile(null); setXlsxSheets(null); }}
                onReset={() => { setXlsxFile(null); setXlsxSheets(null); }}
              />
            )}

            {!xlsxSheets && !distributorId && (
              <p className="text-xs text-amber-600">Select a distributor first before uploading.</p>
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
