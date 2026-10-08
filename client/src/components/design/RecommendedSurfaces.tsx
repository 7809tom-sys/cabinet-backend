import { useMemo } from "react";
import { verifiedPelicanBathroomFixtureProfile, pelicanBathroomFixturePlacementText } from "@/lib/pelicanBathroomFixtureProfiles";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@/lib/pelican";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Plus, ChevronRight, Waves } from "lucide-react";
import type { SelectedSurface } from "./SurfacesPickerDialog";

/**
 * A recommended-surface "role" the Design Tool exposes as its own palette
 * section. Each maps to a real Pelican storefront category (and subCategory
 * where a category is shared, e.g. Sinks & Faucets). Kept in sync with the
 * server-side `surfaces.recommended` roleFilter.
 */
export type RecommendedRole =
  | "flooring"
  | "backsplash"
  | "countertop"
  | "sink"
  | "faucet"
  | "bathroom-sink"
  | "bathroom-faucet"
  | "toilet-bidet"
  | "bathtub"
  | "shower-door"
  | "shower-surround"
  | "shower-system"
  | "bathroom-accessory";

export const RECOMMENDED_SECTIONS: {
  role: RecommendedRole;
  label: string;
  blurb: string;
}[] = [
  { role: "flooring", label: "Flooring", blurb: "Pelican planks & flooring" },
  { role: "backsplash", label: "Backsplash", blurb: "Pelican tile & mosaic" },
  { role: "countertop", label: "Countertop", blurb: "Pelican quartz slabs" },
  { role: "sink", label: "Sink", blurb: "StoneCreek sinks" },
  { role: "faucet", label: "Faucet", blurb: "StoneCreek faucets" },
];

/**
 * Bathroom finishes are deliberately separate from bathroom fixtures. A bathroom
 * plan can therefore choose its counter, floor and wall tile without putting a
 * toilet or faucet in the "Surfaces" tab.
 */
export const BATHROOM_SURFACE_RECOMMENDED_SECTIONS: {
  role: RecommendedRole;
  label: string;
  blurb: string;
}[] = [
  { role: "countertop", label: "Countertops", blurb: "Pelican quartz vanity & counter surfaces" },
  { role: "flooring", label: "Flooring", blurb: "Pelican flooring for the bathroom floor" },
  { role: "backsplash", label: "Wall Tile", blurb: "Pelican wall tile & mosaic" },
];

/** Bathroom fixtures intentionally never share kitchen sink or faucet roles. */
export const BATHROOM_FIXTURE_RECOMMENDED_SECTIONS: {
  role: RecommendedRole;
  label: string;
  blurb: string;
}[] = [
  { role: "bathroom-sink", label: "Vanity Sinks", blurb: "Pelican bath basins & vanity tops" },
  { role: "bathroom-faucet", label: "Vanity & Tub Faucets", blurb: "Pelican bathroom faucet lines" },
  { role: "toilet-bidet", label: "Toilets & Bidets", blurb: "Pelican toilet and bidet fixtures" },
  { role: "bathtub", label: "Bathtubs", blurb: "Pelican acrylic soaking & skirted tubs" },
  { role: "shower-door", label: "Shower & Tub Doors", blurb: "Pelican enclosure doors" },
  { role: "shower-surround", label: "Shower Walls", blurb: "Pelican shower wall systems" },
  { role: "shower-system", label: "Shower Systems", blurb: "Pelican valves & systems" },
  { role: "bathroom-accessory", label: "Other Bathroom Accessories", blurb: "Pelican bath & shower accessory lines" },
];

/** Backward-compatible alias for callers that previously requested all bathroom cards. */
export const BATHROOM_RECOMMENDED_SECTIONS = BATHROOM_FIXTURE_RECOMMENDED_SECTIONS;

export type BathroomPaletteMode = "surfaces" | "fixtures";

type RecItem = {
  id: number;
  pelicanCode?: string | null;
  slug: string;
  name: string;
  category: string;
  subCategory: string | null;
  size: string | null;
  imageUrl: string | null;
  materialImageUrl: string | null;
  sellPrice: number | null;
};

function toSurface(p: RecItem): SelectedSurface {
  return {
    id: p.id,
    pelicanCode: p.pelicanCode ?? null,
    slug: p.slug,
    name: p.name,
    category: p.category,
    subCategory: p.subCategory,
    size: p.size,
    imageUrl: p.imageUrl,
    materialImageUrl: p.materialImageUrl,
    sellPrice: p.sellPrice,
  };
}

