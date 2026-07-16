import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { Search, Filter, ChevronRight, ChevronLeft, Package, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { styleDisplayName } from "@/lib/styleDisplayName";
import { CabinetImage } from "@/components/CabinetImage";
import { type CabinetLike, cabinetTypeLabel } from "@/lib/cabinetGraphics";
import { KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { translateSpec } from "@/lib/i18n/specPhrases";

// Door-style tiles for the catalog landing
interface DoorStyleTile {
  label: string;
  blurb: string;
  image: string;
}
const DOOR_STYLE_TILES: DoorStyleTile[] = [
  { label: "White Shaker", blurb: "Clean, bright and timeless — the most-requested look.", image: KITCHEN_SCENES["shaker-white"] },
  { label: "Gray Shaker", blurb: "Cool, modern neutral that pairs with any countertop.", image: KITCHEN_SCENES["shaker-gray"] },
  { label: "Raised Panel", blurb: "Traditional warmth with detailed cathedral fronts.", image: KITCHEN_SCENES["raised-cherry"] },
  { label: "Contemporary Slab", blurb: "Flat, handle-light fronts for a sleek modern kitchen.", image: KITCHEN_SCENES["slab-natural"] },
  { label: "Espresso", blurb: "Rich, deep tones for a bold, sophisticated space.", image: KITCHEN_SCENES["shaker-espresso"] },
];

const HERO_IMAGE = "/manus-storage/cat-hero-kitchen_bfa47868.jpg";

interface CategoryTile {
  match: (cat: string) => boolean;
  image: string;
  blurb: string;
}

const CATEGORY_TILES: Record<string, CategoryTile> = {
  Base: {
    match: (c) => c === "base",
    image: "/manus-storage/cat-base_9a298dfc.jpg",
    blurb: "Floor cabinets — drawer banks, sink bases, doors and corners.",
  },
  Wall: {
    match: (c) => c === "wall",
    image: "/manus-storage/cat-wall_d5380ec2.jpg",
    blurb: "Upper cabinets for dishes, glassware and pantry goods.",
  },
  Tall: {
    match: (c) => c === "tall",
    image: "/manus-storage/cat-tall_7523a9b7.jpg",
    blurb: "Full-height pantry and utility cabinets, floor to ceiling.",
  },
  ADA: {
    match: (c) => c === "ada",
    image: "/manus-storage/cat-ada_885a507c.jpg",
    blurb: "Accessible-height cabinets designed for universal design.",
  },
  Vanity: {
    match: (c) => c === "vanity",
    image: "/manus-storage/cat-vanity_b8e3457c.jpg",
    blurb: "Bathroom vanity bases with sink and storage options.",
  },
  Corner: {
    match: (c) => c === "corner",
    image: "/manus-storage/cat-base_9a298dfc.jpg",
    blurb: "Corner solutions — blind corner, lazy susan, diagonal and angled cabinets.",
  },
  Accessories: {
    match: (c) => c === "accessories" || c === "accessory",
    image: "/manus-storage/cat-accessory_c93204c0.jpg",
    blurb: "Crown molding, fillers, end panels, shelves and trim.",
  },
};

function tileFor(category: string): CategoryTile {
  const lc = category.toLowerCase();
  for (const key of Object.keys(CATEGORY_TILES)) {
    if (CATEGORY_TILES[key].match(lc)) return CATEGORY_TILES[key];
  }
  return { match: () => false, image: HERO_IMAGE, blurb: "Browse cabinets in this category." };
}

// ─── Cabinet card ─────────────────────────────────────────────────────────────

interface CabinetItem extends CabinetLike {
  id: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
}

function CabinetCard({ cabinet, styleId }: { cabinet: CabinetItem; styleId?: number | null }) {
  const { t, lang } = useLanguage();
  const href = styleId
    ? `/catalog/${cabinet.masterCode}?style=${styleId}`
    : `/catalog/${cabinet.masterCode}`;
  return (
    <Link href={href}>
      <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/30 cursor-pointer overflow-hidden transition-colors">
        <div className="relative h-44 bg-gradient-to-b from-white to-muted/30 flex items-center justify-center border-b border-border p-3">
          <CabinetImage
            cabinet={cabinet}
            className="h-full w-auto max-w-full transition-transform duration-300 group-hover:scale-[1.04]"
          />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {cabinet.masterCode}
            </span>
            <Badge variant="secondary" className="text-xs shrink-0">
              {cabinetTypeLabel(cabinet)}
            </Badge>
          </div>
          <p className="text-sm font-medium text-foreground mt-2 leading-snug line-clamp-2">
            {translateSpec(cabinet.description, lang)}
          </p>
          {(cabinet.width || cabinet.height || cabinet.depth) && (
            <p className="text-xs text-muted-foreground mt-2">
              {[
                cabinet.width && `${t("cat_w")}: ${cabinet.width}"`,
                cabinet.height && `${t("cat_h")}: ${cabinet.height}"`,
                cabinet.depth && `${t("cat_d")}: ${cabinet.depth}"`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("cat_view_pricing")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Category landing (tiles) ──────────────────────────────────────────────────

function CategoryLanding({ onSearch }: { onSearch: (term: string) => void }) {
  const { t } = useLanguage();
  const [term, setTerm] = useState("");

  const { data: styles } = trpc.doorStyles.list.useQuery();
  const featuredStyles = useMemo(() => {
    type FeaturedStyle = {
      id: number;
      styleCode: string;
      ourName: string | null;
      aliasName?: string | null;
      featuredLabel?: string | null;
      doorStyle: string | null;
      color: string | null;
      woodSpecies: string | null;
      roomSceneImageUrl: string | null;
    };
    const map = new Map<string, FeaturedStyle>();
    for (const s of (styles ?? []) as FeaturedStyle[]) {
      if (!s.roomSceneImageUrl) continue;
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).slice(0, 6);
  }, [styles]);

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <img
          src={HERO_IMAGE}
          alt="Modern kitchen with full cabinetry — base, wall and tall cabinets"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/90 via-[var(--color-navy)]/70 to-transparent" />
        <div className="relative px-6 py-12 md:px-12 md:py-16 max-w-2xl">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-white mb-3">
            {t("cat_hero_title")}
          </h1>
          <p className="text-white/85 text-sm md:text-base mb-6">
            {t("cat_hero_sub")}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (term.trim()) onSearch(term.trim());
            }}
            className="relative max-w-md"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("cat_search_placeholder")}
              className="pl-9 bg-white"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </form>
        </div>
      </div>

      {/* Shop by Door Style */}
      <div className="mt-10 flex flex-wrap items-end justify-between gap-3 mb-1">
        <h2 className="font-serif text-2xl font-bold text-foreground">
          {t("cat_shop_by_style")}
        </h2>
        <Link
          href="/styles"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {t("cat_view_all_styles")} <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        {t("cat_shop_by_style_sub")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(featuredStyles.length > 0
          ? featuredStyles.map((s) => ({
              label: styleDisplayName(s) || s.styleCode,
              href: `/family/${encodeURIComponent(s.styleCode)}`,
              image: s.roomSceneImageUrl as string,
              blurb: [s.doorStyle, s.woodSpecies].filter(Boolean).join(" · ") || t("cat_blurb_fallback"),
            }))
          : DOOR_STYLE_TILES.map((t) => ({
              label: t.label,
              href: "/styles",
              image: t.image,
              blurb: t.blurb,
            }))
        ).map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="group relative h-52 overflow-hidden rounded-2xl border border-border text-left transition-transform duration-200 hover:-translate-y-0.5 block"
          >
            <img
              src={tile.image}
              alt={`${tile.label} kitchen room scene`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl font-bold text-white">{tile.label}</h3>
                <ChevronRight className="h-5 w-5 text-white/80 group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-white/80 text-xs mt-1 line-clamp-2">{tile.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Category filter pills ─────────────────────────────────────────────────────

const CATEGORY_ORDER = ["base", "wall", "corner", "tall", "ada", "vanity", "accessories"];
const CATEGORY_LABELS: Record<string, string> = {
  base: "Base",
  wall: "Wall",
  corner: "Corner",
  tall: "Tall / Pantry",
  ada: "ADA",
  vanity: "Vanity",
  accessories: "Accessories",
  accessory: "Accessories",
};

function CategoryFilterBar({
  activeCategory,
  activeSubCategory,
  onCategoryChange,
  onSubCategoryChange,
  styleId,
}: {
  activeCategory: string | null;
  activeSubCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  onSubCategoryChange: (sub: string | null) => void;
  styleId: number | null;
}) {
  const { data: allCategories } = trpc.cabinets.categories.useQuery();
  const { data: subCategories } = trpc.cabinets.subCategories.useQuery(
    { category: activeCategory! },
    { enabled: !!activeCategory }
  );

  const sortedCategories = useMemo(() => {
    if (!allCategories) return [];
    return [...allCategories].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf((a || "").toLowerCase());
      const ib = CATEGORY_ORDER.indexOf((b || "").toLowerCase());
      if (ia === -1 && ib === -1) return (a || "").localeCompare(b || "");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [allCategories]);

  return (
    <div className="mb-5 space-y-3">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1 flex items-center gap-1">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Type
        </span>
        <button
          onClick={() => { onCategoryChange(null); onSubCategoryChange(null); }}
          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
            activeCategory === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          All
        </button>
        {sortedCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              onCategoryChange(activeCategory === cat ? null : cat);
              onSubCategoryChange(null);
            }}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            {CATEGORY_LABELS[(cat || "").toLowerCase()] || cat}
          </button>
        ))}
      </div>

      {/* Sub-category pills (only when a category is selected and subs exist) */}
      {activeCategory && subCategories && subCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center pl-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">
            Sub-type
          </span>
          <button
            onClick={() => onSubCategoryChange(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeSubCategory === null
                ? "bg-secondary text-secondary-foreground border-secondary"
                : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            All
          </button>
          {subCategories.map((sub) => (
            <button
              key={sub}
              onClick={() => onSubCategoryChange(activeSubCategory === sub ? null : sub)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeSubCategory === sub
                  ? "bg-secondary text-secondary-foreground border-secondary"
                  : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category drill-in (cabinets grid) ────────────────────────────────────────

function CategoryView({
  category: initialCategoryProp,
  search,
  onBack,
  onSearchChange,
}: {
  category: string | null;
  search: string;
  onBack: () => void;
  onSearchChange: (term: string) => void;
}) {
  const { t } = useLanguage();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [offset, setOffset] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategoryProp);
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);

  const initialStyle = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("style");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [styleId, setStyleId] = useState<number | null>(initialStyle);
  const LIMIT = 48;

  const { data: styles } = trpc.doorStyles.list.useQuery();
  const styleOptions = useMemo(() => {
    type S = { id: number; styleCode: string; ourName: string | null; aliasName?: string | null };
    return ((styles ?? []) as S[])
      .map((s) => ({ id: s.id, label: styleDisplayName(s) || s.styleCode }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [styles]);
  const selectedStyleLabel = styleOptions.find((s) => s.id === styleId)?.label ?? null;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [activeCategory, activeSubCategory, debouncedSearch, styleId]);

  // Sync category prop changes (e.g. from URL)
  useEffect(() => {
    setActiveCategory(initialCategoryProp);
    setActiveSubCategory(null);
  }, [initialCategoryProp]);

  const { data, isLoading } = trpc.cabinets.listForStyle.useQuery(
    {
      styleId: styleId ?? 0,
      category: activeCategory ?? undefined,
      subCategory: activeSubCategory ?? undefined,
      search: debouncedSearch || undefined,
      limit: LIMIT,
      offset,
    },
    { enabled: styleId != null }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const activeFilterCount = [activeCategory, activeSubCategory, debouncedSearch].filter(Boolean).length;

  const clearAllFilters = () => {
    setActiveCategory(null);
    setActiveSubCategory(null);
    onSearchChange("");
  };

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("cat_all_categories")}
      </button>

      {activeCategory && (
        <div className="relative overflow-hidden rounded-xl border border-border mb-6 h-28">
          <img
            src={tileFor(activeCategory).image}
            alt={`${activeCategory} cabinets`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/90 to-transparent" />
          <div className="relative px-6 py-5">
            <h1 className="font-serif text-2xl font-bold text-white">{CATEGORY_LABELS[activeCategory.toLowerCase()] || activeCategory}</h1>
            <p className="text-white/80 text-xs mt-0.5">{tileFor(activeCategory).blurb}</p>
          </div>
        </div>
      )}

      {!activeCategory && (
        <h1 className="font-serif text-2xl font-bold text-foreground mb-4">
          {debouncedSearch ? `${t("cat_results_for")} "${debouncedSearch}"` : t("cat_all_cabinets")}
        </h1>
      )}

      {/* Door style selector */}
      <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4">
        <label className="block text-sm font-semibold text-foreground mb-2">
          {t("cat_door_style_label")}
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          {t("cat_door_style_help")}
        </p>
        <select
          value={styleId ?? ""}
          onChange={(e) => setStyleId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t("cat_select_style_option")}</option>
          {styleOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {selectedStyleLabel && (
          <p className="text-xs text-muted-foreground mt-2">
            {t("cat_showing_in")}{" "}
            <span className="font-medium text-foreground">{selectedStyleLabel}</span>.
          </p>
        )}
      </div>

      {/* Search + filters (only meaningful once a style is selected) */}
      {styleId != null && (
        <>
          {/* Sticky search + category bar */}
          <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 pt-3 pb-3 mb-4 shadow-sm">
            {/* Search bar */}
            <div className="relative mb-3 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by SKU code or description (e.g. B30, sink base, drawer)"
                className="pl-9 pr-9"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <CategoryFilterBar
              activeCategory={activeCategory}
              activeSubCategory={activeSubCategory}
              onCategoryChange={setActiveCategory}
              onSubCategoryChange={setActiveSubCategory}
              styleId={styleId}
            />
          </div>

          {/* Active filter summary */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {debouncedSearch && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  Search: "{debouncedSearch}"
                  <button onClick={() => onSearchChange("")} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {activeCategory && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {CATEGORY_LABELS[activeCategory.toLowerCase()] || activeCategory}
                  <button onClick={() => { setActiveCategory(null); setActiveSubCategory(null); }} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {activeSubCategory && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {activeSubCategory}
                  <button onClick={() => setActiveSubCategory(null)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {total} {t("cat_results_count")}
              </span>
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </>
      )}

      {/* Prompt to choose a style */}
      {styleId == null ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t("cat_choose_style_title")}</p>
          <p className="text-sm mt-1">{t("cat_choose_style_sub")}</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <Skeleton className="h-36 w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("cat_none_title")}</p>
              <p className="text-sm mt-1">{t("cat_none_sub")}</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((cabinet) => (
                <CabinetCard key={cabinet.id} cabinet={cabinet as CabinetItem} styleId={styleId} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {t("cat_page")} {currentPage} {t("cat_page_of")} {totalPages} · {total} {t("cat_items")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              {t("cat_prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              {t("cat_next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Catalog page ────────────────────────────────────────────────────────

export default function Catalog() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_catalog_t"), description: t("seo_catalog_d"), lang });
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(searchStr);
  const initialCategory = params.get("category");

  const [category, setCategory] = useState<string | null>(initialCategory);
  const [showResults, setShowResults] = useState<boolean>(!!initialCategory);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const cat = new URLSearchParams(searchStr).get("category");
    if (cat) {
      setCategory(cat);
      setShowResults(true);
    }
  }, [searchStr]);

  const goToCategory = (cat: string) => {
    setCategory(cat);
    setSearch("");
    setShowResults(true);
    navigate(`/catalog?category=${encodeURIComponent(cat)}`);
  };

  const goToSearch = (term: string) => {
    setCategory(null);
    setSearch(term);
    setShowResults(true);
    navigate(`/catalog`);
  };

  const backToLanding = () => {
    setCategory(null);
    setSearch("");
    setShowResults(false);
    navigate(`/catalog`);
  };

  return (
    <div className="container py-8">
      {showResults ? (
        <CategoryView
          category={category}
          search={search}
          onBack={backToLanding}
          onSearchChange={setSearch}
        />
      ) : (
        <CategoryLanding onSearch={goToSearch} />
      )}
    </div>
  );
}
