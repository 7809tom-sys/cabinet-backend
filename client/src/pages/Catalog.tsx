import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { Search, Filter, ChevronRight, ChevronLeft, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { type CabinetLike } from "@/lib/cabinetGraphics";
import { cabinetProductPhoto, KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";

// Door-style tiles for the catalog landing — the shop is organized by door style,
// not Base/Wall/Tall categories. Each links into the full Door Styles experience.
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

function CabinetCard({ cabinet }: { cabinet: CabinetItem }) {
  const productPhoto = cabinetProductPhoto({
    category: cabinet.category,
    doorStyle: (cabinet as { doorStyle?: string | null }).doorStyle ?? null,
  });
  return (
    <Link href={`/catalog/${cabinet.masterCode}`}>
      <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/30 cursor-pointer overflow-hidden transition-colors">
        {/* Dimensional 3D product render */}
        <div className="relative h-44 bg-gradient-to-b from-white to-muted/30 flex items-center justify-center border-b border-border p-3">
          <img
            src={productPhoto}
            alt={cabinet.description ?? `${cabinet.masterCode} cabinet`}
            loading="lazy"
            className="h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {/* To-scale drawing as a small corner badge */}
          <div className="absolute bottom-2 right-2 h-10 w-10 rounded-md border border-border bg-white/90 backdrop-blur p-1 shadow-sm" title="Drawn to scale">
            <CabinetDrawing cabinet={cabinet} className="h-full w-full" />
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {cabinet.masterCode}
            </span>
            {cabinet.subCategory && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {cabinet.subCategory}
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium text-foreground mt-2 leading-snug line-clamp-2">
            {cabinet.description}
          </p>

          {(cabinet.width || cabinet.height || cabinet.depth) && (
            <p className="text-xs text-muted-foreground mt-2">
              {[
                cabinet.width && `W: ${cabinet.width}"`,
                cabinet.height && `H: ${cabinet.height}"`,
                cabinet.depth && `D: ${cabinet.depth}"`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">View pricing →</span>
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
  const [term, setTerm] = useState("");

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
            Browse the Cabinet Catalog
          </h1>
          <p className="text-white/85 text-sm md:text-base mb-6">
            Choose your door style, then explore every cabinet in that finish —
            with member trade pricing built in.
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
              placeholder="Search by code or description..."
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
          Shop by Door Style
        </h2>
        <Link
          href="/styles"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          View all door styles <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Pick the look you want — every cabinet is available in each finish, with trade pricing built in.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {DOOR_STYLE_TILES.map((tile) => (
          <Link
            key={tile.label}
            href="/styles"
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
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [offset, setOffset] = useState(0);
  const LIMIT = 48;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [category, debouncedSearch]);

  const { data, isLoading } = trpc.cabinets.list.useQuery({
    category: category ?? undefined,
    search: debouncedSearch || undefined,
    limit: LIMIT,
    offset,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const heading = category ?? (debouncedSearch ? `Results for "${debouncedSearch}"` : "All Cabinets");

  return (
    <div>
      {/* Back + heading */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All categories
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

      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search within results..."
          className="pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

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
          <span className="text-xs text-muted-foreground">{total} results</span>
        </div>
      )}

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
          <p className="font-medium">No cabinets found</p>
          <p className="text-sm mt-1">Try adjusting your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((cabinet) => (
            <CabinetCard key={cabinet.id} cabinet={cabinet as CabinetItem} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} · {total} items
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Catalog page ────────────────────────────────────────────────────────

export default function Catalog() {
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
