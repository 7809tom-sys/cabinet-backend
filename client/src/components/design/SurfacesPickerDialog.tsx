import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  PELICAN_STOREFRONT_CATEGORIES,
  CATEGORY_GRADIENT,
  formatPrice,
  type PelicanCategory,
} from "@/lib/pelican";
import { BATHROOM_RECOMMENDED_SECTIONS, type RecommendedRole } from "./RecommendedSurfaces";
import { hasVerifiedPelicanFixtureProfile } from "@/lib/pelicanFixtureProfiles";
import { Search, Plus, Check, Waves } from "lucide-react";
import { usePreferredProducts } from "@/contexts/PreferredProductsContext";
import type { CountertopScope } from "@/lib/surfaceSelection";

export type SelectedSurface = {
  id: number;
  /** Authoritative Pelican item code; retained for verified fixture-profile matching. */
  pelicanCode?: string | null;
  slug: string;
  name: string;
  category: string;
  subCategory?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  /** Optional approved material-only image for the 3D scene. */
  materialImageUrl?: string | null;
  /** Explicit product used to dress this role in the 3D scene; other selections stay in the quote. */
  threeDActive?: boolean;
  sellPrice: number | null;
  /** Wall-run versus island countertop assignment. Undefined is the legacy whole-design behavior. */
  countertopScope?: CountertopScope;
  /** Sq ft per box/carton — when set, BOM auto-calculates box qty from area + overage. */
  coverageSqFt?: number | null;
  /** Supplier/fabricator-verified maximum unsupported overhang for this exact material. */
  unsupportedOverhangLimitIn?: number | null;
};

// The server applies the verified-only readiness gate before pagination. Keep
// the full palette at the server's safe maximum so verified sink/faucet choices
// are not silently hidden below a legacy first-page cap.
const PAGE_LIMIT = 200;

export type CountertopSwatchFilter = "all" | "swatch-ready" | "swatch-pending";

/** Keeps the countertop menu source-complete while allowing a quick preview-readiness view. */
export function matchesCountertopSwatchFilter(
  item: Pick<SelectedSurface, "category" | "materialImageUrl">,
  filter: CountertopSwatchFilter,
): boolean {
  if (item.category !== "Quartz Slabs (Countertops)" || filter === "all") return true;
  const swatchReady = Boolean(item.materialImageUrl?.trim());
  return filter === "swatch-ready" ? swatchReady : !swatchReady;
}

