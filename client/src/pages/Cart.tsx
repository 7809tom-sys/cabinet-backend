import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  ShoppingCart, Trash2, Plus, Minus, MapPin, Truck, AlertTriangle, Check, Loader2, Package,
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
import { useAuth } from "@/_core/hooks/useAuth";
import { resolveStorefrontTier, resolveTierPrice } from "@shared/pricingTier";
import { resolveAffiliateCartUnitPrice, calculateCartLineTotal } from "@shared/affiliateCartPricing";

// Key the OrderBuilder reads on mount to prefill the review step from the cart.
export const CART_PREFILL_KEY = "cd_cart_prefill_v1";

export default function Cart() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_cart_t"), description: t("seo_cart_d"), lang });
  const { items, removeItem, setQty, clear, zip, setZip, subtotal, count, storefrontSlug } = useCart();
  // Affiliate storefront items already contain the marked-up homeowner price
  // shown to the customer. Do not replace that price with the generic platform
  // tier price returned by the live refresh query.
  const isAffiliateCart = Boolean(storefrontSlug);
  const money = (n: number | null): string =>
    n == null ? t("crt_quoted") : `$${n.toFixed(2)}`;
  const [, navigate] = useLocation();
  const [zipInput, setZipInput] = useState(zip ?? "");

  // Determine the viewer's current pricing tier from their login state.
  const { user } = useAuth();
  const viewerTier = resolveStorefrontTier(user);

  // Build the list of (masterCode, styleId) pairs for cabinet items in the cart.
  const cartPairs = useMemo(
    () =>
      items
        .filter((i) => i.distributorId != null) // cabinets only (not pelican products)
        .map((i) => ({ masterCode: i.masterCode, styleId: i.styleId })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map((i) => `${i.masterCode}:${i.styleId}`).join(",")]
  );

  // Fetch live tier-computed prices for all cart items. This ensures the cart
  // always shows the correct price for the viewer's current tier, even if the
  // stored unitPrice was added under a different tier.
  const { data: livePriceRows } = trpc.design.priceForCartItems.useQuery(
    { items: cartPairs },
    { enabled: cartPairs.length > 0 }
  );

  // Build a map of masterCode:styleId → live unit price at the viewer's tier.
  const livePriceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of livePriceRows ?? []) {
      const price = resolveTierPrice(viewerTier, r);
      if (price != null) m.set(`${r.masterCode}:${r.styleId}`, price);
    }
    return m;
  }, [livePriceRows, viewerTier]);

  // Get the live price for a cart item, falling back to the stored unitPrice.
  const liveUnitPrice = (item: (typeof items)[number]): number | null => {
    const live = livePriceMap.get(`${item.masterCode}:${item.styleId}`);
    return resolveAffiliateCartUnitPrice({
      storedUnitPrice: item.unitPrice,
      liveUnitPrice: live,
      tier: item.tier,
      isAffiliateCart,
    });
  };

  // Compute the live subtotal using live prices.
  const liveSubtotal = useMemo(
    () => items.reduce((s, i) => s + (liveUnitPrice(i) ?? 0) * i.qty, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, livePriceMap, isAffiliateCart]
  );

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
    // Include styleId and tier from the first item so OrderReview can pre-select
    // the correct door style and pricing tier instead of defaulting to Aston Green.
    const firstItem = items[0];
    const prefill = {
      items: items.map((i) => ({ code: i.masterCode, qty: i.qty })),
      styleId: firstItem?.styleId ?? null,
      tier: firstItem?.tier ?? null,
    };
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
          {(() => {
            // Group bundle parts (e.g. a Split Pantry's top + bottom) into a
            // single visual group under one heading; loose items render standalone.
            type Grp =
              | { kind: "single"; item: (typeof items)[number] }
              | { kind: "bundle"; bundleId: string; label: string; parts: typeof items };
            const groups: Grp[] = [];
            const idxByBundle = new Map<string, number>();
            for (const item of items) {
              if (item.bundleId) {
                const idx = idxByBundle.get(item.bundleId);
                if (idx == null) {
                  idxByBundle.set(item.bundleId, groups.length);
                  groups.push({ kind: "bundle", bundleId: item.bundleId, label: item.bundleLabel ?? "Split Pantry", parts: [item] });
                } else {
                  (groups[idx] as Extract<Grp, { kind: "bundle" }>).parts.push(item);
                }
              } else {
                groups.push({ kind: "single", item });
              }
            }

            const renderRow = (item: (typeof items)[number], inBundle: boolean) => {
            const a = itemAvailability(item.distributorId);
            const unitPrice = liveUnitPrice(item);
              const lineTotal = calculateCartLineTotal(unitPrice, item.qty);
            return (
              <div
                key={`${item.masterCode}-${item.styleId}-${item.tier}-${item.bundleId ?? ""}`}
                className={inBundle
                  ? "flex flex-col gap-2 p-3"
                  : "flex flex-col gap-2 rounded-xl border border-border bg-card p-4"}
              >
                {/* Product artwork: pelican products show their photo; cabinets use CabinetImage */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <CabinetImage
                      cabinet={{ masterCode: item.masterCode, description: item.name, catalogImageUrl: item.catalogImageUrl ?? null }}
                      className="h-full w-auto max-w-full"
                    />
                  )}
                </div>
                <div className="flex gap-3 items-start">
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{item.masterCode}</span>
                    {item.category ? (
                      <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                    ) : item.tier !== "homeowner" ? (
                      <Badge variant="secondary" className="text-[10px]">{item.tier}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-foreground leading-snug">{item.name}</p>
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
                          <Truck className="h-3 w-3" />
                          {t("crt_out_of_range_for")} {normalizedZip}
                          {a.nearestMiles != null ? ` · ${t("crt_nearest")} ~${a.nearestMiles} mi` : ""}
                        </span>
                      )}
                    </div>
                  )}
                  </div>
                  {/* Price — right-aligned, stacked next to info block */}
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold">{money(lineTotal)}</div>
                    <div className="text-xs text-muted-foreground">{money(unitPrice)} {t("crt_each")}</div>
                  </div>
                </div>

                {/* Qty stepper + delete on same row */}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.masterCode, item.styleId, item.tier)}
                    aria-label={t("crt_remove_item")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
            };

            return groups.map((g) => {
              if (g.kind === "single") return renderRow(g.item, false);
              const groupTotal = g.parts.reduce(
                (sum, p) => {
                  const unit = liveUnitPrice(p);
                  const lineTotal = calculateCartLineTotal(unit, p.qty);
                  return lineTotal != null ? sum + lineTotal : sum;
                },
                0
              );
              const first = g.parts[0];
              return (
                <div
                  key={`bundle-${g.bundleId}`}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm font-semibold">{g.label}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {first?.styleLabel} · {g.parts.length} {t("crt_pieces")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{money(groupTotal || null)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          first && removeItem(first.masterCode, first.styleId, first.tier)
                        }
                        aria-label={t("crt_remove_item")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {g.parts.map((p) => renderRow(p, true))}
                  </div>
                </div>
              );
            });
          })()}
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
              <span className="font-medium">${liveSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pricing tier</span>
              <span className="text-xs font-medium capitalize text-primary">{viewerTier}</span>
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
