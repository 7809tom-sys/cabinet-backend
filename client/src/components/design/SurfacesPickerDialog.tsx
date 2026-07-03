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
import { Search, Plus, Check, Waves } from "lucide-react";

export type SelectedSurface = {
  id: number;
  slug: string;
  name: string;
  category: string;
  subCategory?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  sellPrice: number | null;
};

const PAGE_LIMIT = 60;

export function SurfacesPickerDialog({
  open,
  onOpenChange,
  selected,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: SelectedSurface[];
  onToggle: (item: SelectedSurface) => void;
}) {
  const [category, setCategory] = useState<PelicanCategory>(PELICAN_STOREFRONT_CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

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
    if (availableCats.length && !availableCats.includes(category)) {
      setCategory(availableCats[0]);
    }
  }, [availableCats, category]);

  const { data, isLoading } = trpc.pelican.byCategory.useQuery(
    {
      category: category as any,
      scope: "designer",
      search: debounced || undefined,
      limit: PAGE_LIMIT,
      offset: 0,
    },
    { enabled: open }
  );

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const items = data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-[var(--color-gold)]" /> Surfaces & Fixtures
          </DialogTitle>
          <DialogDescription>
            Add Pelican finishes to this design. Selected items are saved with the design and
            carried into your quote. Prices reflect current trade pricing.
          </DialogDescription>
        </DialogHeader>

        {/* Category tabs + search */}
        <div className="flex flex-col gap-3 border-b border-border px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {availableCats.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={c === category ? "default" : "outline"}
                className="h-7 text-xs"
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
              placeholder={`Search ${category.toLowerCase()}…`}
              className="pl-9"
            />
          </div>
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 w-full rounded-lg" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No {category.toLowerCase()} items match your search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {items.map((p: any) => {
                  const isSel = selectedIds.has(p.id);
                  const gradient =
                    CATEGORY_GRADIENT[p.category] ?? "linear-gradient(135deg,#e5e7eb,#cbd5e1)";
                  const item: SelectedSurface = {
                    id: p.id,
                    slug: p.slug,
                    name: p.name,
                    category: p.category,
                    subCategory: p.subCategory,
                    size: p.size,
                    imageUrl: p.imageUrl,
                    sellPrice: p.sellPrice,
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
