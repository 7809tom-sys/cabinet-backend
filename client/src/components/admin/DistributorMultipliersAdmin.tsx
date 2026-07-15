import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Save, Calculator, RefreshCw } from "lucide-react";

// Per-tier markups are fixed at read time; we mirror the current homeowner
// markup here only for the live preview column so the owner can see the
// resulting sell price at a glance. Actual sell math lives server-side in
// sellPriceForTier.
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface Row {
  id: number;
  code: string | null;
  name: string | null;
  brandName: string | null;
  costMultiplier: string | null;
  baseMultiplier: string | null;
  freightMultiplier: string | null;
  skuCount: number;
  avgListPrice: number | null;
}

// A draft holds the two editable parts per line.
interface DraftParts {
  base: string;
  freight: string;
}

function toStr(v: string | null): string {
  return v != null ? String(Number(v)) : "";
}

export default function DistributorMultipliersAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } =
    trpc.pricing.adminListDistributorMultipliers.useQuery();
  const marginsQ = trpc.pricing.adminGetMargins.useQuery();

  const [draft, setDraft] = useState<Record<number, DraftParts>>({});

  useEffect(() => {
    if (!data?.rows) return;
    const d: Record<number, DraftParts> = {};
    for (const r of data.rows as Row[]) {
      d[r.id] = {
        base: toStr(r.baseMultiplier),
        freight: toStr(r.freightMultiplier),
      };
    }
    setDraft(d);
  }, [data]);

  const homeownerMult = useMemo(() => {
    const bps = marginsQ.data?.settings.homeownerMarkupBps ?? 16500;
    return bps / 10000;
  }, [marginsQ.data]);

  const [pendingRecalcId, setPendingRecalcId] = useState<number | null>(null);

  const setMultiplier = trpc.pricing.adminSetDistributorMultiplier.useMutation({
    onSuccess: (res, vars) => {
      // Automatically apply the new multiplier to all SKU prices right away.
      setPendingRecalcId(vars.distributorId);
      recalcCosts.mutate({ distributorId: vars.distributorId });
      utils.pricing.adminListDistributorMultipliers.invalidate();
      utils.pricing.adminGetMargins.invalidate();
      void res;
    },
    onError: (e) => toast.error(e.message || "Failed to save multiplier"),
  });

  const recalcCosts = trpc.pricing.adminRecalcDistributorCosts.useMutation({
    onSuccess: (res) => {
      setPendingRecalcId(null);
      toast.success(
        `Multiplier saved and applied — ${res.skusRecomputed.toLocaleString()} SKU prices updated.`
      );
      utils.pricing.adminListDistributorMultipliers.invalidate();
    },
    onError: (e) => {
      setPendingRecalcId(null);
      toast.error(e.message || "Failed to recalculate costs");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message || "Could not load supply lines."}
      </div>
    );
  }

  const rows = (data?.rows ?? []) as Row[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Distributor Multipliers
          </CardTitle>
          <CardDescription>
            One multiplier per supply line. It has two parts that add together:{" "}
            <strong>Base</strong> (the core cost fraction of the distributor's
            list) plus <strong>Freight / Tariff</strong> (a separate add-on that
            can change independently). Our cost ={" "}
            <strong>list price × (Base + Freight)</strong>. Example: 0.23 + 0.07
            = 0.30 → we pay 30% of list.{" "}
            <strong>Save applies the multiplier immediately</strong> — it stores
            the multiplier and automatically recomputes all SKU prices
            (wholesale, contractor, homeowner) as list × multiplier × tier markup.
            Use <strong>Recalc</strong> only to re-apply after a pricing upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active supply lines yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supply line</TableHead>
                    <TableHead className="text-right">Cabinets</TableHead>
                    <TableHead className="text-right">Avg list price</TableHead>
                    <TableHead className="w-[120px]">Base</TableHead>
                    <TableHead className="w-[120px]">Freight / Tariff</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                    <TableHead className="text-right">Homeowner sell</TableHead>
                    <TableHead className="w-[160px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const parts = draft[r.id] ?? { base: "", freight: "" };
                    const base = num(parts.base);
                    const freight = num(parts.freight);
                    const eff =
                      base != null || freight != null
                        ? (base ?? 0) + (freight ?? 0)
                        : null;
                    const avgList =
                      r.avgListPrice != null ? Number(r.avgListPrice) : null;
                    const estCost =
                      eff != null && avgList != null ? avgList * eff : null;
                    const estSell =
                      estCost != null ? estCost * homeownerMult : null;
                    const savedBase = toStr(r.baseMultiplier);
                    const savedFreight = toStr(r.freightMultiplier);
                    const dirty =
                      parts.base !== savedBase || parts.freight !== savedFreight;
                    const effValid = eff != null && eff >= 0.01 && eff <= 1;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.name || r.code || `Line ${r.id}`}
                          {r.brandName && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({r.brandName})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {r.skuCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {avgList != null ? `$${avgList.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={parts.base}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [r.id]: { ...parts, base: e.target.value },
                              })
                            }
                            placeholder="0.23"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={parts.freight}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [r.id]: { ...parts, freight: e.target.value },
                              })
                            }
                            placeholder="0.07"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {eff != null ? eff.toFixed(4) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {estCost != null ? `$${estCost.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {estSell != null ? `$${estSell.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={dirty ? "default" : "outline"}
                              disabled={
                                setMultiplier.isPending || recalcCosts.isPending || !effValid || !dirty
                              }
                              className="gap-1"
                              onClick={() => {
                                if (!effValid) {
                                  toast.error(
                                    "Effective (Base + Freight) must be between 0.01 and 1.00"
                                  );
                                  return;
                                }
                                setMultiplier.mutate({
                                  distributorId: r.id,
                                  baseMultiplier: base ?? 0,
                                  freightMultiplier: freight ?? 0,
                                });
                              }}
                            >
                              {(setMultiplier.isPending || (recalcCosts.isPending && pendingRecalcId === r.id)) ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                              {(setMultiplier.isPending || (recalcCosts.isPending && pendingRecalcId === r.id)) ? "Applying..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                recalcCosts.isPending ||
                                !r.costMultiplier ||
                                Number(r.costMultiplier) <= 0
                              }
                              className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                              title="Override all SKU costs with list × multiplier"
                              onClick={() => {
                                if (
                                  !confirm(
                                    `This will overwrite all ${r.skuCount.toLocaleString()} SKU costs for "${r.name || r.code}" with list × ${r.costMultiplier}. Uploaded cost values will be lost. Continue?`
                                  )
                                )
                                  return;
                                recalcCosts.mutate({ distributorId: r.id });
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Recalc
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            "Est. cost" and "Homeowner sell" use the line's average list price
            for a quick sanity check; actual per-cabinet prices are computed from
            each SKU's own list price. The homeowner preview uses the current
            homeowner markup ({((homeownerMult - 1) * 100).toFixed(0)}%) from the
            Pricing &amp; Margins tab.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
