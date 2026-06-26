import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  ShoppingCart, Trash2, Plus, Minus, MapPin, Truck, AlertTriangle, Check, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { CabinetImage } from "@/components/CabinetImage";
import { trpc } from "@/lib/trpc";
import { normalizeZip } from "@shared/availability";
import { toast } from "sonner";

// Key the OrderBuilder reads on mount to prefill the review step from the cart.
export const CART_PREFILL_KEY = "cd_cart_prefill_v1";

export default function Cart() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_cart_t"), description: t("seo_cart_d"), lang });
  const { items, removeItem, setQty, clear, zip, setZip, subtotal, count } = useCart();
  const money = (n: number | null): string =>
    n == null ? t("crt_quoted") : `$${n.toFixed(2)}`;
  const [, navigate] = useLocation();
  const [zipInput, setZipInput] = useState(zip ?? "");

  const normalizedZip = normalizeZip(zipInput);

  const availabilityQuery = trpc.location.availability.useQuery(
    { zip: normalizedZip ?? "" },
    { enabled: !!normalizedZip }
  );

  // Map distributorId → availability line for quick per-item lookup.
  const availByDist = useMemo(() => {
    const m = new Map<number, { inRange: boolean; nearestMiles: number | null; leadTimeDays: number | null }>();
    for (const l of availabilityQuery.data?.lines ?? []) {
      m.set(l.distributorId, { inRange: l.inRange, nearestMiles: l.nearestMiles, leadTimeDays: l.leadTimeDays });
    }
    return m;
  }, [availabilityQuery.data]);

  const hasCheckedZip = !!normalizedZip && availabilityQuery.isSuccess;

  const itemAvailability = (distributorId: number | null) => {
    if (distributorId == null) return null;
    return availByDist.get(distributorId) ?? null;
  };

  const outOfRangeCount = useMemo(() => {
    if (!hasCheckedZip) return 0;
    return items.filter((i) => {
      const a = itemAvailability(i.distributorId);
      return a != null && !a.inRange;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hasCheckedZip, availByDist]);

  const applyZip = () => {
    if (!normalizedZip) {
      toast.error(t("crt_zip_invalid"));
      return;
    }
    setZip(normalizedZip);
    toast.success(`${t("crt_zip_showing")} ${normalizedZip}`);
  };

  // Supply-line lock: an order ships from ONE distributor (supply line). Door
  // styles AND colors mix freely within that distributor (two-tone kitchens are
  // a first-class feature) — only CROSS-SUPPLIER mixing is blocked, because that
  // breaks single-source pricing and freight.
  const supplierGroups = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of items) {
      if (i.distributorId != null) m.set(i.distributorId, i.styleLabel);
    }
    return m;
  }, [items]);
  const isMixedSupplier = supplierGroups.size > 1;

  const requestOrder = () => {
    if (items.length === 0) return;
    if (isMixedSupplier) {
      toast.error(t("crt_one_supplier_err"));
      return;
    }
    const prefill = items.map((i) => ({ code: i.masterCode, qty: i.qty }));
    try {
      sessionStorage.setItem(CART_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      /* ignore */
    }
    navigate("/order/new");
  };

  if (items.length === 0) {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <ShoppingCart className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-3">{t("crt_empty_title")}</h1>
        <p className="text-muted-foreground mb-8">
          {t("crt_empty_sub")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/catalog">{t("crt_browse_catalog")}</Link>
          </Button>
          <Button variant="outline" className="bg-background" asChild>
            <Link href="/design">{t("crt_open_design")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl md:text-4xl font-bold">{t("crt_title")}</h1>
        <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground">
          <Trash2 className="mr-1.5 h-4 w-4" /> {t("crt_clear")}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <div className="space-y-4">
          {items.map((item) => {
            const a = itemAvailability(item.distributorId);
            const lineTotal = item.unitPrice != null ? item.unitPrice * item.qty : null;
            return (
              <div
                key={`${item.masterCode}-${item.styleId}-${item.tier}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                {/* Shared cabinet artwork — same CabinetImage used in the catalog,
                    detail page, and Design Tool palette (falls back to an accurate
                    to-scale drawing when no catalog image is mapped). */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                  <CabinetImage
                    cabinet={{ masterCode: item.masterCode, description: item.name }}
                    className="h-full w-auto max-w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{item.masterCode}</span>
                    <Badge variant="secondary" className="text-[10px]">{item.tier}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.styleLabel}</p>

                  {hasCheckedZip && a && (
                    <div className="mt-1.5">
                      {a.inRange ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <Truck className="h-3 w-3" />
                          {t("crt_available")}{a.nearestMiles != null ? ` · ~${a.nearestMiles} mi` : ""}
                          {a.leadTimeDays != null ? ` · ~${a.leadTimeDays} ${t("crt_day_lead")}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {t("crt_out_of_range_for")} {normalizedZip}
                          {a.nearestMiles != null ? ` (${t("crt_nearest")} ~${a.nearestMiles} mi)` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Qty stepper */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-background"
                    onClick={() => setQty(item.masterCode, item.styleId, item.tier, item.qty - 1)}
                    aria-label={t("crt_decrease_qty")}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-background"
                    onClick={() => setQty(item.masterCode, item.styleId, item.tier, item.qty + 1)}
                    aria-label={t("crt_increase_qty")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="w-24 text-right">
                  <div className="text-sm font-semibold">{money(lineTotal)}</div>
                  <div className="text-xs text-muted-foreground">{money(item.unitPrice)} {t("crt_each")}</div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(item.masterCode, item.styleId, item.tier)}
                  aria-label={t("crt_remove_item")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 h-fit rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-lg font-semibold">{t("crt_order_summary")}</h2>
          <Separator className="my-4" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("crt_items")}</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("crt_est_subtotal")}</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" /> {t("crt_shipping")}
              </span>
              <span className="text-xs text-muted-foreground">{t("crt_shipping_quoted")}</span>
            </div>
          </div>
          <Separator className="my-4" />
          {/* Compact delivery-ZIP check — moved out of the item list so the cart
              list stays clean and readable. */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> {t("crt_check_by_zip")}
            </div>
            <div className="flex gap-2">
              <Input
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyZip()}
                placeholder={t("crt_zip_placeholder")}
                inputMode="numeric"
                className="h-9"
                aria-label={t("crt_zip_aria")}
              />
              <Button size="sm" className="h-9" onClick={applyZip} disabled={availabilityQuery.isFetching}>
                {availabilityQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("crt_check")}
              </Button>
            </div>
            {hasCheckedZip && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {outOfRangeCount === 0
                  ? t("crt_all_ship")
                  : `${outOfRangeCount} ${outOfRangeCount > 1 ? t("crt_may_out_many") : t("crt_may_out_one")}`}
              </p>
            )}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("crt_shipping_note")}
          </p>
          {outOfRangeCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("crt_out_range_warn_a")} {normalizedZip}. {t("crt_out_range_warn_b")}
            </div>
          )}
          {isMixedSupplier && (
            <div className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  {t("crt_mixed_a")}{" "}
                  <span className="font-semibold">{supplierGroups.size}</span> {t("crt_mixed_b")}{" "}
                  <span className="font-semibold">{t("crt_mixed_same")}</span> {t("crt_mixed_c")}
                </div>
              </div>
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={requestOrder}
            disabled={isMixedSupplier}
          >
            <Check className="mr-1.5 h-4 w-4" /> {t("crt_request_order")}
          </Button>
          <Button variant="outline" className="mt-2 w-full bg-background" asChild>
            <Link href="/catalog">{t("crt_continue_shopping")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
