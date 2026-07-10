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
const CC_PCT       = 0.04;   // 4% credit card processing (waived for ACH/wire)
const IT_PCT       = 0.10;   // 10% IT/platform fee
const IT_MAX       = 100;    // capped at $100

type PaymentMethod = "card" | "ach_wire";

const CATEGORIES = ["base", "wall", "tall", "vanity", "specialty"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  base: "Base Cabinets",
  wall: "Wall Cabinets",
  tall: "Tall / Pantry",
  vanity: "Vanity",
  specialty: "Specialty",
};

function computeFloor(retail: number, paymentMethod: PaymentMethod): {
  baseline: number;
  afterDamage: number;
  afterCC: number;
  ccFee: number;
  itFee: number;
  floor: number;
} {
  const baseline    = retail * (1 + BASELINE_PCT);
  const afterDamage = baseline * (1 + DAMAGE_PCT);
  const ccRate      = paymentMethod === "card" ? CC_PCT : 0;
  const afterCC     = afterDamage * (1 + ccRate);
  const ccFee       = afterCC - afterDamage;
  const itFee       = Math.min(retail * IT_PCT, IT_MAX);
  const floor       = afterCC + itFee;
  return { baseline, afterDamage, afterCC, ccFee, itFee, floor };
}

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2);
}
function percentToBps(pct: string) {
  return Math.round(parseFloat(pct) * 100);
}

export default function AffiliatePricingPanel() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.affiliates.myBranding.useQuery();

  // Local state for default markup
  const [defaultPct, setDefaultPct] = useState<string>("");
  const [categoryPcts, setCategoryPcts] = useState<Partial<Record<Category, string>>>({});
  const [initialized, setInitialized] = useState(false);

  // Calculator state
  const [calcRetail, setCalcRetail] = useState("1000");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const updateMarkup = trpc.affiliates.updateMyMarkup.useMutation({
    onSuccess: () => {
      toast.success("Pricing saved");
      utils.affiliates.myBranding.invalidate();
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
  const { baseline, afterDamage, afterCC, ccFee, itFee, floor } = useMemo(
    () => computeFloor(retail, paymentMethod),
    [retail, paymentMethod]
  );
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
    updateMarkup.mutate({ defaultMarkupBps: defaultBps, categoryMarkup: catMap });
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-[140px] max-w-xs">
              <Label>Cabinet Dealz cost ($)</Label>
              <Input
                type="number"
                value={calcRetail}
                onChange={(e) => setCalcRetail(e.target.value)}
                placeholder="1000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <div className="flex rounded-md border border-border overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`px-3 py-2 font-medium transition-colors ${
                    paymentMethod === "card"
                      ? "bg-primary text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("ach_wire")}
                  className={`px-3 py-2 font-medium transition-colors border-l border-border ${
                    paymentMethod === "ach_wire"
                      ? "bg-primary text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  ACH / Wire
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="bg-muted/40 px-4 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Cost Breakdown
            </div>
            <div className="divide-y divide-border">
              <div className="flex justify-between px-4 py-2">
                <span className="text-muted-foreground">Cabinet Dealz cost</span>
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
                <span className="text-muted-foreground">
                  {paymentMethod === "card" ? "+ 4% credit card fee" : "Credit card fee (waived — ACH/wire)"}
                </span>
                <span className={`tabular-nums ${paymentMethod === "ach_wire" ? "text-emerald-600 line-through" : ""}`}>
                  {paymentMethod === "card" ? `$${afterCC.toFixed(2)}` : `$${(afterDamage * (1 + CC_PCT)).toFixed(2)}`}
                </span>
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

          <Button onClick={save} disabled={updateMarkup.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {updateMarkup.isPending ? "Saving…" : "Save Pricing"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
