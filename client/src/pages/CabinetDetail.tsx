import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ChevronLeft, Package, Palette, DollarSign,
  ShoppingCart, Info, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { cabinetTypeLabel, resolveDoorDrawerCounts } from "@/lib/cabinetGraphics";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { doorFamilyPhoto, kitchenSceneWithCopy } from "@/lib/doorFamilyPhotos";
import { finishColors } from "@/lib/design";
import { useCart } from "@/contexts/CartContext";

// ─── Price tier display ───────────────────────────────────────────────────────
// Trade-only platform: pricing is shown by trade tier. No homeowner/retail tier.

type PricingTier = "Wholesale" | "Contractor";

const TIERS: { key: PricingTier; label: string; description: string }[] = [
  { key: "Wholesale", label: "Wholesale", description: "For licensed dealers & high-volume trade accounts" },
  { key: "Contractor", label: "Contractor", description: "For general contractors & remodelers" },
];

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

// ─── Door-style pricing row (distributor identity never exposed) ───────────────

interface StyleRow {
  styleId: number;
  styleCode: string;
  name: string;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  thumbnailImageUrl: string | null;
  listPrice: string | null;
  adjustedListPrice: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  platformSku: string;
  leadTimeDays: number | null;
  distributorId: number | null;
}

function priceForTier(row: StyleRow, tier: PricingTier): string {
  if (tier === "Wholesale") return fmt(row.wholesalePrice);
  return fmt(row.contractorPrice);
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

interface Props {
  masterCode: string;
}

export default function CabinetDetail({ masterCode }: Props) {
  const searchStr = useSearch();
  // When a shopper arrives from a door-style FAMILY page we pre-lock that style
  // (passed as ?style=<styleId>) so the cabinet shows in the family they picked.
  const styleParam = (() => {
    const v = new URLSearchParams(searchStr).get("style");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(styleParam);
  const [tier, setTier] = useState<PricingTier>("Contractor");
  const [qty, setQty] = useState(1);

  const { data: cabinet, isLoading: cabinetLoading } = trpc.cabinets.byCode.useQuery({
    masterCode,
  });

  const { data: styles, isLoading: pricingLoading } = trpc.pricing.stylesForCabinet.useQuery(
    { cabinetId: cabinet?.id ?? 0 },
    { enabled: !!cabinet?.id }
  );

  const styleRows = (styles ?? []) as StyleRow[];

  // Auto-select: the family passed in ?style= if it's available for this
  // cabinet, otherwise the explicit user choice, otherwise the first style.
  const styleParamAvailable =
    styleParam != null && styleRows.some((s) => s.styleId === styleParam);
  const activeStyle =
    selectedStyleId ??
    (styleParamAvailable ? styleParam : null) ??
    styleRows[0]?.styleId ??
    null;
  const selectedRow = styleRows.find((s) => s.styleId === activeStyle) ?? null;

  // Recolor the to-scale drawing to the selected door style's real finish.
  const finishFace = finishColors(
    selectedRow?.color || selectedRow?.name || selectedRow?.styleCode
  ).face;

  const { addItem } = useCart();

  const handleAddToCart = () => {
    if (!selectedRow) return;
    const priceStr = tier === "Wholesale" ? selectedRow.wholesalePrice : selectedRow.contractorPrice;
    const unitPrice = priceStr ? parseFloat(priceStr) : null;
    addItem({
      masterCode,
      name: cabinet?.description ?? selectedRow.name,
      styleId: selectedRow.styleId,
      styleLabel: selectedRow.name,
      distributorId: selectedRow.distributorId ?? null,
      tier,
      unitPrice: unitPrice != null && !isNaN(unitPrice) ? unitPrice : null,
      qty,
    });
    toast.success(`Added ${qty}\u00d7 ${masterCode} to cart`, {
      description: `${selectedRow.name} \u00b7 ${tier} pricing`,
    });
  };

  if (cabinetLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-4 w-32 mb-6" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="h-64 rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!cabinet) {
    return (
      <div className="container py-16 text-center">
        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <h2 className="font-serif text-2xl font-bold mb-2">Cabinet Not Found</h2>
        <p className="text-muted-foreground mb-4">No cabinet with code "{masterCode}" exists.</p>
        <Link href="/catalog">
          <Button variant="outline">Back to Catalog</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/catalog" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          Catalog
        </Link>
        {cabinet.category && (
          <>
            <span>/</span>
            <Link href={`/catalog?category=${cabinet.category}`} className="hover:text-foreground">
              {cabinet.category}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground font-medium">{masterCode}</span>
      </nav>

      {/* Kitchen-scene lead-in: sell the finished kitchen first.
          Combine panel family + color + name so the scene matches the finish. */}
      {(() => {
        const sceneKey = selectedRow
          ? [selectedRow.doorStyle, selectedRow.color, selectedRow.name]
              .filter(Boolean)
              .join(" ")
          : null;
        const scene = kitchenSceneWithCopy({ doorStyle: sceneKey });
        return (
          <div className="relative overflow-hidden rounded-2xl border border-border mb-8">
            <img
              src={scene.image}
              alt={scene.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/90 via-[var(--color-navy)]/65 to-transparent" />
            <div className="relative px-6 py-7 md:px-10 md:py-9 max-w-2xl">
              <p className="text-[var(--color-gold,#c9a14a)] text-xs font-semibold uppercase tracking-wider mb-1">
                Build this look
              </p>
              <h2 className="font-serif text-xl md:text-2xl font-bold text-white">
                {scene.title}
              </h2>
              <p className="text-white/85 text-sm mt-2">{scene.blurb}</p>
            </div>
          </div>
        );
      })()}

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Image + specs */}
        <div>
          {/* Product image: an accurate, to-scale drawing of THIS exact item,
              recolored to the selected door-style finish. The drawing is driven
              by the cabinet's real type + dimensions + door/drawer counts, so it
              always matches the actual item (no generic/wrong renders). */}
          <div className="mb-2">
            <div className="rounded-xl border border-border bg-gradient-to-b from-white to-muted/30 h-64 flex items-center justify-center overflow-hidden p-4">
              <CabinetDrawing
                cabinet={cabinet}
                finishColor={finishFace}
                className="h-full w-auto max-w-full"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Drawn to scale{selectedRow ? ` in ${selectedRow.name}` : ""} — front elevation
            </p>
          </div>
          {selectedRow ? (
            <div className="flex items-center gap-3 mb-6 rounded-lg border border-border p-2.5">
              {doorFamilyPhoto(selectedRow) ? (
                <div className="h-12 w-10 rounded bg-muted/40 shrink-0 overflow-hidden">
                  <img
                    src={doorFamilyPhoto(selectedRow)!}
                    alt={`${selectedRow.doorStyle || "Door"} panel profile`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="h-12 w-12 rounded bg-muted/40 shrink-0 flex items-center justify-center p-1 overflow-hidden">
                <DoorStyleSwatch style={selectedRow} className="h-full w-auto" />
              </div>
              <div className="text-xs text-muted-foreground leading-tight">
                <div className="font-medium text-foreground">{selectedRow.name}</div>
                <div>{selectedRow.doorStyle ? `${selectedRow.doorStyle} profile · true color` : "Selected door style"} · drawing to scale</div>
              </div>
            </div>
          ) : (
            <div className="mb-6" />
          )}

          {/* Blind corner details */}
          {(cabinet.openingWidth || cabinet.minPull || cabinet.maxPull) && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-5 mb-6">
              <h3 className="font-semibold text-sm text-foreground mb-1 flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-600" />
                Blind Corner Details
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                A blind corner cabinet hides part of its run behind the adjacent cabinets. Pull it away from the
                corner within the range below so the neighboring run&apos;s doors and drawers clear, then add a corner filler.
              </p>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {[
                  { label: "Opening Width", value: cabinet.openingWidth ? `${parseFloat(cabinet.openingWidth)}\"` : null },
                  { label: "Min Pull", value: cabinet.minPull ? `${parseFloat(cabinet.minPull)}\"` : null },
                  { label: "Max Pull", value: cabinet.maxPull ? `${parseFloat(cabinet.maxPull)}\"` : null },
                ]
                  .filter((item) => item.value)
                  .map((item) => (
                    <div key={item.label}>
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="font-semibold text-foreground">{item.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}

          {/* Specs */}
          <div className="rounded-xl border border-border p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Specifications
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                { label: "Type", value: cabinetTypeLabel(cabinet) },
                { label: "Width", value: cabinet.width ? `${cabinet.width}"` : null },
                { label: "Height", value: cabinet.height ? `${cabinet.height}"` : null },
                { label: "Depth", value: cabinet.depth ? `${cabinet.depth}"` : null },
                { label: "Doors", value: resolveDoorDrawerCounts(cabinet).doors ? String(resolveDoorDrawerCounts(cabinet).doors) : null },
                { label: "Drawers", value: resolveDoorDrawerCounts(cabinet).drawers ? String(resolveDoorDrawerCounts(cabinet).drawers) : null },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label}>
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium text-foreground">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>

        {/* Right: Pricing selector */}
        <div>
          <div className="mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {masterCode}
            </span>
            <Badge variant="secondary" className="ml-2 text-xs">{cabinetTypeLabel(cabinet)}</Badge>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mt-2 mb-1">
            {cabinet.description}
          </h1>

          {/* Door style selector (price follows the chosen style) */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Select Door Style</span>
            </div>
            {pricingLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}
              </div>
            ) : styleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No door styles available for this item yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                {styleRows.map((s) => (
                  <button
                    key={s.styleId}
                    onClick={() => setSelectedStyleId(s.styleId)}
                    title={`${s.name}${s.doorStyle ? ` · ${s.doorStyle}` : ""}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                      activeStyle === s.styleId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground/70 hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <DoorStyleSwatch style={s} className="h-4 w-4 rounded shrink-0" />
                    {s.name}
                    {activeStyle === s.styleId && <Check className="h-3 w-3 ml-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pricing tier tabs + price display */}
          {selectedRow && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Trade Pricing</span>
              </div>

              <Tabs value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
                <TabsList className="w-full">
                  {TIERS.map((t) => (
                    <TabsTrigger key={t.key} value={t.key} className="flex-1 text-xs">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {TIERS.map((t) => (
                  <TabsContent key={t.key} value={t.key} className="mt-3">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="text-3xl font-bold text-foreground">
                            {priceForTier(selectedRow, t.key)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>MSRP: {fmt(selectedRow.listPrice)}</div>
                          {selectedRow.leadTimeDays != null && (
                            <div>Lead time: ~{selectedRow.leadTimeDays} days</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                        <span>{selectedRow.name}</span>
                        {selectedRow.doorStyle && (
                          <>
                            <span className="mx-2">·</span>
                            <span>{selectedRow.doorStyle}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              {/* Qty + Add to Cart */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-sm font-medium border-x border-border min-w-[3rem] text-center">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(qty + 1)}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    +
                  </button>
                </div>

                <Button
                  className="flex-1 gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </Button>
              </div>
            </div>
          )}

          {/* No pricing available */}
          {!pricingLoading && styleRows.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pricing available for this item.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
