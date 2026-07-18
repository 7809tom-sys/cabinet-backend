import { useState, useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";

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

export default function DistributorImport() {
  const [distributorId, setDistributorId] = useState<string>("");
  /** Optional: override door style for ALL rows. If blank, each row's Door Style column is used. */
  const [styleId, setStyleId] = useState<string>("");
  const [csv, setCsv] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: dists } = trpc.distributorAdmin.adminList.useQuery();
  const { data: styles } = trpc.distributorAdmin.adminStyles.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: Boolean(distributorId) }
  );

  type PreviewData =
    inferRouterOutputs<AppRouter>["distributorAdmin"]["importPreview"];
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

  return (
    <div className="space-y-6">
      {/* ── Master catalog export ─────────────────────────────────────── */}
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

      {/* ── Distributor product import ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Distributor product import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-medium">Required spreadsheet columns</p>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              <li>
                <span className="font-mono">SKU</span> (or: Code, Item, Model,
                Part #) — the distributor's own SKU or the platform master code.
                Aliases are matched automatically.
              </li>
              <li>
                <span className="font-mono">Door Style</span> (or: Style, Style
                Code, Finish) — matched against this distributor's door styles.
                Required when pricing columns are present and no style override
                is chosen below.
              </li>
              <li>
                <span className="font-mono">List Price</span> and/or{" "}
                <span className="font-mono">Your Cost</span> — at least one
                price or a Description column must be present.
              </li>
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Distributor picker — always required */}
            <div>
              <label className="text-sm font-medium">
                Distributor line <span className="text-destructive">*</span>
              </label>
              <Select
                value={distributorId}
                onValueChange={(v) => {
                  setDistributorId(v);
                  setStyleId("");
                  setPreview(null);
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

            {/* Style override — optional; per-row Door Style column takes precedence when blank */}
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
                  <SelectItem value="">Use Door Style column per row</SelectItem>
                  {(styles ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.ourName}
                      {s.styleCode ? ` (${s.styleCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {distributorId && !styleId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Each row's Door Style column will be matched against this
                  distributor's styles.
                </p>
              )}
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
              placeholder="SKU,Door Style,List Price,Your Cost&#10;B-24,Shaker White,310.00,108.50&#10;W-30-30,Shaker White,182.00,63.70"
              className="mt-1 h-32 font-mono text-xs"
            />
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

      {/* ── Preview results ───────────────────────────────────────────── */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview results</CardTitle>
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
                (preview.summary as { aliasMatched: number }).aliasMatched >
                  0 && (
                  <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
                    <Link2 className="mr-1 h-3 w-3" />
                    {(preview.summary as { aliasMatched: number }).aliasMatched}{" "}
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
                                  (r as { resolvedMasterCode: string })
                                    .resolvedMasterCode
                                }
                              </span>
                            )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {"resolvedStyleName" in r
                            ? (r as { resolvedStyleName: string | null })
                                .resolvedStyleName ?? (
                                <span className="text-amber-600">—</span>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
