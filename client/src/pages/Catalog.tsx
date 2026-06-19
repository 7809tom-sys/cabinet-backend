import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Search, Filter, ChevronRight, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

// ─── Category sidebar ─────────────────────────────────────────────────────────

function CategorySidebar({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (cat: string | null) => void;
}) {
  const { data: categories } = trpc.cabinets.categories.useQuery();

  return (
    <div className="w-48 shrink-0">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Categories
      </div>
      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => onSelect(null)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              selected === null
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground/70 hover:text-foreground hover:bg-muted"
            }`}
          >
            All Cabinets
          </button>
        </li>
        {categories?.map((cat) => (
          <li key={cat}>
            <button
              onClick={() => onSelect(cat!)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selected === cat
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              }`}
            >
              {cat}
            </button>
          </li>
        ))}
        {!categories && (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i}>
                <Skeleton className="h-8 w-full rounded-md" />
              </li>
            ))}
          </>
        )}
      </ul>
    </div>
  );
}

// ─── Cabinet card ─────────────────────────────────────────────────────────────

interface CabinetItem {
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
  return (
    <Link href={`/catalog/${cabinet.masterCode}`}>
      <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/30 cursor-pointer overflow-hidden">
        {/* Image placeholder */}
        <div className="h-36 bg-muted/50 flex items-center justify-center border-b border-border">
          <Package className="h-12 w-12 text-muted-foreground/30" />
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
              {[cabinet.width && `W: ${cabinet.width}"`, cabinet.height && `H: ${cabinet.height}"`, cabinet.depth && `D: ${cabinet.depth}"`]
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

// ─── Main Catalog page ────────────────────────────────────────────────────────

export default function Catalog() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialCategory = params.get("category") || null;

  const [category, setCategory] = useState<string | null>(initialCategory);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 48;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset offset on filter change
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

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
          Cabinet Catalog
        </h1>
        <p className="text-muted-foreground text-sm">
          {total > 0 ? `${total.toLocaleString()} items` : "Loading..."} across all distributors
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by code or description..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <CategorySidebar selected={category} onSelect={setCategory} />

        {/* Grid */}
        <div className="flex-1 min-w-0">
          {/* Active filters */}
          {(category || debouncedSearch) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {category && (
                <Badge variant="secondary" className="gap-1">
                  {category}
                  <button onClick={() => setCategory(null)} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {debouncedSearch && (
                <Badge variant="secondary" className="gap-1">
                  "{debouncedSearch}"
                  <button onClick={() => setSearch("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
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
              <p className="text-sm mt-1">Try adjusting your search or category filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((cabinet) => (
                <CabinetCard key={cabinet.id} cabinet={cabinet} />
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
      </div>
    </div>
  );
}
