import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Check, Hammer, Truck, Package as PackageIcon,
  PencilRuler, TrendingUp, Sparkles, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

function usd(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function usd0(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PackageDetail({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const [styleId, setStyleId] = useState<number | null>(null);
  const { data: pkg, isLoading, isError, refetch } = trpc.packages.bySlug.useQuery({
    slug,
    ...(styleId != null ? { styleId } : {}),
  });

  const { data: styles } = trpc.doorStyles.list.useQuery();
  const styleOptions = useMemo(() => {
    type S = { id: number; styleCode: string; ourName: string | null };
    return ((styles ?? []) as S[])
      .map((s) => ({ id: s.id, label: s.ourName || s.styleCode }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [styles]);

  if (isLoading) {
    return (
      <div className="container py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-3">Couldn't load this package</h1>
        <p className="text-sm text-muted-foreground mb-5">Please check your connection and try again.</p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => refetch()} className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90">Try again</Button>
          <Link href="/packages">
            <Button variant="outline">Back to packages</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="container py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-3">Package not found</h1>
        <Link href="/packages">
          <Button variant="outline">Back to packages</Button>
        </Link>
      </div>
    );
  }

  const pctUnder = Math.round(((pkg.competitorAvg - pkg.suggestedRetail) / pkg.competitorAvg) * 100);

  function loadIntoDesigner() {
    // Hand the package slug to the design tool, which will fetch its layout.
    navigate(`/design?package=${pkg!.slug}`);
  }

  return (
    <div className="bg-[var(--color-cream,#f7f4ee)] min-h-screen pb-16">
      {/* Header */}
      <div className="bg-[var(--color-navy)] text-white">
        <div className="container py-8">
          <Link href="/packages" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-5">
            <ArrowLeft className="h-4 w-4" /> All packages
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <Badge className="mb-3 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
                {pkg.shape} · {pkg.cabinetCount} cabinets
              </Badge>
              <h1 className="font-serif text-3xl md:text-4xl font-bold">{pkg.name}</h1>
              <p className="mt-3 text-white/75">{pkg.blurb}</p>
              <div className="mt-5 flex flex-wrap gap-5 text-sm text-white/80">
                <span className="flex items-center gap-1.5"><Hammer className="h-4 w-4 text-[var(--color-gold)]" /> Assembled or flat-pack (RTA)</span>
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-[var(--color-gold)]" /> Shipping quoted live at order</span>
                <span className="flex items-center gap-1.5"><PackageIcon className="h-4 w-4 text-[var(--color-gold)]" /> Complete cabinet set</span>
              </div>
            </div>

            {/* Price card */}
            <div className="w-full max-w-xs rounded-2xl bg-white text-foreground p-5 shadow-lg">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Suggested retail</div>
              <div className="font-serif text-4xl font-bold text-[var(--color-navy)]">{usd0(pkg.suggestedRetail)}</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground line-through">{usd0(pkg.competitorAvg)}</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{pctUnder}% under market</Badge>
              </div>
              <Button onClick={loadIntoDesigner} className="mt-4 w-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 gap-2">
                <PencilRuler className="h-4 w-4" /> Customize in Design Tool
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground text-center">
                Loads the full layout onto the canvas to edit, swap styles, and re-price.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mt-10 grid gap-8 lg:grid-cols-3">
        {/* BOM */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-serif text-xl font-bold text-[var(--color-navy)] mb-1">Bill of Materials</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The complete cabinet set for this layout. Pick a door style below to price every line
              in that exact finish; with no style selected, unit cost reflects the best available
              white-shaker network line. Available assembled or flat-pack (RTA) — flat-pack ships
              denser with lower damage risk and freight; assembled saves on-site install labor.
            </p>

            {/* Door-style scoped pricing selector */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Price in door style
              </span>
              <Select
                value={styleId != null ? String(styleId) : "default"}
                onValueChange={(v) => setStyleId(v === "default" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 w-[260px] text-sm">
                  <SelectValue placeholder="White Shaker (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">White Shaker (default — lowest network line)</SelectItem>
                  {styleOptions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pkg.unavailableCount > 0 && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:bg-amber-950/20">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <div className="font-medium text-amber-800 dark:text-amber-300">
                    {pkg.unavailableCount} {pkg.unavailableCount === 1 ? "line is" : "lines are"} not carried in this door style
                  </div>
                  <div className="text-amber-700/80 dark:text-amber-300/80">
                    Those lines show “—” below and are excluded from the subtotal. Choose another style
                    or swap those cabinets in the Design Tool.
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">Cabinet</th>
                    <th className="py-2 pr-3 font-medium text-center">Qty</th>
                    <th className="py-2 pr-3 font-medium text-right">Unit Cost</th>
                    <th className="py-2 font-medium text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.lines.map((l, i) => (
                    <tr key={`${l.masterCode}-${i}`} className={`border-b border-border/60 ${!l.available ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-[var(--color-navy)]">
                        {l.masterCode}
                        {!l.available && (
                          <span className="ml-2 align-middle text-[10px] font-normal text-amber-700">not in this style</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{l.role}</td>
                      <td className="py-2.5 pr-3 text-center">{l.qty}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{usd(l.unitCost)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">{usd(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-sm">
                    <td colSpan={4} className="py-2 pr-3 text-right text-muted-foreground">Cabinet subtotal</td>
                    <td className="py-2 text-right tabular-nums font-medium">{usd(pkg.cabinetSubtotal)}</td>
                  </tr>
                  <tr className="text-sm">
                    <td colSpan={4} className="py-1 pr-3 text-right text-muted-foreground">Assembly ({pkg.cabinetCount} × $30)</td>
                    <td className="py-1 text-right tabular-nums font-medium">{usd(pkg.assemblyFee)}</td>
                  </tr>
                  <tr className="text-sm">
                    <td colSpan={4} className="py-1 pr-3 text-right text-muted-foreground">Freight</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">Quoted live at order</td>
                  </tr>
                  <tr className="border-t-2 border-[var(--color-navy)]/20">
                    <td colSpan={4} className="py-2.5 pr-3 text-right font-bold text-[var(--color-navy)]">Cabinets + assembly</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-[var(--color-navy)]">{usd(pkg.landedCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {pkg.cornerUpgrade && (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 p-4">
                <Sparkles className="h-5 w-5 text-[var(--color-gold)] mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-[var(--color-navy)] text-sm">{pkg.cornerUpgrade.label}</div>
                  <div className="text-sm text-muted-foreground">{pkg.cornerUpgrade.note}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comparison + margin */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-white p-6">
            <h3 className="font-serif text-lg font-bold text-[var(--color-navy)] mb-4">vs. Online Competitors</h3>
            <div className="space-y-3">
              {pkg.competitors.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="tabular-nums">{usd0(c.price)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-medium">
                <span>Competitor average</span>
                <span className="tabular-nums">{usd0(pkg.competitorAvg)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[var(--color-navy)] text-white px-3 py-2.5">
                <span className="font-medium">Our suggested retail</span>
                <span className="tabular-nums font-bold">{usd0(pkg.suggestedRetail)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-600 font-medium">
                <span>Customer saves</span>
                <span className="tabular-nums">{usd0(pkg.customerSavings)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6">
            <h3 className="font-serif text-lg font-bold text-[var(--color-navy)] mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" /> Affiliate Economics
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sell at</span>
                <span className="tabular-nums">{usd0(pkg.suggestedRetail)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Landed cost</span>
                <span className="tabular-nums">{usd0(pkg.landedCost)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 font-medium">
                <span>Gross profit</span>
                <span className="tabular-nums text-emerald-600">{usd0(pkg.affiliateProfit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Margin</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  {Math.round(pkg.affiliateMargin * 100)}%
                </Badge>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              Beat the market and still keep a healthy margin per kitchen.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
