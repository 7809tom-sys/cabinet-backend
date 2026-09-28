import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calculator, Save, Info } from "lucide-react";

// ─── Fee constants ────────────────────────────────────────────────────────────
const BASELINE_PCT = 0.05;   // 5% Cabinet Dealz margin on affiliate
const DAMAGE_PCT   = 0.01;   // 1% damage fee
const CC_PCT       = 0.04;   // 4% credit card processing
const IT_PCT       = 0.10;   // 10% IT/platform fee
const IT_MAX       = 100;    // capped at $100

const CATEGORIES = ["base", "wall", "tall", "vanity", "specialty"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  base: "Base Cabinets",
  wall: "Wall Cabinets",
  tall: "Tall / Pantry",
  vanity: "Vanity",
  specialty: "Specialty",
};

function computeFloor(retail: number): {
  baseline: number;
  afterDamage: number;
  afterCC: number;
  itFee: number;
  floor: number;
} {
  const baseline  = retail * (1 + BASELINE_PCT);
  const afterDamage = baseline * (1 + DAMAGE_PCT);
  const afterCC   = afterDamage * (1 + CC_PCT);
  const itFee     = Math.min(retail * IT_PCT, IT_MAX);
  const floor     = afterCC + itFee;
  return { baseline, afterDamage, afterCC, itFee, floor };
}

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2);
}
function percentToBps(pct: string) {
  return Math.round(parseFloat(pct) * 100);
}

type AffiliatePricingPanelProps = {
  /** Required whenever an administrator is previewing a specific affiliate. */
  affiliateId?: number;
  isAdminView?: boolean;
};

export default function AffiliatePricingPanel({ affiliateId, isAdminView = false }: AffiliatePricingPanelProps) {
  const utils = trpc.useUtils();
  // Never let an admin "view as" session fall back to the first affiliate
  // linked to that admin. Both reads and writes are explicitly keyed by the
  // storefront selected in AffiliateDashboard.
  const ownBranding = trpc.affiliates.myBranding.useQuery(undefined, { enabled: !isAdminView });
  const adminBranding = trpc.affiliates.adminBranding.useQuery(
    { affiliateId: affiliateId ?? 0 },
    { enabled: isAdminView && affiliateId !== undefined, retry: false },
  );
  const data = isAdminView ? adminBranding.data : ownBranding.data;
  const isLoading = isAdminView ? adminBranding.isLoading : ownBranding.isLoading;

  // Local state for default markup
  const [defaultPct, setDefaultPct] = useState<string>("");
  const [categoryPcts, setCategoryPcts] = useState<Partial<Record<Category, string>>>({});
  const [initialized, setInitialized] = useState(false);

  // Calculator state
  const [calcRetail, setCalcRetail] = useState("1000");

  const updateOwnMarkup = trpc.affiliates.updateMyMarkup.useMutation({
    onSuccess: () => {
      toast.success("Pricing saved");
      utils.affiliates.myBranding.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateAdminMarkup = trpc.affiliates.adminUpdateMarkup.useMutation({
    onSuccess: () => {
      toast.success("Pricing saved for the selected affiliate");
      if (affiliateId !== undefined) void utils.affiliates.adminBranding.invalidate({ affiliateId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Initialize local state from server data once
  if (data && !initialized) {
    setDefaultPct(bpsToPercent(data.defaultMarkupBps));
    const cats: Partial<Record<Category, string>> = {};
    for (const cat of CATEGORIES) {
      if (data.categoryMarkup[cat] !== undefined) {
        cats[cat] = bpsToPercent(data.categoryMarkup[cat]);
      }
    }
    setCategoryPcts(cats);
    setInitialized(true);
  }

  const retail = parseFloat(calcRetail) || 0;
  const { baseline, afterDamage, afterCC, itFee, floor } = useMemo(() => computeFloor(retail), [retail]);
  const defaultMarkupBps = percentToBps(defaultPct || "0");
  const customerPrice = floor * (1 + defaultMarkupBps / 10000);
  const profit = customerPrice - floor;

  function save() {
    const defaultBps = percentToBps(defaultPct || "0");
    if (isNaN(defaultBps) || defaultBps < 0) {
      toast.error("Default markup must be a valid non-negative number");
      return;
    }
    const catMap: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const v = categoryPcts[cat];
      if (v !== undefined && v !== "") {
        const bps = percentToBps(v);
        if (!isNaN(bps) && bps >= 0) catMap[cat] = bps;
      }
    }
    if (isAdminView) {
      if (affiliateId === undefined) {
        toast.error("Select an affiliate before saving pricing.");
        return;
      }
      updateAdminMarkup.mutate({ affiliateId, defaultMarkupBps: defaultBps, categoryMarkup: catMap });
      return;
    }
    updateOwnMarkup.mutate({ defaultMarkupBps: defaultBps, categoryMarkup: catMap });
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Pricing &amp; Margins</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set your markup over your cost floor. Your customers see your prices — Cabinet Dealz is never shown.
        </p>
      </div>

      {/* Cost Calculator */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" /> Cost Floor Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Label>Cabinet Dealz retail price ($)</Label>
              <Input
                type="number"
                value={calcRetail}
                onChange={(e) => setCalcRetail(e.target.value)}
                placeholder="1000"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="bg-muted/40 px-4 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Cost Breakdown
            </div>
            <div className="divide-y divide-border">
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">Cabinet Dealz retail</span>
                <span className="tabular-nums">${retail.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">+ 5% affiliate baseline</span>
                <span className="tabular-nums">${baseline.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">+ 1% damage protection</span>
                <span className="tabular-nums">${afterDamage.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">+ 4% credit card fee</span>
                <span className="tabular-nums">${afterCC.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">+ IT/platform fee (10%, max $100)</span>
                <span className="tabular-nums">${itFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-amber-50 font-semibold">
                <span>Your cost floor</span>
                <span className="tabular-nums text-amber-700">${floor.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {defaultMarkupBps > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 divide-y divide-emerald-100 text-sm overflow-hidden">
              <div className="flex justify-between px-4 py-2">
                <span className="text-emerald-800">Your markup ({bpsToPercent(defaultMarkupBps)}%)</span>
                <span className="tabular-nums text-emerald-700">+${(customerPrice - floor).toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 font-semibold">
                <span className="text-emerald-900">Customer pays</span>
                <span className="tabular-nums text-emerald-800">${customerPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-xs">
                <span className="text-emerald-700">Your profit on this order</span>
                <span className="tabular-nums font-medium text-emerald-700">${profit.toFixed(2)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default Markup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Your Markup Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Default markup % (applies to all styles unless overridden)</Label>
            <div className="flex items-center gap-2 max-w-xs">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={defaultPct}
                onChange={(e) => setDefaultPct(e.target.value)}
                placeholder="e.g. 20"
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This is your profit margin on top of your cost floor. A 20% markup on a $1,000 floor = $1,200 customer price.
            </p>
          </div>

          {/* Per-category overrides */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label>Per-category overrides</Label>
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Leave blank to use your default markup. Set a specific % to override for that category.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={categoryPcts[cat] ?? ""}
                      onChange={(e) => setCategoryPcts((p) => ({ ...p, [cat]: e.target.value }))}
                      placeholder={defaultPct || "default"}
                      className="text-sm"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Per-style overrides (set in My Catalog) take priority over category overrides, which take priority over your default markup.
            </span>
          </div>

          <Button onClick={save} disabled={updateOwnMarkup.isPending || updateAdminMarkup.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {updateOwnMarkup.isPending || updateAdminMarkup.isPending ? "Saving…" : "Save Pricing"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
