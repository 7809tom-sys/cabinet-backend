import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import FeeSystemAdmin from "./FeeSystemAdmin";
import PelicanMarkupsAdmin from "./PelicanMarkupsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Percent, Save, TrendingUp, RefreshCw, Clock } from "lucide-react";

// UI edits whole percents; DB stores basis points where 10000 = no change (0%).
// A displayed "+15%" => bps 11500. "0%" => 10000.
const bpsToPct = (bps: number) => Math.round(((bps - 10000) / 100) * 100) / 100;
const pctToBps = (pct: string) => Math.round((parseFloat(pct) || 0) * 100) + 10000;

interface MarginForm {
  globalPct: string;
  homeownerPct: string;
  contractorPct: string;
  wholesalePct: string;
}

// Sample base price used purely for the live preview.
const SAMPLE_BASE = 100;

export default function MarginsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pricing.adminGetMargins.useQuery();
  const [form, setForm] = useState<MarginForm | null>(null);
  const [distMarkups, setDistMarkups] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      globalPct: String(bpsToPct(s.globalMarkupBps)),
      homeownerPct: String(bpsToPct(s.homeownerMarkupBps)),
      contractorPct: String(bpsToPct(s.contractorMarkupBps)),
      wholesalePct: String(bpsToPct(s.wholesaleMarkupBps)),
    });
    const m: Record<number, string> = {};
    for (const d of data.distributors) {
      m[d.id] = String(Math.round((Number(d.markupPercent ?? 0) || 0) * 100));
    }
    setDistMarkups(m);
  }, [data]);

  const saveMargins = trpc.pricing.adminUpdateMargins.useMutation({
    onSuccess: () => {
      toast.success("Margins saved — all SKU tier prices recalculated");
      utils.pricing.adminGetMargins.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to save margins"),
  });

  const recalcAll = trpc.pricing.adminRecalcAllTierPrices.useMutation({
    onSuccess: (res) => {
      toast.success(`Tier prices recalculated for ${res.skusRecomputed} SKUs`);
      utils.pricing.adminGetMargins.invalidate();
    },
    onError: (e) => toast.error(e.message || "Recalculation failed"),
  });

  const setDistMarkup = trpc.pricing.adminSetDistributorMarkup.useMutation({
    onSuccess: () => {
      toast.success("Distributor markup updated");
      utils.pricing.adminGetMargins.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to update distributor"),
  });

  // Live preview: a sample $100 base price through each tier multiplier.
  const preview = useMemo(() => {
    if (!form) return null;
    const mult = (pct: string) => (pctToBps(pct) / 10000) * SAMPLE_BASE;
    return {
      homeowner: mult(form.homeownerPct),
      contractor: mult(form.contractorPct),
      wholesale: mult(form.wholesalePct),
    };
  }, [form]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error || !form) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message || "Could not load pricing settings."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeeSystemAdmin />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Pricing & Margins
          </CardTitle>
          <CardDescription>
            One control center for selling margins. Each tier's sell price is
            computed as <strong>our cost × (1 + this markup)</strong>, where our
            cost comes from the per-line multiplier on the Multipliers tab. The
            global default is only guidance for new lines and does <strong>not</strong>{" "}
            affect live prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Global default markup (guidance only — not applied)
            </Label>
            <div className="relative mt-1 max-w-[180px]">
              <Input
                type="number"
                step="0.5"
                value={form.globalPct}
                onChange={(e) => setForm({ ...form, globalPct: e.target.value })}
              />
              <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ["Homeowner (retail)", "homeownerPct"],
              ["Contractor", "contractorPct"],
              ["Wholesale", "wholesalePct"],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label} markup
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    step="0.5"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                  <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>

          {preview && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Live preview — a ${SAMPLE_BASE.toFixed(2)} base price becomes
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Homeowner</div>
                  <div className="text-lg font-bold">${preview.homeowner.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Contractor</div>
                  <div className="text-lg font-bold">${preview.contractor.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Wholesale</div>
                  <div className="text-lg font-bold">${preview.wholesale.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() =>
                saveMargins.mutate({
                  globalMarkupBps: pctToBps(form.globalPct),
                  homeownerMarkupBps: pctToBps(form.homeownerPct),
                  contractorMarkupBps: pctToBps(form.contractorPct),
                  wholesaleMarkupBps: pctToBps(form.wholesalePct),
                })
              }
              disabled={saveMargins.isPending || recalcAll.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMargins.isPending ? "Saving & recalculating…" : "Save margins"}
            </Button>
            <Button
              variant="outline"
              onClick={() => recalcAll.mutate({})}
              disabled={recalcAll.isPending || saveMargins.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${recalcAll.isPending ? "animate-spin" : ""}`} />
              {recalcAll.isPending ? "Recalculating…" : "Recalc all tier prices"}
            </Button>
          </div>
          {data?.settings?.tierPricesRecalcAt ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Last recalculated:</strong>{" "}
                {new Date(data.settings.tierPricesRecalcAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Tier prices have not been recalculated yet — click <strong>Recalc all tier prices</strong> to sync.</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            <strong>Save margins</strong> automatically recalculates all SKU tier prices.
            Use <strong>Recalc all tier prices</strong> if prices appear stale after a bulk import.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-supply-line markup overrides</CardTitle>
          <CardDescription>
            Optional markup applied to an individual supply line (e.g. a series
            line sold at a premium). Stored per distributor; 0% = no override.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.distributors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active supply lines yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supply line</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="w-[160px]">Markup %</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.distributors.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.displayMode === "series" && d.seriesName ? d.seriesName : d.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm capitalize">
                      {d.displayMode || "neutral"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        value={distMarkups[d.id] ?? "0"}
                        onChange={(e) =>
                          setDistMarkups({ ...distMarkups, [d.id]: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setDistMarkup.isPending}
                        onClick={() =>
                          setDistMarkup.mutate({
                            distributorId: d.id,
                            markupPercent: (parseFloat(distMarkups[d.id] ?? "0") || 0) / 100,
                          })
                        }
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PelicanMarkupsAdmin />
    </div>
  );
}
