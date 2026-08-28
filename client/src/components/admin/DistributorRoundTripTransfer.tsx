import { useRef, useState } from "react";
import { Download, FileCheck2, Link2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type RoundTripPreview = {
  errors: string[];
  rows: Array<{
    rowNumber: number;
    itemCode: string;
    resolvedMasterCode: string | null;
    replacementMasterCode: string | null;
    replacesMasterCode: boolean;
    aliasesToAdd: number;
    distributorLinksToAdd: number;
    errors: string[];
  }>;
  summary: {
    total: number;
    matched: number;
    masterCodesToReplace: number;
    aliasesToAdd: number;
    distributorLinksToAdd: number;
  };
};

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Administrator-only catalog identity and distributor connection transfer. */
export function DistributorRoundTripTransfer() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<RoundTripPreview | null>(null);
  const [exporting, setExporting] = useState(false);

  const previewMutation = trpc.distributorAdmin.roundTripPreview.useMutation({
    onSuccess: (result) => setPreview(result as RoundTripPreview),
    onError: (error) => toast.error(error.message),
  });
  const commitMutation = trpc.distributorAdmin.roundTripCommit.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.rowsImported} rows: ${result.masterCodesReplaced} master codes replaced, ${result.aliasesAdded} aliases and ${result.distributorLinksAdded} eligible distributor links added.`);
      setPreview(null);
      setCsv("");
      setFileName("");
    },
    onError: (error) => toast.error(error.message),
  });

  async function downloadRoundTripTemplate() {
    setExporting(true);
    try {
      const result = await utils.distributorAdmin.roundTripExport.fetch();
      downloadCsv(result.csv, result.filename);
      toast.success(`Downloaded ${result.count} catalog records with aliases and eligible distributors.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not export distributor connections.");
    } finally {
      setExporting(false);
    }
  }

  function readCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose the CabinetDealz distributor connections CSV file.");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("This connection file is too large. The maximum size is 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setFileName(file.name);
      setPreview(null);
    };
    reader.readAsText(file);
  }

  const hasBlockingErrors = Boolean(preview?.errors.length || preview?.rows.some((row) => row.errors.length));

  return (
    <Card className="border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5 text-sky-700" /> Distributor connections — download & upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Download one round-trip CSV with the authoritative <strong className="text-foreground">item code</strong>, every recognized alias, and every eligible active distributor for each cabinet. Upload the same file to preview and add only reviewed aliases or eligible distributor links. To deliberately replace a master code, enter the new code in <strong className="text-foreground">ReplacementMasterCode</strong>; the former code stays as an alias so saved designs and orders continue to resolve. This workflow never changes prices, door styles, sellable SKUs, availability, or publication status.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadRoundTripTemplate} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" /> {exporting ? "Preparing download…" : "Download connections CSV"}
          </Button>
          <input ref={fileRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={readCsvFile} />
          <Button type="button" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Upload connections CSV
          </Button>
        </div>

        {fileName && <p className="text-xs text-muted-foreground">Selected file: <span className="font-medium text-foreground">{fileName}</span></p>}
        {csv && !preview && (
          <Button type="button" variant="secondary" onClick={() => previewMutation.mutate({ csv })} disabled={previewMutation.isPending}>
            <FileCheck2 className="mr-2 h-4 w-4" /> {previewMutation.isPending ? "Checking file…" : "Preview changes"}
          </Button>
        )}

        {preview && (
          <div className="space-y-3 rounded-lg border border-sky-200 bg-white/80 p-4 dark:border-sky-900 dark:bg-slate-950/30">
            {preview.errors.length > 0 ? (
              <p className="text-sm font-medium text-destructive">{preview.errors.join(" ")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <p><strong>{preview.summary.total}</strong> rows</p>
                  <p><strong>{preview.summary.matched}</strong> valid</p>
                  <p><strong>{preview.summary.masterCodesToReplace}</strong> master codes to replace</p>
                  <p><strong>{preview.summary.aliasesToAdd}</strong> aliases to add</p>
                  <p><strong>{preview.summary.distributorLinksToAdd}</strong> distributor links to add</p>
                </div>
                {preview.rows.some((row) => row.errors.length) && (
                  <div className="max-h-32 space-y-1 overflow-auto text-xs text-destructive">
                    {preview.rows.filter((row) => row.errors.length).map((row) => <p key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join(" ")}</p>)}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setPreview(null)}>Choose another file</Button>
                  <Button type="button" disabled={hasBlockingErrors || commitMutation.isPending} onClick={() => commitMutation.mutate({ csv })}>
                    {commitMutation.isPending ? "Importing reviewed connections…" : "Import aliases & eligible distributors"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        <Textarea className="min-h-24 font-mono text-xs" aria-label="Distributor connections CSV" placeholder="Paste a previously downloaded distributor connections CSV here, then choose Preview changes." value={csv} onChange={(event) => { setCsv(event.target.value); setFileName("Pasted CSV"); setPreview(null); }} />
      </CardContent>
    </Card>
  );
}
