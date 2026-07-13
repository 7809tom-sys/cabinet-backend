import { useState, useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
      toast.success(`Distributor "${r.name}" created.`);
      onCreated(r.id, r.name);
      setName("");
      setBrandName("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add new distributor line</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium">Line name *</label>
            <Input
              className="mt-1"
              placeholder="e.g. Skyline Cabinets"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Brand / trade name</label>
            <Input
              className="mt-1"
              placeholder="e.g. Skyline (optional)"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
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
  onCreated: (id: number, ourName: string, styleCode: string) => void;
}) {
  const [ourName, setOurName] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const mut = trpc.distributorAdmin.addDoorStyle.useMutation({
    onSuccess: (r) => {
      toast.success(`Door style "${r.ourName}" created.`);
      onCreated(r.id, r.ourName, r.styleCode);
      setOurName("");
      setStyleCode("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add new door style</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium">Style name *</label>
            <Input
              className="mt-1"
              placeholder="e.g. White Shaker"
              value={ourName}
              onChange={(e) => setOurName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Style code *</label>
            <Input
              className="mt-1"
              placeholder="e.g. WS01"
              value={styleCode}
              onChange={(e) => setStyleCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Short identifier used in filenames and imports.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!ourName.trim() || !styleCode.trim() || mut.isPending}
            onClick={() =>
              mut.mutate({
                distributorId,
                ourName: ourName.trim(),
                styleCode: styleCode.trim(),
              })
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

// ─── Main Component ────────────────────────────────────────────────────────
export default function DistributorImport() {
  const [distributorId, setDistributorId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [csv, setCsv] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const [showAddDist, setShowAddDist] = useState(false);
  const [showAddStyle, setShowAddStyle] = useState(false);

  const { data: dists, refetch: refetchDists } = trpc.distributorAdmin.adminList.useQuery();
  const { data: styles, refetch: refetchStyles } = trpc.distributorAdmin.adminStyles.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: Boolean(distributorId) }
  );

  const [preview, setPreview] = useState<PreviewData | null>(null);

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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.readAsText(f);
  }

  const canRun = Boolean(distributorId) && csv.trim().length > 0;

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Distributor product import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a distributor's catalog spreadsheet (CSV) to add or update
            product descriptions, dimensions, and pricing. Run a preview first —
            nothing is written until you commit. Imported prices start
            unpublished so you can review them before they go live.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Distributor picker + inline add */}
            <div>
              <label className="text-sm font-medium">Distributor line</label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={distributorId}
                  onValueChange={(v) => {
                    setDistributorId(v);
                    setStyleId("");
                    setPreview(null);
                  }}
                >
                  <SelectTrigger className="flex-1">
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

            {/* Door style picker + inline add */}
            <div>
              <label className="text-sm font-medium">
                Door style{" "}
                <span className="text-muted-foreground">(only if pricing included)</span>
              </label>
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
                    <SelectValue placeholder="Choose a style for prices" />
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

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" /> Download template
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
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
            <label className="text-sm font-medium">Or paste CSV</label>
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
              Minimal format: just <code>Master Code</code> + <code>List Price</code> (or <code>Your Cost</code>). System auto-fills everything else from the master catalog. Use <code>NA</code>, <code>X</code>, or leave price blank to mark a cabinet as unavailable.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              disabled={!canRun || previewMut.isPending}
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
        </CardContent>
      </Card>

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

            {/* Action summary */}
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

            {/* Match confidence legend */}
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
                          <span className="text-destructive block">
                            {r.errors.join(" ")}
                          </span>
                        )}
                        {r.warnings.length > 0 && (
                          <span className="text-amber-600 block">
                            {r.warnings.join(" ")}
                          </span>
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
