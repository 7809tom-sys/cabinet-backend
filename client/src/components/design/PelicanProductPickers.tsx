/**
 * PelicanCountertopPicker & PelicanSinkPicker
 *
 * Compact product grids that fetch real Pelican products via tRPC and let the
 * user select one. Replaces the old generic COUNTERTOP_MATERIALS dropdown and
 * SINK_PRESETS buttons in the Design Tool's right panel.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@/lib/pelican";
import { verifiedPelicanSinkProfile } from "@/lib/pelicanFixtureProfiles";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Plus, ChevronRight, Waves } from "lucide-react";
import type { SelectedSurface } from "./SurfacesPickerDialog";

export type RecItem = {
  id: number;
  pelicanCode?: string | null;
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
    pelicanCode: p.pelicanCode,
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

/**
 * Keep farmhouse/apron-front sink choices isolated from ordinary sink bases.
 * Only source-verified physical profiles are eligible for the Designer guide.
 */
export function compatibleFarmhouseSinkOptions(products: RecItem[], openingWidthIn: number): RecItem[] {
  return products.filter((product) => {
    const profile = verifiedPelicanSinkProfile(product.pelicanCode);
    return Boolean(
      profile
      && profile.sinkType === "farmhouse"
      && profile.minimumCabinetWidthIn <= openingWidthIn,
    );
  });
}

export function FarmhouseSinkSelectionGuide({
  baseCode,
  openingWidthIn,
  products,
  isLoading,
  onSelect,
  onBrowseAll,
}: {
  baseCode: string;
  openingWidthIn: number;
  products: RecItem[];
  isLoading: boolean;
  onSelect: (item: SelectedSurface) => void;
  onBrowseAll: () => void;
}) {
  const items = useMemo(
    () => compatibleFarmhouseSinkOptions(products, openingWidthIn).slice(0, 6),
    [products, openingWidthIn],
  );

  return (
    <section data-testid="farmhouse-sink-selection-guide" className="mt-4 overflow-hidden rounded-lg border border-[#8fb7d7] bg-[#f4f9fd]">
      <div className="border-b border-[#c8deef] px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Waves className="mt-0.5 h-4 w-4 shrink-0 text-[#276b9b]" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-[#173a56]">Sink Selection Guide</h3>
            <p className="mt-0.5 text-[11px] leading-snug text-[#355f7b]">
              {baseCode} is a farmhouse / apron-front sink base. Only source-verified apron-front sinks that fit this {openingWidthIn}&quot; base opening can be selected.
            </p>
          </div>
        </div>
      </div>
      <div className="p-2.5">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : items.length > 0 ? (
          <>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#4a718a]">Compatible verified farmhouse sinks</p>
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => <ProductCard key={item.id} item={item} isSelected={false} onSelect={onSelect} />)}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-[#4a718a]">Choose a sink first, then select a matching faucet or finish without one.</p>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-[#9ec0d8] bg-white/70 px-3 py-3 text-center">
            <p className="text-[11px] font-semibold text-[#244b67]">No verified farmhouse sinks are currently linked to this base.</p>
            <p className="mt-1 text-[10px] leading-snug text-[#55758c]">This prevents an unverified or standard sink from being shown on an apron-front base.</p>
            <button type="button" onClick={onBrowseAll} className="mt-2 text-[11px] font-semibold text-[#276b9b] underline underline-offset-2">Browse sink catalog</button>
          </div>
        )}
      </div>
    </section>
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
  const [expanded, setExpanded] = useState(false);
  const selectedSummary = selectedSurfaces.length === 0
    ? "Choose a countertop"
    : selectedSurfaces.length === 1
      ? selectedSurfaces[0].name
      : `${selectedSurfaces.length} countertops selected`;

  return (
    <div className="overflow-hidden rounded-lg border border-[#d9c196]/70 bg-[#fffdf9]">
      <div className="flex min-h-12 items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="countertop-material-options"
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#fbf5e8]"
        >
          <Waves className="h-4 w-4 shrink-0 text-[#a87f33]" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">Countertop choices</span>
            <span className="block truncate text-[10px] text-muted-foreground">{selectedSummary}</span>
          </span>
          <ChevronRight className={`h-4 w-4 shrink-0 text-[#8a6828] transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onBrowseAll}
          className="shrink-0 border-l border-[#d9c196]/70 px-2 text-[10px] font-semibold text-[#8a6828] transition-colors hover:bg-[#f7edd9]"
        >
          Browse all
        </button>
      </div>
      {expanded && (
        <div id="countertop-material-options" className="border-t border-[#d9c196]/70 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pelican Quartz Slabs</span>
            <span className="text-[10px] text-muted-foreground">Tap to select</span>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
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
              {items.map((p) => <ProductCard key={p.id} item={p} isSelected={selectedIds.has(p.id)} onSelect={onSelect} />)}
            </div>
          )}
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
  const items = useMemo(
    () => ((data ?? []) as RecItem[]).filter((item) => Boolean(verifiedPelicanSinkProfile(item.pelicanCode))),
    [data],
  );
  const selectedIds = useMemo(() => new Set(selectedSurfaces.map((s) => s.id)), [selectedSurfaces]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Verified Pelican Sinks
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
