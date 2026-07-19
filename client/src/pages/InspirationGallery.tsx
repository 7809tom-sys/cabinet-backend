/**
 * Inspiration Gallery — /inspiration
 *
 * A filterable grid of curated kitchen/bathroom/laundry design photos.
 * Photos are managed by admins via the Admin panel (Inspiration Gallery tab).
 * Each photo links to the Design Tool with the associated door style pre-loaded.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";
import { Sparkles, ChefHat, Bath, Shirt, Archive, LayoutGrid, ArrowRight, ImageIcon } from "lucide-react";

// ─── Room filter options ──────────────────────────────────────────────────────
const ROOM_FILTERS = [
  { value: "all", label: "All Rooms", Icon: LayoutGrid },
  { value: "kitchen", label: "Kitchen", Icon: ChefHat },
  { value: "bathroom", label: "Bathroom", Icon: Bath },
  { value: "laundry", label: "Laundry", Icon: Shirt },
  { value: "closet", label: "Closet", Icon: Archive },
  { value: "other", label: "Other", Icon: LayoutGrid },
] as const;

type RoomFilter = (typeof ROOM_FILTERS)[number]["value"];

// ─── Gallery photo type ───────────────────────────────────────────────────────
type InspirationPhoto = {
  id: number;
  title: string;
  imageUrl: string;
  roomType: string | null;
  doorStyleName: string | null;
  colorName: string | null;
  tags: string | null;
  styleId: number | null;
  sortOrder: number;
};

// ─── Photo card ───────────────────────────────────────────────────────────────
function PhotoCard({ photo }: { photo: InspirationPhoto }) {
  const tags = photo.tags ? photo.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="aspect-[4/3] bg-muted overflow-hidden">
        <img
          src={photo.imageUrl}
          alt={photo.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <div className="text-white font-semibold text-sm mb-1">{photo.title}</div>
        {photo.doorStyleName && (
          <div className="text-white/80 text-xs mb-2">Style: {photo.doorStyleName}</div>
        )}
        {photo.styleId && (
          <Link href={`/design?style=${photo.styleId}`}>
            <Button size="sm" variant="secondary" className="gap-1.5 text-xs h-7">
              Design with this style
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
      {/* Bottom info bar */}
      <div className="p-3">
        <div className="font-medium text-sm text-foreground truncate">{photo.title}</div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {photo.roomType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 capitalize">
              {photo.roomType}
            </Badge>
          )}
          {photo.colorName && (
            <span className="text-xs text-muted-foreground truncate">{photo.colorName}</span>
          )}
          {tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ filter }: { filter: RoomFilter }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">No photos yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        {filter === "all"
          ? "Inspiration photos will appear here once they're added by the team."
          : `No ${filter} photos have been added yet. Check back soon!`}
      </p>
      <Link href="/start" className="mt-4">
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Start designing anyway
        </Button>
      </Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InspirationGallery() {
  useSeo({ title: "Inspiration Gallery — Cabinet Dealz" });

  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");

  const { data: photos, isLoading } = trpc.inspiration.list.useQuery(
    { roomType: roomFilter === "all" ? undefined : roomFilter },
    { staleTime: 5 * 60 * 1000 }
  );

  const filteredPhotos = useMemo(() => photos ?? [], [photos]);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-navy)]/80 text-white py-16">
        <div className="container text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Design Inspiration
          </div>
          <h1 className="text-4xl font-bold font-serif mb-3">
            Find Your Perfect Kitchen
          </h1>
          <p className="text-white/70 max-w-xl mx-auto mb-6">
            Browse real kitchens and bathrooms designed with our cabinet styles. Click any photo to
            launch the Design Tool with that style pre-loaded.
          </p>
          <Link href="/start">
            <Button size="lg" variant="secondary" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Start Your Design
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container py-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {ROOM_FILTERS.map((f) => {
              const Icon = f.Icon;
              const active = roomFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setRoomFilter(f.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      <div className="container py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-border">
                <Skeleton className="aspect-[4/3]" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="grid grid-cols-1">
            <EmptyState filter={roomFilter} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredPhotos.map((photo: InspirationPhoto) => (
              <PhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        {filteredPhotos.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              Ready to start designing your own space?
            </p>
            <Link href="/start">
              <Button size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Start the Design Wizard
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