/** One role's recommended row: a short, curated grid of real Pelican products. */
function RecommendedRow({
  role,
  label,
  blurb,
  limit,
  selectedIds,
  onToggle,
  onBrowseAll,
  onPlaceBathroomFixture,
}: {
  role: RecommendedRole;
  label: string;
  blurb: string;
  limit: number;
  selectedIds: Set<number>;
  onToggle: (item: SelectedSurface, role: RecommendedRole) => void;
  onBrowseAll: (role: RecommendedRole) => void;
  onPlaceBathroomFixture?: (item: SelectedSurface) => void;
}) {
  const { data, isLoading } = trpc.surfaces.recommended.useQuery({ role, limit });
  const items = (data ?? []) as RecItem[];

  return (
    <div className="space-y-1.5">
      <div className="sticky top-0 z-10 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] font-normal normal-case text-muted-foreground/70">
          · {blurb}
        </span>
        <button
          type="button"
          onClick={() => onBrowseAll(role)}
          className="ml-auto flex items-center gap-0.5 rounded px-1 text-[10px] font-medium text-[#a87f33] hover:text-[#8a6828] transition-colors"
        >
          Browse all <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => onBrowseAll(role)}
          className="w-full rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground hover:border-[#a87f33]/50 hover:text-foreground transition-colors"
        >
          No recommendations available — browse the full catalog
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((p) => {
            const isSel = selectedIds.has(p.id);
            const item = toSurface(p);
            const tubFiller = role === "bathroom-faucet" && verifiedPelicanBathroomFixtureProfile(item.pelicanCode)?.kind === "floor-tub-filler";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if ((role === "toilet-bidet" || role === "bathtub" || tubFiller) && onPlaceBathroomFixture) {
                    onPlaceBathroomFixture(item);
                  } else {
                    onToggle(item, role);
                  }
                }}
                className={`group overflow-hidden rounded-lg border text-left transition-colors ${
                  isSel
                    ? "border-[#a87f33] ring-1 ring-[#a87f33]/40 bg-[#a87f33]/5"
                    : "border-border hover:border-[#a87f33]/50 hover:bg-muted/40"
                }`}
              >
                <div className="relative aspect-[4/3] w-full bg-muted">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
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
                      isSel ? "bg-[#a87f33]" : "bg-black/35 group-hover:bg-black/55"
                    }`}
                  >
                    {isSel ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </div>
                </div>
                <div className="space-y-0.5 p-1.5">
                  {tubFiller && <p className="text-[10px] font-medium leading-snug text-emerald-700">Floor-mounted · tap to place in 3D</p>}
                  <div className="line-clamp-2 min-h-[1.9rem] text-[11px] font-semibold leading-snug text-foreground">
                    {p.name}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1a2744] dark:text-foreground">
                      {formatPrice(p.sellPrice)}
                    </span>
                    {p.size && (
                      <span className="truncate pl-1 text-[9px] text-muted-foreground">
                        {p.size}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The Design Tool's "Surfaces" palette panel: recommended real Pelican products
 * for flooring, backsplash, countertop, sink and faucet, each as its own
 * section. Tapping a card adds/removes it from the design's selected surfaces
 * (which flow to the cart and satisfy the 3D View readiness gate). A "Browse
 * all" link opens the full Surfaces & Fixtures catalog dialog.
 */
export function RecommendedSurfaces({
  selected,
  onToggle,
  onBrowseAll,
  roomType = "kitchen",
  limit = 8,
  onPlaceBathroomFixture,
  bathroomPaletteMode = "surfaces",
}: {
  selected: SelectedSurface[];
  onToggle: (item: SelectedSurface, role: RecommendedRole) => void;
  onBrowseAll: (role: RecommendedRole) => void;
  roomType?: string;
  limit?: number;
  /** Clicking a source-measured toilet, bidet, or tub places it into the active bathroom plan. */
  onPlaceBathroomFixture?: (item: SelectedSurface) => void;
  /** Keeps bathroom finishes in Surfaces and products in the dedicated Fixtures tab. */
  bathroomPaletteMode?: BathroomPaletteMode;
}) {
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const isBathroom = roomType === "bathroom";
  const sections = isBathroom
    ? bathroomPaletteMode === "fixtures"
      ? BATHROOM_FIXTURE_RECOMMENDED_SECTIONS
      : BATHROOM_SURFACE_RECOMMENDED_SECTIONS
    : RECOMMENDED_SECTIONS;

  return (
    <div className="space-y-4">
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        {isBathroom
          ? bathroomPaletteMode === "fixtures"
            ? "Pelican bathroom fixtures only. Tap a source-measured toilet, bidet, or tub to place it in Floor Plan and 3D; vanity basins and faucets install through a compatible vanity base."
            : "Pelican bathroom surfaces only. Choose countertop, flooring, or wall tile; bathroom fixtures are in the Fixtures tab."
          : "Recommended Pelican surfaces & fixtures. Tap to add to your design — they appear in your quote and unlock the 3D View. Tap again to remove."}
      </p>
      {sections.map((s) => (
        <RecommendedRow
          key={s.role}
          role={s.role}
          label={s.label}
          blurb={s.blurb}
          limit={limit}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onBrowseAll={onBrowseAll}
          onPlaceBathroomFixture={onPlaceBathroomFixture}
        />
      ))}
    </div>
  );
}
