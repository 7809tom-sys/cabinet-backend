import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Palette, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { RoomScenePreview } from "@/components/RoomScenePreview";
import { doorFamilyPhoto } from "@/lib/doorFamilyPhotos";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// ─── Style card ───────────────────────────────────────────────────────────────
// Presents purely by door-style attributes. No supplier/line identity is shown.

interface DoorStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  finish: string | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
}

function StyleCard({ style }: { style: DoorStyle }) {
  const familyPhoto = doorFamilyPhoto(style);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cabinet-card group rounded-xl border border-border bg-card overflow-hidden text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* Room scene backdrop + the door profile sample on top + true-color chip */}
          <div className="h-40 flex items-center justify-center border-b border-border overflow-hidden relative">
            {/* Per-style kitchen room scene rendered in this exact finish */}
            <RoomScenePreview
              style={style}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Soft scrim so the door sample reads clearly against the scene */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
            {familyPhoto ? (
              <img
                src={familyPhoto}
                alt={`${style.doorStyle || "Door"} panel profile sample`}
                loading="lazy"
                className="relative h-28 w-auto object-contain drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <DoorStyleSwatch
                style={style}
                className="relative h-28 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            {/* true-color chip so the realistic profile + exact finish are both shown */}
            <span className="absolute top-2 left-2 rounded-md bg-background/90 p-0.5 shadow-sm ring-1 ring-border">
              <DoorStyleSwatch style={style} className="h-9 w-auto" />
            </span>
            <span className="absolute bottom-2 right-2 text-[10px] font-medium text-white bg-black/55 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              View in kitchen
            </span>
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-semibold text-sm text-foreground leading-snug">
                {style.ourName || style.styleCode}
              </p>
              {style.doorStyle && (
                <Badge variant="outline" className="text-xs shrink-0">{style.doorStyle}</Badge>
              )}
            </div>

            <div className="mt-1 space-y-0.5">
              {style.woodSpecies && (
                <p className="text-xs text-muted-foreground">Wood: {style.woodSpecies}</p>
              )}
              {style.finish && (
                <p className="text-xs text-muted-foreground">Finish: {style.finish}</p>
              )}
              {style.color && (
                <p className="text-xs text-muted-foreground">Color: {style.color}</p>
              )}
            </div>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {style.ourName || style.styleCode}
            {style.doorStyle && (
              <Badge variant="outline" className="text-xs">{style.doorStyle}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Generated room scene in this style's color + panel treatment */}
        <div className="rounded-lg overflow-hidden border border-border">
          <RoomScenePreview style={style} className="w-full h-auto block" />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            {familyPhoto ? (
              <img
                src={familyPhoto}
                alt={`${style.doorStyle || "Door"} panel profile sample`}
                loading="lazy"
                className="h-16 w-auto object-contain rounded"
              />
            ) : null}
            <DoorStyleSwatch style={style} className="h-12 w-auto" />
            <div className="text-xs text-muted-foreground">Profile &amp; true color</div>
          </div>
          <div className="space-y-0.5">
            {style.doorStyle && <p className="text-xs"><span className="text-muted-foreground">Style:</span> {style.doorStyle}</p>}
            {style.woodSpecies && <p className="text-xs"><span className="text-muted-foreground">Wood:</span> {style.woodSpecies}</p>}
            {style.finish && <p className="text-xs"><span className="text-muted-foreground">Finish:</span> {style.finish}</p>}
            {style.color && <p className="text-xs"><span className="text-muted-foreground">Color:</span> {style.color}</p>}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Scene is a rendered illustration of this finish across upper and base cabinets.
        </p>

        {/* Primary path into shopping: see EVERY cabinet available in this family */}
        <Link href={`/family/${encodeURIComponent(style.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            Shop the {style.ourName || style.styleCode} collection
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Door Styles page ────────────────────────────────────────────────────

export default function DoorStyles() {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery();

  // De-duplicate styles by display name (the same style can be carried by more
  // than one supply line internally; members should only ever see it once).
  const uniqueStyles = useMemo(() => {
    const map = new Map<string, DoorStyle>();
    for (const s of (styles ?? []) as DoorStyle[]) {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.ourName || "").localeCompare(b.ourName || "")
    );
  }, [styles]);

  // Door-style type facets (Shaker, Raised Panel, Slab, ...) derived from data.
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of uniqueStyles) if (s.doorStyle) set.add(s.doorStyle);
    return Array.from(set).sort();
  }, [uniqueStyles]);

  const visible = selectedType
    ? uniqueStyles.filter((s) => s.doorStyle === selectedType)
    : uniqueStyles;

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Door Styles
        </h1>
        <p className="text-muted-foreground">
          A full range of finishes, each carrying its own trade pricing —
          open any cabinet to compare styles and member pricing.
        </p>
      </div>

      {/* Door-style type filter */}
      {types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedType === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All Styles
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Palette className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No door styles match this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visible.map((style) => (
            <StyleCard key={style.id} style={style} />
          ))}
        </div>
      )}
    </div>
  );
}
