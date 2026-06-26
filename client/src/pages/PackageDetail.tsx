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
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";

function usd(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function usd0(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PackageDetail({ slug }: { slug: string }) {
  const { t, lang } = useLanguage();
  const [, navigate] = useLocation();
  const [styleId, setStyleId] = useState<number | null>(null);
  const { data: pkg, isLoading, isError, refetch } = trpc.packages.bySlug.useQuery({
    slug,
    ...(styleId != null ? { styleId } : {}),
  });

  const pkgName = (pkg as { name?: string } | undefined)?.name ?? "";
  useSeo({
    title: pkgName ? t("seo_package_t", { name: pkgName }) : t("seo_packages_t"),
    description: pkgName ? t("seo_package_d", { name: pkgName }) : t("seo_packages_d"),
    type: "product",
    lang,
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
        <h1 className="font-serif text-2xl font-bold mb-3">{t("pkd_load_err_title")}</h1>
        <p className="text-sm text-muted-foreground mb-5">{t("pkd_load_err_sub")}</p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => refetch()} className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90">{t("pkd_try_again")}</Button>
          <Link href="/packages">
            <Button variant="outline">{t("pkd_back_to_packages")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="container py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-3">{t("pkd_not_found")}</h1>
        <Link href="/packages">
          <Button variant="outline">{t("pkd_back_to_packages")}</Button>
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
            <ArrowLeft className="h-4 w-4" /> {t("pkd_all_packages")}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <Badge className="mb-3 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
                {pkg.shape} · {pkg.cabinetCount} {t("pkd_cabinets")}
              </Badge>
              <h1 className="font-serif text-3xl md:text-4xl font-bold">{pkg.name}</h1>
              <p className="mt-3 text-white/75">{pkg.blurb}</p>
              <div className="mt-5 flex flex-wrap gap-5 text-sm text-white/80">
                <span className="flex items-center gap-1.5"><Hammer className="h-4 w-4 text-[var(--color-gold)]" /> {t("pkd_assembled_or_flat")}</span>
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-[var(--color-gold)]" /> {t("pkd_shipping_live")}</span>
                <span className="flex items-center gap-1.5"><PackageIcon className="h-4 w-4 text-[var(--color-gold)]" /> {t("pkd_complete_set")}</span>
              </div>
            </div>

            {/* Price card */}
            <div className="w-full max-w-xs rounded-2xl bg-white text-foreground p-5 shadow-lg">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("pkd_suggested_retail")}</div>
              <div className="font-serif text-4xl font-bold text-[var(--color-navy)]">{usd0(pkg.suggestedRetail)}</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground line-through">{usd0(pkg.competitorAvg)}</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{pctUnder}% {t("pkd_under_market")}</Badge>
              </div>
              <Button onClick={loadIntoDesigner} className="mt-4 w-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 gap-2">
                <PencilRuler className="h-4 w-4" /> {t("pkd_customize")}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground text-center">
                {t("pkd_customize_note")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mt-10 grid gap-8 lg:grid-cols-3">
        {/* BOM */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-serif text-xl font-bold text-[var(--color-navy)] mb-1">{t("pkd_bom_title")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("pkd_bom_desc")}
            </p>

            {/* Door-style scoped pricing selector */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("pkd_price_in_style")}
              </span>
              <Select
                value={styleId != null ? String(styleId) : "default"}
                onValueChange={(v) => setStyleId(v === "default" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 w-[260px] text-sm">
                  <SelectValue placeholder={t("pkd_white_shaker_ph")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("pkd_white_shaker_opt")}</SelectItem>
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
                    {pkg.unavailableCount} {pkg.unavailableCount === 1 ? t("pkd_line_is") : t("pkd_lines_are")} {t("pkd_not_carried")}
                  </div>
                  <div className="text-amber-700/80 dark:text-amber-300/80">
                    {t("pkd_excluded_note")}
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t("pkd_th_sku")}</th>
                    <th className="py-2 pr-3 font-medium">{t("pkd_th_cabinet")}</th>
                    <th className="py-2 pr-3 font-medium text-center">{t("pkd_th_qty")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("pkd_th_unit_cost")}</th>
                    <th className="py-2 font-medium text-right">{t("pkd_th_line_total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.lines.map((l, i) => (
                    <tr key={`${l.masterCode}-${i}`} className={`border-b border-border/60 ${!l.available ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-[var(--color-navy)]">
                        {l.masterCode}
                        {!l.available && (
                          <span className="ml-2 align-middle text-[10px] font-normal text-amber-700">{t("pkd_not_in_style")}</span>
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
                    <td colSpan={4} className="py-2 pr-3 text-right text-muted-foreground">{t("pkd_cabinet_subtotal")}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{usd(pkg.cabinetSubtotal)}</td>
                  </tr>
                  <tr className="text-sm">
                    <td colSpan={4} className="py-1 pr-3 text-right text-muted-foreground">{t("pkd_assembly")} ({pkg.cabinetCount} × $30)</td>
                    <td className="py-1 text-right tabular-nums font-medium">{usd(pkg.assemblyFee)}</td>
                  </tr>
                  <tr className="text-sm">
                    <td colSpan={4} className="py-1 pr-3 text-right text-muted-foreground">{t("pkd_freight")}</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">{t("pkd_quoted_live")}</td>
                  </tr>
                  <tr className="border-t-2 border-[var(--color-navy)]/20">
                    <td colSpan={4} className="py-2.5 pr-3 text-right font-bold text-[var(--color-navy)]">{t("pkd_cabinets_assembly")}</td>
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
            <h3 className="font-serif text-lg font-bold text-[var(--color-navy)] mb-4">{t("pkd_vs_competitors")}</h3>
            <div className="space-y-3">
              {pkg.competitors.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="tabular-nums">{usd0(c.price)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-medium">
                <span>{t("pkd_competitor_avg")}</span>
                <span className="tabular-nums">{usd0(pkg.competitorAvg)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[var(--color-navy)] text-white px-3 py-2.5">
                <span className="font-medium">{t("pkd_our_retail")}</span>
                <span className="tabular-nums font-bold">{usd0(pkg.suggestedRetail)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-600 font-medium">
                <span>{t("pkd_customer_saves")}</span>
                <span className="tabular-nums">{usd0(pkg.customerSavings)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6">
            <h3 className="font-serif text-lg font-bold text-[var(--color-navy)] mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" /> {t("pkd_affiliate_econ")}
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("pkd_sell_at")}</span>
                <span className="tabular-nums">{usd0(pkg.suggestedRetail)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("pkd_landed_cost")}</span>
                <span className="tabular-nums">{usd0(pkg.landedCost)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 font-medium">
                <span>{t("pkd_gross_profit")}</span>
                <span className="tabular-nums text-emerald-600">{usd0(pkg.affiliateProfit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("pkd_margin")}</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  {Math.round(pkg.affiliateMargin * 100)}%
                </Badge>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {t("pkd_margin_note")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
