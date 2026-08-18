import { useState, useEffect, useMemo } from "react";
// (useMemo used for featured door-style families)
import { Link, useSearch, useLocation } from "wouter";
import { Search, Filter, ChevronRight, ChevronLeft, Package, Store } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { styleDisplayName } from "@/lib/styleDisplayName";
import { CabinetImage } from "@/components/CabinetImage";
import { type CabinetLike, cabinetTypeLabel } from "@/lib/cabinetGraphics";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { translateSpec } from "@/lib/i18n/specPhrases";

// ─── Category presentation config ──────────────────────────────────────────────
// Maps DB category values to a room-scene image + short description. Categories
// not listed here still appear (using a neutral fallback), so the catalog stays
// in sync with the database even if new categories are added.

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
  Accessory: {
    match: (c) => c === "accessory",
    image: "/manus-storage/cat-accessory_c93204c0.jpg",
    blurb: "Crown molding, fillers, end panels, shelves and trim.",
  },
};

function tileFor(category: string): CategoryTile {
  const lc = category.toLowerCase();
  for (const key of Object.keys(CATEGORY_TILES)) {
    if (CATEGORY_TILES[key].match(lc)) return CATEGORY_TILES[key];
  }
  return {
    match: () => false,
    image: HERO_IMAGE,
    blurb: "Browse cabinets in this category.",
  };
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

function CabinetCard({ cabinet, styleId, distributorLabel }: { cabinet: CabinetItem; styleId?: number | null; distributorLabel?: string | null }) {
  const { t, lang } = useLanguage();
  const href = styleId
    ? `/catalog/${cabinet.masterCode}?style=${styleId}`
    : `/catalog/${cabinet.masterCode}`;
  return (
    <Link href={href}>
      <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/30 cursor-pointer overflow-hidden transition-colors">
        {/* Every item shows its accurate, to-scale drawing so the picture always
            matches the real item type (drawer base draws drawers, sink base shows
            the sink cutout, glass walls show glass, corners show the L-shape). */}
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

          {distributorLabel && (
            <div className="mt-2 flex items-center gap-1">
              <Store className="h-3 w-3 text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded truncate">{distributorLabel}</span>
            </div>
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

// ─── Category landing (tiles) ───────────────────────────────────────────────────

function CategoryLanding({
  onSearch,
}: {
  onSearch: (term: string) => void;
}) {
  const { t } = useLanguage();
  const [term, setTerm] = useState("");

  // Pull real door styles so the "Shop by Door Style" tiles each link into that
  // family's full catalog (/family/:styleCode), not a generic list page.
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
    // Only feature styles that have a REAL verified room-scene photo, so every
    // tile shows the style's own name-matched scene (never a guessed bucket).
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

      {/* Shop by Door Style — the catalog is organized by door style, not Base/Wall/Tall categories */}
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

      {featuredStyles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featuredStyles.map((s) => ({
            // Prefer aliasName (CD_STANDARDS white-label), then the authored
            // feature label and code. No generic family or finish name is added.
            label: styleDisplayName(s) || s.featuredLabel || s.styleCode,
            href: `/family/${encodeURIComponent(s.styleCode)}`,
            // A tile is allowed only when the supplied record includes this
            // style's actual room scene—never a stock substitute.
            image: s.roomSceneImageUrl as string,
            blurb: [s.doorStyle, s.woodSpecies].filter(Boolean).join(" · ") || null,
          })).map((tile) => (
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
              {tile.blurb && <p className="text-white/80 text-xs mt-1 line-clamp-2">{tile.blurb}</p>}
            </div>
          </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-8 text-sm text-muted-foreground">
          Feature styles appear here after their Cabinet Config information and verified room scene are provided.
        </div>
      )}

      {/* Cabinet types are intentionally not shown here. Customers choose a
          door-style family first; the family page then exposes contextual Base,
          Wall, Tall, Vanity, and accessory filters for that selected line. */}
    </div>
  );
}

// ─── Category drill-in (cabinets grid) ──────────────────────────────────────────

function CategoryView({
  category,
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
  // Cabinet availability is per door style: the shopper must pick a style
  // before any cabinets are shown, so the catalog matches the Design Tool.
  // A ?style=<id> URL param preselects it (deep-linking from a style page).
  const initialStyle = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("style");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [styleId, setStyleId] = useState<number | null>(initialStyle);
  const LIMIT = 48;

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: styles } = trpc.doorStyles.list.useQuery();
  const { data: distributorsList } = trpc.distributors.list.useQuery();

  // Build a map from distributorId → display name (admin only)
  const distributorMap = useMemo(() => {
    if (!isAdmin || !distributorsList) return new Map<number, string>();
    return new Map(distributorsList.map((d) => [d.id, d.name]));
  }, [isAdmin, distributorsList]);

  // Build a map from styleId → distributorId
  const styleDistMap = useMemo(() => {
    type S = { id: number; distributorId?: number | null };
    const map = new Map<number, number>();
    for (const s of (styles ?? []) as S[]) {
      if (s.distributorId) map.set(s.id, s.distributorId);
    }
    return map;
  }, [styles]);

  const styleOptions = useMemo(() => {
    type S = { id: number; styleCode: string; ourName: string | null; aliasName?: string | null };
    return ((styles ?? []) as S[])
      .map((s) => ({ id: s.id, label: styleDisplayName(s) || s.styleCode }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [styles]);
  const selectedStyleLabel =
    styleOptions.find((s) => s.id === styleId)?.label ?? null;

  // Resolve the distributor label for the currently selected style (admin only)
  const selectedDistributorLabel = useMemo(() => {
    if (!isAdmin || !styleId) return null;
    const distId = styleDistMap.get(styleId);
    return distId ? (distributorMap.get(distId) ?? null) : null;
  }, [isAdmin, styleId, styleDistMap, distributorMap]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [category, debouncedSearch, styleId]);

  const { data, isLoading } = trpc.cabinets.listForStyle.useQuery(
    {
      styleId: styleId ?? 0,
      category: category ?? undefined,
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

  const heading = category ?? (debouncedSearch ? `${t("cat_results_for")} "${debouncedSearch}"` : t("cat_all_cabinets"));

  return (
    <div>
      {/* Back + heading */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("cat_all_categories")}
      </button>

      {category && (
        <div className="relative overflow-hidden rounded-xl border border-border mb-6 h-28">
          <img
            src={tileFor(category).image}
            alt={`${category} cabinets`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/90 to-transparent" />
          <div className="relative px-6 py-5">
            <h1 className="font-serif text-2xl font-bold text-white">{category}</h1>
            <p className="text-white/80 text-xs mt-0.5">{tileFor(category).blurb}</p>
          </div>
        </div>
      )}

      {!category && (
        <h1 className="font-serif text-2xl font-bold text-foreground mb-4">{heading}</h1>
      )}

      {/* Door style selector — availability is per door style, so the shopper
          must choose a style before any cabinets are shown. */}
      <div className="mb-6 rounded-xl border border-border bg-muted/30 p-4">
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

      {/* Search (only meaningful once a style is selected) */}
      {styleId != null && (
        <div className="relative mb-6 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("cat_search_within")}
            className="pl-9"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {/* Active filters */}
      {debouncedSearch && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="secondary" className="gap-1">
            "{debouncedSearch}"
            <button onClick={() => onSearchChange("")} className="ml-1 hover:text-destructive">
              ×
            </button>
          </Badge>
          <span className="text-xs text-muted-foreground">{total} {t("cat_results_count")}</span>
        </div>
      )}

      {/* Prompt to choose a style before any grid renders */}
      {styleId == null ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t("cat_choose_style_title")}</p>
          <p className="text-sm mt-1">
            {t("cat_choose_style_sub")}
          </p>
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
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((cabinet) => (
            <CabinetCard key={cabinet.id} cabinet={cabinet as CabinetItem} styleId={styleId} distributorLabel={selectedDistributorLabel} />
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

  // null = show landing tiles; string = show that category; "" sentinel handled via state
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [showResults, setShowResults] = useState<boolean>(!!initialCategory);
  const [search, setSearch] = useState("");

  // Keep state in sync if the URL ?category= changes (e.g. from a breadcrumb link).
  useEffect(() => {
    const cat = new URLSearchParams(searchStr).get("category");
    if (cat) {
      setCategory(cat);
      setShowResults(true);
    }
  }, [searchStr]);

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
