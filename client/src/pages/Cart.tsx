import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  ShoppingCart, Trash2, Plus, Minus, MapPin, Truck, AlertTriangle, Loader2, Package, CalendarClock, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { resolveLockedCheckoutUnitPrice } from "@/lib/checkoutPriceLock";
import {
  affiliateSlugForStoreScope,
  resolveStoreScope,
  scopedBrowserStorageKey,
  type StoreScope,
} from "@/lib/affiliateContext";
import { cartItemToCheckoutPrefill } from "@/lib/cartCheckoutPrefill";
import { separateGlassPurchaseItems } from "@/lib/cartGlassPolicy";
import { formatEighthInches } from "@/lib/design";
import { isTemporaryOneDollarFreeShippingOrder, isTemporaryOneDollarCheckoutTestItem } from "@shared/temporaryCheckoutTest";
import { optionalPositiveFreightId } from "@shared/freight";
import { FreightCalculatingStatus } from "@/components/order/FreightCalculatingStatus";

// Key the OrderBuilder reads on mount to prefill the review step from the cart.
export const CART_PREFILL_KEY = "cd_cart_prefill_v1";
export function cartPrefillStorageKey(scope: StoreScope) {
  return scopedBrowserStorageKey(CART_PREFILL_KEY, scope);
}

function formatCarrierDeliveryDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function Cart() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_cart_t"), description: t("seo_cart_d"), lang });
  const {
    items, removeItem, setQty, clear, zip, setZip, subtotal, count, sourceDesignId,
    supplierConflict, clearSupplierConflict,
  } = useCart();
  const storeScope = resolveStoreScope({
    pathname: typeof window !== "undefined" ? window.location.pathname : "/cart",
    search: typeof window !== "undefined" ? window.location.search : "",
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
  });
  const currentAffiliateSlug = affiliateSlugForStoreScope(storeScope);
  // Affiliate carts request that storefront's server-calculated sale price. The
  // browser never refreshes them from CabinetDealz's generic homeowner/list price.
  const isAffiliateCart = Boolean(currentAffiliateSlug);
  const money = (n: number | null): string =>
    n == null ? t("crt_quoted") : `$${n.toFixed(2)}`;
  const [, navigate] = useLocation();
  const [zipInput, setZipInput] = useState(zip ?? "");
  const [requestUpsParcelQuote, setRequestUpsParcelQuote] = useState(false);

  // Determine the viewer's current pricing tier from their login state.
  const { user } = useAuth();
  const viewerTier = resolveStorefrontTier(user);

  // Build the list of (masterCode, styleId) pairs for cabinet items in the cart.
  const cartPairs = useMemo(
    () =>
      items
        .filter((i) => i.distributorId != null) // cabinets only (not pelican products)
        .map((i) => ({ masterCode: i.masterCode, styleId: i.styleId, distributorId: i.distributorId })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map((i) => `${i.masterCode}:${i.styleId}:${i.distributorId ?? "_"}`).join(",")]
  );

  // Fetch live tier-computed prices for all cart items. This ensures the cart
  // always shows the correct price for the viewer's current tier, even if the
  // stored unitPrice was added under a different tier.
  const { data: livePriceRows } = trpc.design.priceForCartItems.useQuery(
    { items: cartPairs, affiliateSlug: currentAffiliateSlug ?? undefined },
    { enabled: cartPairs.length > 0 }
  );

  // Build a map of exact masterCode:styleId:distributorId cart identity → live
  // unit price at the viewer's tier. Supplier-locked designs must never refresh
  // from another distributor that happens to carry the same master/style pair.
  const livePriceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of livePriceRows ?? []) {
      const price = isAffiliateCart ? Number(r.homeownerPrice) : resolveTierPrice(viewerTier, r);
      if (price != null) m.set(`${r.masterCode}:${r.styleId}:${r.distributorId ?? "_"}`, price);
    }
    return m;
  }, [livePriceRows, viewerTier, isAffiliateCart]);

  // Get the live price for a cart item, falling back to the stored unitPrice.
  const liveUnitPrice = (item: (typeof items)[number]): number | null => {
    const live = livePriceMap.get(`${item.masterCode}:${item.styleId}:${item.distributorId ?? "_"}`);
    const refreshedPrice = resolveAffiliateCartUnitPrice({
      storedUnitPrice: item.unitPrice,
      liveUnitPrice: live,
      tier: item.tier,
      isAffiliateCart,
      priceLocked: item.priceLocked,
    });
    return resolveLockedCheckoutUnitPrice({
      priceLocked: item.priceLocked,
      storedUnitPrice: item.unitPrice,
      recomputedUnitPrice: refreshedPrice,
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
      if (i.productKind !== "surface" && i.distributorId != null) m.set(i.distributorId, i.styleLabel);
    }
    return m;
  }, [items]);
  const isMixedSupplier = supplierGroups.size > 1;
  const separateGlassItems = useMemo(
    () => separateGlassPurchaseItems(items),
    [items],
  );
  const hasOnlyTemporaryFreeShippingItems = useMemo(
    () => isTemporaryOneDollarFreeShippingOrder(items),
    [items],
  );

  // Send cabinets and Pelican lines together; the server keeps vendor shipment
  // groups separate and only rates Pelican when supplier package data is present.
  const cartFreightItems = useMemo(
    () => items
      .filter(
        (item) => (item.productKind === "surface"
          || (item.distributorId != null && Boolean(item.masterCode)))
          && !isTemporaryOneDollarCheckoutTestItem(item),
      )
      .map((item) => ({
        cabinetId: null,
        masterCode: item.masterCode,
        styleId: optionalPositiveFreightId(item.styleId),
        distributorId: optionalPositiveFreightId(item.distributorId),
        qty: item.qty,
        weightLbs: null,
        productKind: item.productKind ?? null,
        category: item.category ?? null,
        pelicanProductId: item.productKind === "surface" ? item.pelicanProductId ?? null : null,
      })),
    [items],
  );
  const cartFreightInput = useMemo(() => ({
    destinationZip: normalizedZip ?? "",
    merchandiseSubtotalCents: Math.max(0, Math.round(liveSubtotal * 100)),
    accessorials: { residential: false, liftgate: false },
    items: cartFreightItems,
    carrierPreference: requestUpsParcelQuote ? "ups" as const : undefined,
  }), [normalizedZip, liveSubtotal, cartFreightItems, requestUpsParcelQuote]);
  const cartFreightEstimate = trpc.freight.estimate.useQuery(cartFreightInput, {
    enabled: false,
    retry: false,
  });
  const requestLiveCartQuote = () => {
    if (!normalizedZip) {
      toast.error("Enter and check a valid 5-digit delivery ZIP before requesting a live shipping quote.");
      return;
    }
    if (cartFreightItems.length === 0) {
      toast.error("Add at least one supplier cabinet to request a live shipping quote.");
      return;
    }
    void cartFreightEstimate.refetch();
  };

  const requestOrder = () => {
    if (items.length === 0) return;
    // Include styleId and tier from the first item so OrderReview can pre-select
    // the correct door style and pricing tier instead of defaulting to Aston Green.
    const firstItem = items[0];
    const prefill = {
      items: items.map((i) => cartItemToCheckoutPrefill(i, liveUnitPrice(i))),
      styleId: firstItem?.styleId ?? null,
      tier: firstItem?.tier ?? null,
      kitchenDesignId: sourceDesignId,
      carrierPreference: requestUpsParcelQuote ? "ups" : null,
    };
    try {
      sessionStorage.setItem(cartPrefillStorageKey(storeScope), JSON.stringify(prefill));
    } catch {
      /* ignore */
    }
    navigate(currentAffiliateSlug ? `/store/${currentAffiliateSlug}/order` : "/order/new");
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
            <Link href={currentAffiliateSlug ? `/store/${currentAffiliateSlug}` : "/catalog"}>{t("crt_browse_catalog")}</Link>
          </Button>
          <Button variant="outline" className="bg-background" asChild>
            <Link href={currentAffiliateSlug ? `/store/${currentAffiliateSlug}/design` : "/design"}>{t("crt_open_design")}</Link>
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

      {sourceDesignId != null && (
        <div data-testid="saved-plan-order-link" className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
          <div>
            <p className="font-semibold">Saved kitchen plan linked to this order</p>
            <p className="mt-1 text-sm">Checkout will save this plan’s verified merchandise subtotal separately and requires a current carrier quote before shipping can be submitted.</p>
          </div>
        </div>
      )}

      {(supplierConflict || isMixedSupplier) && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 flex flex-col gap-3 rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-destructive sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {isMixedSupplier ? "Multiple suppliers detected" : "Different supplier item was not added"}
              </p>
              <p className="mt-1 text-sm">
                {isMixedSupplier
                  ? `This cart contains cabinet items from ${supplierGroups.size} suppliers. Live freight and order submission require one supplier. Remove the other supplier items before continuing.`
                  : `Your cart is locked to ${supplierConflict?.lockedStyleLabel || "the original supplier line"}. The ${supplierConflict?.attemptedStyleLabel || "different supplier"} item was blocked so you are not charged for a second shipment. Clear or finish this cart before choosing another supplier.`}
              </p>
            </div>
          </div>
          {supplierConflict && !isMixedSupplier && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end text-destructive hover:text-destructive sm:self-start"
              onClick={clearSupplierConflict}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}

      {separateGlassItems.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="separate-glass-cart-warning"
          className="mb-6 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-semibold">Glass insert purchased separately</p>
              <p className="mt-1 text-sm">
                {separateGlassItems.length === 1
                  ? `${separateGlassItems[0]!.masterCode} requires a separate glass purchase from this distributor.`
                  : `${separateGlassItems.map((item) => item.masterCode).join(", ")} require separate glass purchases from this distributor.`}
                {" "}The cabinet is in your cart; confirm the matching glass insert or door with the distributor before ordering.
              </p>
            </div>
          </div>
        </div>
      )}

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
            const fillerDimensions = item.fillerStockWidthIn != null && item.fillerInstalledCutWidthIn != null
              ? { stock: formatEighthInches(item.fillerStockWidthIn), cut: formatEighthInches(item.fillerInstalledCutWidthIn) }
              : null;
            return (
              <div
                key={`${item.masterCode}-${item.styleId}-${item.tier}-${item.bundleId ?? ""}-${item.fillerStockWidthIn ?? ""}-${item.fillerInstalledCutWidthIn ?? ""}`}
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
                  {fillerDimensions && (
                    <dl data-testid="cart-filler-stock-and-cut" className="mt-2 grid grid-cols-2 gap-x-3 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-xs text-amber-950">
                      <div><dt className="uppercase tracking-wide text-[10px] font-semibold text-amber-800">Purchased stock</dt><dd className="font-semibold">{fillerDimensions.stock} wide</dd></div>
                      <div><dt className="uppercase tracking-wide text-[10px] font-semibold text-amber-800">Installed cut</dt><dd className="font-semibold">{fillerDimensions.cut} wide</dd></div>
                    </dl>
                  )}
                  {separateGlassItems.some((glassItem) => glassItem === item) && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" /> Glass purchased separately
                    </p>
                  )}

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
                    onClick={() => setQty(item.masterCode, item.styleId, item.tier, item.qty - 1, item.fillerStockWidthIn, item.fillerInstalledCutWidthIn)}
                    aria-label={t("crt_decrease_qty")}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-background"
                    onClick={() => setQty(item.masterCode, item.styleId, item.tier, item.qty + 1, item.fillerStockWidthIn, item.fillerInstalledCutWidthIn)}
                    aria-label={t("crt_increase_qty")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.masterCode, item.styleId, item.tier, item.fillerStockWidthIn, item.fillerInstalledCutWidthIn)}
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
              <span className={hasOnlyTemporaryFreeShippingItems ? "text-xs font-semibold text-emerald-700" : "text-xs text-muted-foreground"}>
                {hasOnlyTemporaryFreeShippingItems ? "Free test shipping" : t("crt_shipping_quoted")}
              </span>
            </div>
          </div>
          <Separator className="my-4" />
          {hasOnlyTemporaryFreeShippingItems ? (
            <div role="status" className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="font-semibold">Free test shipping</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                This temporary one-dollar checkout item is exempt from freight. Other cabinet products still require a current live shipping quote.
              </p>
            </div>
          ) : (
            <>
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
          <label
            htmlFor="ups-parcel-quote"
            className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-950 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-100"
          >
            <Checkbox
              id="ups-parcel-quote"
              checked={requestUpsParcelQuote}
              onCheckedChange={(checked) => setRequestUpsParcelQuote(checked === true)}
              className="mt-0.5 border-amber-700 data-[state=checked]:border-amber-800 data-[state=checked]:bg-amber-800"
            />
            <span>
              <span className="flex items-center gap-2 font-semibold">
                <span aria-label="UPS" className="inline-flex rounded-sm bg-[#351c15] px-1.5 py-0.5 text-[10px] font-black tracking-wide text-[#ffb500]">UPS</span>
                Prefer a UPS package quote
              </span>
              <span className="mt-0.5 block text-xs text-amber-900/85 dark:text-amber-100/85">
                Checks verified cartons for UPS only. If the cart is not UPS-eligible or UPS cannot return a rate, uncheck this option to request the configured LTL/live-freight path.
              </span>
            </span>
          </label>
          <div className="mb-4 rounded-lg border border-border bg-muted/25 p-3" aria-busy={cartFreightEstimate.isFetching}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Shipping quote</p>
                <p className="text-xs text-muted-foreground">
                  {requestUpsParcelQuote
                    ? "UPS parcel only: the quote must come from UPS. Uncheck this option to request the configured LTL/live-freight path."
                    : "Uses the actual eligible cabinet items and pallet plan in this cart."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={requestLiveCartQuote}
                disabled={cartFreightEstimate.isFetching || !normalizedZip || isMixedSupplier || cartFreightItems.length === 0}
              >
                {cartFreightEstimate.isFetching ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Calculating freight...</> : requestUpsParcelQuote ? <><span aria-hidden="true" className="mr-1 rounded-sm bg-[#351c15] px-1 py-0.5 text-[9px] font-black text-[#ffb500]">UPS</span>Check UPS / freight</> : <><Truck className="mr-1.5 h-3.5 w-3.5" />Get shipping quote</>}
              </Button>
            </div>
            {cartFreightEstimate.isFetching && (
              <div className="mt-3">
                <FreightCalculatingStatus upsRequested={requestUpsParcelQuote} compact />
              </div>
            )}
            {!cartFreightEstimate.isFetching && cartFreightEstimate.error && <p className="mt-2 text-xs text-destructive">{cartFreightEstimate.error.message}</p>}
            {!cartFreightEstimate.isFetching && cartFreightEstimate.data && (
              cartFreightEstimate.data.available ? (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-3 font-medium"><span>{cartFreightEstimate.data.zoneName ?? "Carrier quote"}</span><span>${(cartFreightEstimate.data.totalCents / 100).toFixed(2)}</span></div>
                    {cartFreightEstimate.data.reason && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">{cartFreightEstimate.data.reason}</p>}
                  {cartFreightEstimate.data.shipmentGroups?.map((group) => {
                    const deliveryDate = group.estimatedDeliveryDate
                      ? formatCarrierDeliveryDate(group.estimatedDeliveryDate)
                      : null;
                    return (
	                      <div key={`${group.label}:${group.originZip}`} className="rounded border border-border bg-background p-2 text-muted-foreground">
                        <div className="font-medium text-foreground">{group.vendorName ?? "Fulfillment vendor"} · {group.label}</div>
	                        {(group.estimatedPackageCount ?? 0) > 0 && (
	                          <div className="my-1 rounded border border-amber-200 bg-amber-50 p-1.5 text-amber-900">
	                            Generic flat-pack measurements used for {group.estimatedPackageCount} carton{group.estimatedPackageCount === 1 ? "" : "s"}. Exact supplier package data replaces these estimates automatically when entered.
	                          </div>
	                        )}
		                        {group.transportMode === "parcel" ? (
	                          <>
		                            <div>{group.parcelCount ?? group.parcels?.length ?? 0} {(group.estimatedPackageCount ?? 0) > 0 ? "estimated" : "verified"} carton{(group.parcelCount ?? group.parcels?.length ?? 0) === 1 ? "" : "s"} · Live UPS/FedEx/USPS service</div>
	                            {group.parcels?.map((parcel, index) => <div key={index}>Carton {index + 1}{parcel.label ? ` · ${parcel.label}` : ""}: {parcel.lengthIn} × {parcel.widthIn} × {parcel.heightIn} in · {parcel.weightLbs} lb{parcel.carrier ? ` · ${parcel.carrier}${parcel.service ? ` ${parcel.service}` : ""}` : ""}{parcel.amountCents != null ? ` · $${(parcel.amountCents / 100).toFixed(2)}` : ""}</div>)}
	                            {group.parcelReviewWarnings?.length ? (
	                              <div className="mt-1 rounded border border-amber-200 bg-amber-50 p-1.5 text-amber-900">
	                                Carrier handling review: {group.parcelReviewWarnings.join(" ")}
	                              </div>
	                            ) : null}
	                          </>
                        ) : (
                          <>
                            <div>{group.palletCount} pallet{group.palletCount === 1 ? "" : "s"} · Class {group.freightClass} · {group.totalContentsWeightLbs} lb contents · {group.totalWeightLbs} lb billed</div>
                            {group.pallets.map((pallet, index) => <div key={index}>Pallet {index + 1}: {pallet.lengthIn} × {pallet.widthIn} × {pallet.heightIn} in · {pallet.weightLbs} lb</div>)}
                          </>
                        )}
                        <div className="mt-2 flex items-start gap-2 rounded-md bg-primary/5 p-2 text-foreground">
                          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <div>
                            <p className="font-semibold">
                              Estimated carrier transit: {group.transitDays
                                ? `${group.transitDays} transit day${group.transitDays === 1 ? "" : "s"} after pickup`
                                : "Carrier confirmation required"}
                            </p>
                            {deliveryDate && <p>Quoted arrival date: {deliveryDate}</p>}
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Carrier estimate only; not guaranteed. Warehouse processing and order preparation occur before pickup.</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-xs text-amber-800">
                  <p>{cartFreightEstimate.data.reason ?? "The carrier could not return a live shipping quote."}</p>
                  {(cartFreightEstimate.data.shipmentGroups ?? []).map((group) => (
                    <div key={`${group.label}:${group.originZip}`} className="rounded border border-amber-200 bg-amber-50 p-2">
                      <div className="font-medium text-amber-950">{group.vendorName ?? group.label}</div>
                      <div>{group.label}</div>
                      <div className="font-medium">Status: {group.status === "needs_package_data" ? "Needs verified package data" : group.status === "carrier_error" ? "Carrier error" : "Not rated"}</div>
                      {group.statusReason && <div>{group.statusReason}</div>}
                      {group.pallets.map((pallet, index) => <div key={index}>Pallet {index + 1}: {pallet.lengthIn} × {pallet.widthIn} × {pallet.heightIn} in · {pallet.weightLbs} lb</div>)}
                      {(group.parcels ?? []).map((parcel, index) => <div key={index}>Carton {index + 1}: {parcel.lengthIn} × {parcel.widthIn} × {parcel.heightIn} in · {parcel.weightLbs} lb</div>)}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
            </>
          )}
          {outOfRangeCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("crt_out_range_warn_a")} {normalizedZip}. {t("crt_out_range_warn_b")}
            </div>
          )}
          {isMixedSupplier && (
            <div role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
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
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Review delivery and the final Stripe payment total before placing your order.
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={requestOrder}
            disabled={isMixedSupplier || cartFreightEstimate.isFetching}
          >
            {cartFreightEstimate.isFetching ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Calculating freight...</>
            ) : (
              <><Lock className="mr-1.5 h-4 w-4" /> Continue to secure checkout</>
            )}
          </Button>
          <Button variant="outline" className="mt-2 w-full bg-background" asChild>
            <Link href={currentAffiliateSlug ? `/store/${currentAffiliateSlug}` : "/catalog"}>{t("crt_continue_shopping")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
