import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Tag, RefreshCw, Save } from "lucide-react";

type FlaggedRow = {
  id: number;
  masterCode: string;
  original: string;
  suggested: string;
  matchedBrands: string[];
};

/** Highlight brand names in a description string */
function HighlightedText({ text, brands }: { text: string; brands: string[] }) {
  if (!brands.length) return <span>{text}</span>;
  // Build a regex that matches any of the brand names (case-insensitive)
  const pattern = brands
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(re);
  return (
    <span>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function DescriptionCleanupAdmin() {
  const utils = trpc.useUtils();
  const { data: flagged, isLoading, refetch } = trpc.cabinets.adminListFlaggedDescriptions.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  // Per-row state: checked = approved for save, edited text
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [edited, setEdited] = useState<Record<number, string>>({});

  const saveMut = trpc.cabinets.adminSaveCleanedDescriptions.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.updated} description${r.updated !== 1 ? "s" : ""} updated`);
      setChecked({});
      setEdited({});
      refetch();
      utils.cabinets.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows: FlaggedRow[] = flagged ?? [];
  const checkedIds = rows.filter((r) => checked[r.id]).map((r) => r.id);

  function handleSave() {
    const payload = checkedIds.map((id) => {
      const row = rows.find((r) => r.id === id)!;
      return { id, description: (edited[id] ?? row.suggested).trim() };
    });
    if (!payload.length) {
      toast.error("Check at least one item to save");
      return;
    }
    saveMut.mutate(payload);
  }

  function checkAll() {
    const next: Record<number, boolean> = {};
    rows.forEach((r) => { next[r.id] = true; });
    setChecked(next);
  }

  function uncheckAll() {
    setChecked({});
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Spinner className="h-4 w-4" /> Scanning descriptions for brand names…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">All descriptions are clean</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">No brand names found in any cabinet description.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-scan
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-sm">
            {rows.length} cabinet{rows.length !== 1 ? "s" : ""} with brand names in description
          </h3>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={checkAll}>Check all</Button>
          <Button variant="outline" size="sm" onClick={uncheckAll}>Uncheck all</Button>
          <Button
            size="sm"
            disabled={!checkedIds.length || saveMut.isPending}
            onClick={handleSave}
            className="gap-1.5"
          >
            {saveMut.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            Save {checkedIds.length > 0 ? `(${checkedIds.length})` : "selected"}
          </Button>
        </div>
      </div>

      {/* Row list */}
      <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
        {rows.map((row) => {
          const isChecked = !!checked[row.id];
          const currentText = edited[row.id] ?? row.suggested;
          return (
            <div
              key={row.id}
              className={`p-4 space-y-2 transition-colors ${isChecked ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "bg-background"}`}
            >
              {/* Top row: checkbox + code + brand badges */}
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [row.id]: !!v }))}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs font-mono font-bold bg-muted px-1.5 py-0.5 rounded">
                      {row.masterCode}
                    </code>
                    {row.matchedBrands.map((b) => (
                      <Badge key={b} variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
                        <Tag className="h-2.5 w-2.5" /> {b}
                      </Badge>
                    ))}
                  </div>

                  {/* Original description with highlights */}
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Original: </span>
                    <HighlightedText text={row.original} brands={row.matchedBrands} />
                  </div>

                  {/* Editable cleaned description */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0 mt-1.5">
                      Clean:
                    </span>
                    <textarea
                      className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[2.5rem]"
                      rows={2}
                      value={currentText}
                      onChange={(e) => setEdited((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      onClick={() => setChecked((prev) => ({ ...prev, [row.id]: true }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer save */}
      {checkedIds.length > 0 && (
        <div className="flex justify-end">
          <Button
            disabled={saveMut.isPending}
            onClick={handleSave}
            className="gap-1.5"
          >
            {saveMut.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save {checkedIds.length} description{checkedIds.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
