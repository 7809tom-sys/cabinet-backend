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
import { CabinetImage } from "@/components/CabinetImage";
import { trpc } from "@/lib/trpc";
import { normalizeZip } from "@shared/availability";
import { toast } from "sonner";

// Key the OrderBuilder reads on mount to prefill the review step from the cart.
export const CART_PREFILL_KEY = "cd_cart_prefill_v1";

function money(n: number | null): string {
  if (n == null) return "Quoted";
  return `$${n.toFixed(2)}`;
}

export default function Cart() {
  const { items, removeItem, setQty, clear, zip, setZip, subtotal, count } = useCart();
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

  // Freight estimate (computed in-house from origin/zone/weight + markup).
  const freightItems = useMemo(
    () => items.map((i) => ({ cabinetId: null, masterCode: i.masterCode, qty: i.qty })),
    [items]
  );
  const subtotalCents = Math.round(subtotal * 100);
  const freightQuery = trpc.freight.estimate.useQuery(
    {
      destinationZip: normalizedZip ?? "",
      items: freightItems,
      merchandiseSubtotalCents: subtotalCents,
    },
    { enabled: !!normalizedZip && items.length > 0 }
  );
  const freight = freightQuery.data;

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
      toast.error("Enter a valid 5-digit ZIP code.");
      return;
    }
    setZip(normalizedZip);
    toast.success(`Showing availability for ${normalizedZip}`);
  };

  // Family-lock: every line in one order must share a single door-style family.
  const familyGroups = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of items) m.set(i.styleId, i.styleLabel);
    return m;
  }, [items]);
  const isMixedFamily = familyGroups.size > 1;

  const requestOrder = () => {
    if (items.length === 0) return;
    if (isMixedFamily) {
      toast.error("An order must stay within one door style. Remove items so only one style remains.");
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
        <h1 className="font-serif text-3xl font-bold mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">
          Browse the catalog or build a kitchen in the Design Tool, then add cabinets here to
          request a quote.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/catalog">Browse Catalog</Link>
          </Button>
          <Button variant="outline" className="bg-background" asChild>
            <Link href="/design">Open Design Tool</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl md:text-4xl font-bold">Your Cart</h1>
        <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground">
          <Trash2 className="mr-1.5 h-4 w-4" /> Clear cart
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <div className="space-y-4">
          {/* ZIP / availability bar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-primary" />
              Delivery ZIP — check availability near you
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyZip()}
                placeholder="e.g. 75201"
                inputMode="numeric"
                className="max-w-[180px]"
                aria-label="Delivery ZIP code"
              />
              <Button onClick={applyZip} disabled={availabilityQuery.isFetching}>
                {availabilityQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
              </Button>
            </div>
            {hasCheckedZip && (
              <p className="mt-2 text-xs text-muted-foreground">
                {outOfRangeCount === 0
                  ? "All items are available to ship to your area."
                  : `${outOfRangeCount} item${outOfRangeCount > 1 ? "s" : ""} may not be available within range of your ZIP.`}
              </p>
            )}
          </div>

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
                          Available{a.nearestMiles != null ? ` · ~${a.nearestMiles} mi` : ""}
                          {a.leadTimeDays != null ? ` · ~${a.leadTimeDays}-day lead` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          Out of service range for {normalizedZip}
                          {a.nearestMiles != null ? ` (nearest ~${a.nearestMiles} mi)` : ""}
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
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-background"
                    onClick={() => setQty(item.masterCode, item.styleId, item.tier, item.qty + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="w-24 text-right">
                  <div className="text-sm font-semibold">{money(lineTotal)}</div>
                  <div className="text-xs text-muted-foreground">{money(item.unitPrice)} ea</div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(item.masterCode, item.styleId, item.tier)}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 h-fit rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-lg font-semibold">Order Summary</h2>
          <Separator className="my-4" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated subtotal</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" /> Est. freight
              </span>
              <span className="font-medium">
                {!normalizedZip ? (
                  <span className="text-xs text-muted-foreground">Enter ZIP above</span>
                ) : freightQuery.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : freight?.available ? (
                  freight.freeFreightApplied ? "FREE" : `$${(freight.totalCents / 100).toFixed(2)}`
                ) : (
                  <span className="text-xs text-amber-600">Quoted</span>
                )}
              </span>
            </div>
            {freight?.available && !freight.freeFreightApplied && (
              <div className="flex justify-between border-t border-border pt-2 mt-1">
                <span className="text-muted-foreground">Estimated total</span>
                <span className="font-semibold">
                  ${(subtotal + freight.totalCents / 100).toFixed(2)}
                </span>
              </div>
            )}
            {freight?.available && (
              <p className="text-[11px] text-muted-foreground pt-1">
                {freight.zoneName} · ~{freight.billableWeightLbs} lbs · freight estimate, confirmed on your order.
              </p>
            )}
          </div>
          <Separator className="my-4" />
          <p className="mb-4 text-xs text-muted-foreground">
            Final pricing, freight, and any applicable fees are confirmed on the order request. A
            touch-up kit is suggested during checkout.
          </p>
          {outOfRangeCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Some items are outside the service range for {normalizedZip}. You can still submit a
              request and our team will confirm options.
            </div>
          )}
          {isMixedFamily && (
            <div className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  An order ships in one door style. Your cart mixes{" "}
                  <span className="font-semibold">{familyGroups.size}</span> styles
                  {": "}
                  {Array.from(familyGroups.values()).join(", ")}. Remove items so only one
                  style remains to continue.
                </div>
              </div>
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={requestOrder}
            disabled={isMixedFamily}
          >
            <Check className="mr-1.5 h-4 w-4" /> Request this order
          </Button>
          <Button variant="outline" className="mt-2 w-full bg-background" asChild>
            <Link href="/catalog">Continue shopping</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