export function SurfacesPickerDialog({
  open,
  onOpenChange,
  selected,
  onToggle,
  estimatedSubtotal,
  countertopPriceLines = [],
  backsplashHeightMode = "standard",
  onBacksplashHeightModeChange,
  countertopBacksplashHeightIn = 0,
  onCountertopBacksplashHeightChange,
  activeThreeDBacksplashId = null,
  onSetActiveThreeDBacksplash,
  roomType = "kitchen",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: SelectedSurface[];
  onToggle: (item: SelectedSurface) => void;
  /** Measured cart subtotal for selected surfaces, including area-based quantities. */
  estimatedSubtotal?: number | null;
  /** Price-locked countertop lines measured from the live rendered cabinet footprint. */
  countertopPriceLines?: Array<{
    name: string;
    qty: number;
    unitPrice: number | null;
    qtyNote?: string;
  }>;
  backsplashHeightMode?: "standard" | "full-height";
  onBacksplashHeightModeChange?: (mode: "standard" | "full-height") => void;
  countertopBacksplashHeightIn?: 0 | 2.5 | 3;
  onCountertopBacksplashHeightChange?: (height: 0 | 2.5 | 3) => void;
  /** The one selected tile/mosaic product currently dressing 3D wall segments. */
  activeThreeDBacksplashId?: number | null;
  onSetActiveThreeDBacksplash?: (item: SelectedSurface) => void;
  /** Keeps bathroom catalog choices isolated from kitchen-only fixture families. */
  roomType?: string;
}) {
  const isBathroom = roomType === "bathroom";
  const [category, setCategory] = useState<PelicanCategory | "Preferred">(PELICAN_STOREFRONT_CATEGORIES[0]);
  const [bathroomRole, setBathroomRole] = useState<RecommendedRole>("bathroom-sink");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [countertopSwatchFilter, setCountertopSwatchFilter] = useState<CountertopSwatchFilter>("all");
  const { products: preferredProducts } = usePreferredProducts();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Which categories actually have designer-visible items
  const { data: cats } = trpc.pelican.categories.useQuery(
    { scope: "designer" },
    { enabled: open && !isBathroom }
  );
  const availableCats = useMemo(() => {
    const have = new Set((cats ?? []).map((c) => c.category));
    const list = PELICAN_STOREFRONT_CATEGORIES.filter((c) => have.has(c));
    return list.length ? list : PELICAN_STOREFRONT_CATEGORIES;
  }, [cats]);

  // Keep the active category valid as availability loads
  useEffect(() => {
    if (category !== "Preferred" && availableCats.length && !availableCats.includes(category)) {
      setCategory(availableCats[0]);
    }
  }, [availableCats, category]);

  const { data, isLoading } = trpc.pelican.byCategory.useQuery(
    {
      category: category as PelicanCategory,
      scope: "designer",
      search: debounced || undefined,
      limit: PAGE_LIMIT,
      offset: 0,
    },
    { enabled: open && !isBathroom && category !== "Preferred" }
  );
  const { data: bathroomData, isLoading: bathroomLoading } = trpc.surfaces.recommended.useQuery(
    { role: bathroomRole, limit: PAGE_LIMIT },
    { enabled: open && isBathroom },
  );

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const preferredIds = useMemo(
    () => preferredProducts.map((product) => product.id).filter(Number.isInteger),
    [preferredProducts],
  );
  const { data: verifiedPreferredProducts, isLoading: preferredProductsLoading } = trpc.surfaces.designerByIds.useQuery(
    { ids: preferredIds },
    { enabled: open && category === "Preferred" && preferredIds.length > 0 },
  );
  const preferredItems = useMemo(() => (verifiedPreferredProducts ?? []).map((product) => ({
      id: product.id,
      pelicanCode: product.pelicanCode,
      slug: product.slug,
      name: product.name,
      category: product.category,
      subCategory: product.subCategory,
      size: product.size,
      imageUrl: product.imageUrl,
      materialImageUrl: product.materialImageUrl,
      sellPrice: product.sellPrice,
      coverageSqFt: product.coverageSqFt ?? null,
      unsupportedOverhangLimitIn: product.unsupportedOverhangLimitIn ?? null,
    })), [verifiedPreferredProducts]);
  const items: SelectedSurface[] = (isBathroom
    ? bathroomData ?? []
    : category === "Preferred"
      ? preferredItems
      : data?.items ?? []) as SelectedSurface[];
  const paletteLoading = isBathroom ? bathroomLoading : category === "Preferred" ? preferredProductsLoading : isLoading;
  const visibleItems = useMemo(() => {
    const searched = category !== "Preferred" || !debounced
      ? items
      : items.filter((item) => `${item.name} ${item.subCategory ?? ""} ${item.size ?? ""}`.toLowerCase().includes(debounced.toLowerCase()));
    return searched.filter((item) => {
      if (isBathroom) return true;
      if (item.category === "Sinks & Faucets") return hasVerifiedPelicanFixtureProfile(item.pelicanCode);
      const isMaterialRole = item.category === "Flooring"
        || item.category === "Tile & Mosaic"
        || item.category === "Quartz Slabs (Countertops)";
      // Active, priced Designer countertops remain selectable even when the
      // supplier has not yet supplied a repeatable material-only swatch. Their
      // card names the neutral 3D preview explicitly; catalog photography never
      // becomes a texture. Flooring and tile keep the stricter swatch rule.
      if (item.category === "Quartz Slabs (Countertops)") {
        return matchesCountertopSwatchFilter(item, countertopSwatchFilter);
      }
      return isMaterialRole && Boolean(item.materialImageUrl?.trim());
    });
  }, [category, countertopSwatchFilter, debounced, isBathroom, items]);
  const countertopSwatchCounts = useMemo(() => {
    const countertops = items.filter((item) => item.category === "Quartz Slabs (Countertops)");
    const ready = countertops.filter((item) => matchesCountertopSwatchFilter(item, "swatch-ready")).length;
    return { all: countertops.length, ready, pending: countertops.length - ready };
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Waves className="h-5 w-5 text-[var(--color-gold)]" /> {isBathroom ? "Bathroom Fixtures" : "Surfaces & Fixtures"}
          </DialogTitle>
          <DialogDescription className="hidden sm:block text-xs sm:text-sm">
            {isBathroom
              ? "Browse active, source-priced Pelican bathroom fixtures only. Catalog selections are retained in the design; only verified vanity basins and faucets receive a measured 3D installation through a compatible vanity base."
              : "Add source-ready Pelican finishes and fixtures to this design. A new flooring or backsplash choice replaces the prior material everywhere in the final kitchen."}
          </DialogDescription>
        </DialogHeader>

        {/* Category tabs + search */}
        <div className="shrink-0 flex flex-col gap-2 sm:gap-3 border-b border-border px-4 py-2 sm:px-6 sm:py-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
            {!isBathroom && preferredItems.length > 0 && (
              <Button
                size="sm"
                variant={category === "Preferred" ? "default" : "outline"}
                className="h-7 text-xs whitespace-nowrap shrink-0"
                onClick={() => setCategory("Preferred")}
              >
                Preferred ({preferredItems.length})
              </Button>
            )}
            {isBathroom ? BATHROOM_RECOMMENDED_SECTIONS.map((section) => (
              <Button
                key={section.role}
                size="sm"
                variant={section.role === bathroomRole ? "default" : "outline"}
                className="h-7 text-xs whitespace-nowrap shrink-0"
                onClick={() => setBathroomRole(section.role)}
              >
                {section.label}
              </Button>
            )) : availableCats.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={c === category ? "default" : "outline"}
                className="h-7 text-xs whitespace-nowrap shrink-0"
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isBathroom ? "Search bathroom fixtures…" : category === "Preferred" ? "Search preferred products…" : `Search ${category.toLowerCase()}…`}
                className="pl-9"
              />
            </div>
            {category === "Quartz Slabs (Countertops)" && (
              <Select value={countertopSwatchFilter} onValueChange={(value) => setCountertopSwatchFilter(value as CountertopSwatchFilter)}>
                <SelectTrigger data-testid="countertop-swatch-filter" aria-label="Filter countertop 3D material readiness" className="w-full sm:w-[244px]">
                  <SelectValue placeholder="Filter 3D material readiness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countertop options ({countertopSwatchCounts.all})</SelectItem>
                  <SelectItem value="swatch-ready">3D material swatch ready ({countertopSwatchCounts.ready})</SelectItem>
                  <SelectItem value="swatch-pending">Neutral preview — swatch pending ({countertopSwatchCounts.pending})</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {!isBathroom && category === "Preferred" && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">Saved favorites remain in your catalog list. This Designer view shows only favorites that are active, priced, Designer-enabled, and verified for an exact material or fixture role.</p>
          )}
          {!isBathroom && category === "Sinks & Faucets" && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">Only fixtures with a source-verified 3D profile are shown here. Choose a sink and faucet through a compatible sink base to place their measured 3D models in the kitchen; adding an item here also retains it in the quote.</p>
          )}
          {category === "Tile & Mosaic" && (onBacksplashHeightModeChange || onCountertopBacksplashHeightChange) && (
            <div className="grid gap-2 rounded-lg border border-[#a87f33]/30 bg-[#fffaf0] p-2.5 text-xs sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#60491b]">Wall tile coverage</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant={backsplashHeightMode === "standard" ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => onBacksplashHeightModeChange?.("standard")}>Standard to uppers</Button>
                  <Button type="button" size="sm" variant={backsplashHeightMode === "full-height" ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => onBacksplashHeightModeChange?.("full-height")}>Full height to ceiling</Button>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#60491b]">Countertop rear upstand</div>
                <div className="flex flex-wrap gap-1.5">
                  {([0, 2.5, 3] as const).map((height) => (
                    <Button key={height} type="button" size="sm" variant={countertopBacksplashHeightIn === height ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => onCountertopBacksplashHeightChange?.(height)}>
                      {height === 0 ? "None" : `${height}\" upstand`}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="sm:col-span-2 text-[10px] leading-relaxed text-muted-foreground">12-inch wall tile is continuous only above countertop-supported cabinet and appliance runs. Standard ends at upper cabinets; a range continues to its hood. Full-height coverage increases material quantity and price.</p>
            </div>
          )}
          {category === "Quartz Slabs (Countertops)" && countertopPriceLines.length > 0 && (
            <div data-testid="countertop-priced-coverage" className="rounded-lg border border-[#a87f33]/30 bg-[#fffaf0] p-2.5 text-xs">
              <div className="mb-1 font-semibold text-[#60491b]">Measured countertop pricing</div>
              <div className="space-y-1 text-muted-foreground">
                {countertopPriceLines.map((line) => (
                  <p key={`${line.name}:${line.qty}:${line.unitPrice ?? "pending"}`}>
                    <span className="font-medium text-foreground">{line.name}</span>
                    {line.qtyNote ? ` — ${line.qtyNote}` : ` — ${line.qty} ${line.qty === 1 ? "slab" : "slabs"}`}
                    {line.unitPrice != null ? ` · ${formatPrice(line.unitPrice * line.qty)}` : " · pricing pending"}
                  </p>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">The bar extension across a drywall pony wall is included in this measured coverage. Supplier pricing is per whole slab, so the total changes when that added coverage requires another slab.</p>
            </div>
          )}
          {category === "Quartz Slabs (Countertops)" && (
            <p data-testid="countertop-selection-availability" className="text-[10px] leading-relaxed text-muted-foreground">All active, source-priced countertop products are available to select and quote. A product without an approved repeatable slab swatch remains accurately priced and is shown in 3D with the labeled neutral preview until its material swatch is supplied.</p>
          )}
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {paletteLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 w-full rounded-lg" />
                ))}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                {isBathroom ? "No source-priced bathroom fixtures match your search." : category === "Preferred" ? "No saved products currently meet the verified Designer gate." : `No ${category.toLowerCase()} items match your search.`}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {visibleItems.map((p: any) => {
                  const isSel = selectedIds.has(p.id);
                  const gradient =
                    CATEGORY_GRADIENT[p.category] ?? "linear-gradient(135deg,#e5e7eb,#cbd5e1)";
                  const hasThreeDMaterialRole = /floor|tile|mosaic|backsplash|countertop|quartz|slab/i.test(`${p.category ?? ""} ${p.subCategory ?? ""}`);
                  const hasApprovedMaterialSwatch = Boolean(p.materialImageUrl?.trim());
                  const isBacksplash = p.category === "Tile & Mosaic";
                  const isActiveThreeDBacksplash = isBacksplash && activeThreeDBacksplashId === p.id;
                  const item: SelectedSurface = {
                    id: p.id,
                    pelicanCode: p.pelicanCode,
                    slug: p.slug,
                    name: p.name,
                    category: p.category,
                    subCategory: p.subCategory,
                    size: p.size,
                    imageUrl: p.imageUrl,
                    materialImageUrl: p.materialImageUrl,
                    sellPrice: p.sellPrice,
                    coverageSqFt: p.coverageSqFt ?? null,
                    unsupportedOverhangLimitIn: p.unsupportedOverhangLimitIn == null ? null : Number(p.unsupportedOverhangLimitIn),
                  };
                  return (
                    <div
                      key={p.id}
                      className={`overflow-hidden rounded-lg border transition-colors ${
                        isSel ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/40" : "border-border"
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: gradient }}
                          >
                            <span className="px-2 text-center text-[10px] font-medium uppercase tracking-wide text-black/40">
                              {p.category}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 p-2.5">
                        <div className="line-clamp-2 min-h-[2.25rem] text-xs font-semibold leading-snug">
                          {p.name}
                        </div>
                        {p.size && (
                          <div className="text-[11px] text-muted-foreground">{p.size}</div>
                        )}
                        {hasThreeDMaterialRole && (
                          <p data-testid={`surface-material-readiness-${p.id}`} className={`text-[10px] font-medium leading-snug ${hasApprovedMaterialSwatch ? "text-emerald-700" : "text-amber-800"}`}>
                            {hasApprovedMaterialSwatch ? "3D material swatch ready" : "3D material swatch pending — neutral preview"}
                          </p>
                        )}
                        {isSel && isBacksplash && onSetActiveThreeDBacksplash && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isActiveThreeDBacksplash ? "default" : "outline"}
                            className="h-7 w-full text-[11px]"
                            data-testid={`surface-use-in-3d-${p.id}`}
                            disabled={isActiveThreeDBacksplash}
                            onClick={() => onSetActiveThreeDBacksplash(item)}
                          >
                            {isActiveThreeDBacksplash ? "Final 3D wall material" : "Use in 3D wall"}
                          </Button>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-sm font-bold text-[var(--color-navy)] dark:text-foreground">
                            {formatPrice(p.sellPrice)}
                          </span>
                          <Button
                            size="sm"
                            variant={isSel ? "secondary" : "default"}
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => onToggle(item)}
                          >
                            {isSel ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Added
                              </>
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5" /> Add
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer summary */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <div className="text-sm text-muted-foreground">
            {selected.length === 0 ? (
              "No surfaces added yet"
            ) : (
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{selected.length}</Badge>
                added ·{" "}
                <span className="font-semibold text-foreground">
                  {formatPrice(estimatedSubtotal ?? selected.reduce((sum, s) => sum + (s.sellPrice ?? 0), 0))}
                </span>
              </span>
            )}
          </div>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
