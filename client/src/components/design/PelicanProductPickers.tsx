/**
 * PelicanCountertopPicker & PelicanSinkPicker
 *
 * Compact product grids that fetch real Pelican products via tRPC and let the
 * user select one. Replaces the old generic COUNTERTOP_MATERIALS dropdown and
 * SINK_PRESETS buttons in the Design Tool's right panel.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@/lib/pelican";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Plus, ChevronRight, Waves } from "lucide-react";
import type { SelectedSurface } from "./SurfacesPickerDialog";

type RecItem = {
  id: number;
  slug: string;
  name: string;
  category: string;
  subCategory: string | null;
  size: string | null;
  imageUrl: string | null;
  sellPrice: number | null;
};

function toSurface(p: RecItem): SelectedSurface {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    subCategory: p.subCategory,
    size: p.size,
    imageUrl: p.imageUrl,
    sellPrice: p.sellPrice,
  };
}

function ProductCard({
  item,
  isSelected,
  onSelect,
}: {
  item: RecItem;
  isSelected: boolean;
  onSelect: (item: SelectedSurface) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(toSurface(item))}
      className={`group overflow-hidden rounded-lg border text-left transition-colors ${
        isSelected
          ? "border-[#a87f33] ring-1 ring-[#a87f33]/40 bg-[#a87f33]/5"
          : "border-border hover:border-[#a87f33]/50 hover:bg-muted/40"
      }`}
    >
      <div className="relative aspect-[4/3] w-full bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Waves className="h-5 w-5" />
          </div>
        )}
        <div
          className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white transition-colors ${
            isSelected ? "bg-[#a87f33]" : "bg-black/35 group-hover:bg-black/55"
          }`}
        >
          {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </div>
      </div>
      <div className="space-y-0.5 p-1.5">
        <div className="line-clamp-2 min-h-[1.9rem] text-[11px] font-semibold leading-snug text-foreground">
          {item.name}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#1a2744] dark:text-foreground">
            {formatPrice(item.sellPrice)}
          </span>
          {item.size && (
            <span className="truncate pl-1 text-[9px] text-muted-foreground">
              {item.size}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function PelicanCountertopPicker({
  selectedSurfaces,
  onSelect,
  onBrowseAll,
}: {
  selectedSurfaces: SelectedSurface[];
  onSelect: (item: SelectedSurface) => void;
  onBrowseAll: () => void;
}) {
  const { data, isLoading } = trpc.surfaces.recommended.useQuery({ role: "countertop", limit: 8 });
  const items = (data ?? []) as RecItem[];
  const selectedIds = useMemo(() => new Set(selectedSurfaces.map((s) => s.id)), [selectedSurfaces]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pelican Quartz Slabs
        </span>
        <button
          type="button"
          onClick={onBrowseAll}
          className="flex items-center gap-0.5 text-[10px] font-medium text-[#a87f33] hover:text-[#8a6828] transition-colors"
        >
          Browse all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={onBrowseAll}
          className="w-full rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground hover:border-[#a87f33]/50 hover:text-foreground transition-colors"
        >
          No countertops available — browse the full catalog
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              item={p}
              isSelected={selectedIds.has(p.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PelicanSinkPicker({
  selectedSurfaces,
  onSelect,
  onBrowseAll,
}: {
  selectedSurfaces: SelectedSurface[];
  onSelect: (item: SelectedSurface) => void;
  onBrowseAll: () => void;
}) {
  const { data, isLoading } = trpc.surfaces.recommended.useQuery({ role: "sink", limit: 8 });
  const items = (data ?? []) as RecItem[];
  const selectedIds = useMemo(() => new Set(selectedSurfaces.map((s) => s.id)), [selectedSurfaces]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          StoneCreek Sinks
        </span>
        <button
          type="button"
          onClick={onBrowseAll}
          className="flex items-center gap-0.5 text-[10px] font-medium text-[#a87f33] hover:text-[#8a6828] transition-colors"
        >
          Browse all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={onBrowseAll}
          className="w-full rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground hover:border-[#a87f33]/50 hover:text-foreground transition-colors"
        >
          No sinks available — browse the full catalog
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              item={p}
              isSelected={selectedIds.has(p.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
