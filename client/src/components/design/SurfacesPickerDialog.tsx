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
import { trpc } from "@/lib/trpc";
import {
  PELICAN_STOREFRONT_CATEGORIES,
  CATEGORY_GRADIENT,
  formatPrice,
  type PelicanCategory,
} from "@/lib/pelican";
import { hasVerifiedPelicanFixtureProfile } from "@/lib/pelicanFixtureProfiles";
import { Search, Plus, Check, Waves } from "lucide-react";
import { usePreferredProducts } from "@/contexts/PreferredProductsContext";

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
  sellPrice: number | null;
  /** Sq ft per box/carton — when set, BOM auto-calculates box qty from area + overage. */
  coverageSqFt?: number | null;
};

const PAGE_LIMIT = 60;

export function SurfacesPickerDialog({
  open,
  onOpenChange,
  selected,
  onToggle,
  backsplashHeightMode = "standard",
  onBacksplashHeightModeChange,
  countertopBacksplashHeightIn = 0,
  onCountertopBacksplashHeightChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: SelectedSurface[];
  onToggle: (item: SelectedSurface) => void;
  backsplashHeightMode?: "standard" | "full-height";
  onBacksplashHeightModeChange?: (mode: "standard" | "full-height") => void;
  countertopBacksplashHeightIn?: 0 | 2.5 | 3;
  onCountertopBacksplashHeightChange?: (height: 0 | 2.5 | 3) => void;
}) {
  const [category, setCategory] = useState<PelicanCategory | "Preferred">(PELICAN_STOREFRONT_CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const { products: preferredProducts } = usePreferredProducts();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Which categories actually have designer-visible items
  const { data: cats } = trpc.pelican.categories.useQuery(
    { scope: "designer" },
    { enabled: open }
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
    { enabled: open && category !== "Preferred" }
  );

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const preferredItems = useMemo(() => preferredProducts.map((product) => ({
      id: product.id,
      pelicanCode: null,
      slug: product.slug,
    name: product.name,
    category: product.productCategory,
    subCategory: product.subCategory,
    size: product.size,
    imageUrl: product.imageUrl,
    materialImageUrl: product.materialImageUrl,
    sellPrice: product.sellPrice,
    coverageSqFt: product.coverageSqFt ?? null,
  })), [preferredProducts]);
  const items = category === "Preferred" ? preferredItems : data?.items ?? [];
  const visibleItems = useMemo(() => {
    const searched = category !== "Preferred" || !debounced
      ? items
      : items.filter((item) => `${item.name} ${item.subCategory ?? ""} ${item.size ?? ""}`.toLowerCase().includes(debounced.toLowerCase()));
    return searched.filter((item) => item.category !== "Sinks & Faucets" || hasVerifiedPelicanFixtureProfile(item.pelicanCode));
  }, [category, debounced, items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Waves className="h-5 w-5 text-[var(--color-gold)]" /> Surfaces & Fixtures
          </DialogTitle>
          <DialogDescription className="hidden sm:block text-xs sm:text-sm">
            Add Pelican finishes to this design. Selected items are carried into your quote.
          </DialogDescription>
        </DialogHeader>

        {/* Category tabs + search */}
        <div className="shrink-0 flex flex-col gap-2 sm:gap-3 border-b border-border px-4 py-2 sm:px-6 sm:py-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
            {preferredItems.length > 0 && (
              <Button
                size="sm"
                variant={category === "Preferred" ? "default" : "outline"}
                className="h-7 text-xs whitespace-nowrap shrink-0"
                onClick={() => setCategory("Preferred")}
              >
                Preferred ({preferredItems.length})
              </Button>
            )}
            {availableCats.map((c) => (
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={category === "Preferred" ? "Search preferred products…" : `Search ${category.toLowerCase()}…`}
              className="pl-9"
            />
          </div>
          {category === "Sinks & Faucets" && (
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
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {category !== "Preferred" && isLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 w-full rounded-lg" />
                ))}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                {category === "Preferred" ? "No preferred products match your search." : `No ${category.toLowerCase()} items match your search.`}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {visibleItems.map((p: any) => {
                  const isSel = selectedIds.has(p.id);
                  const gradient =
                    CATEGORY_GRADIENT[p.category] ?? "linear-gradient(135deg,#e5e7eb,#cbd5e1)";
                  const hasThreeDMaterialRole = /floor|tile|mosaic|backsplash|countertop|quartz|slab/i.test(`${p.category ?? ""} ${p.subCategory ?? ""}`);
                  const hasApprovedMaterialSwatch = Boolean(p.materialImageUrl?.trim());
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
                  {formatPrice(selected.reduce((sum, s) => sum + (s.sellPrice ?? 0), 0))}
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
