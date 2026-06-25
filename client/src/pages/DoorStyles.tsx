import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Palette, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import DoorPhotoMatchWidget from "@/components/DoorPhotoMatchWidget";
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
  roomSceneImageUrl: string | null;
}

function StyleCard({ style }: { style: DoorStyle }) {
  const { t } = useLanguage();
  // STRICT ONE-FAMILY-ONE-COLOR: use ONLY this style's own verified photo.
  // When there's no real photo, fall back to the color-accurate swatch/preview
  // (recolored to THIS style's exact finish) — never a generic stock door or
  // another family's scene.
  const realDoor = style.doorSampleImageUrl || null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cabinet-card group rounded-xl border border-border bg-card overflow-hidden text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* Clean studio door sample as the primary visual on a neutral ground */}
          <div className="h-48 flex items-center justify-center border-b border-border overflow-hidden relative bg-gradient-to-b from-muted/40 to-muted/70">
            {realDoor ? (
              <img
                src={realDoor}
                alt={`${style.ourName || style.styleCode} door sample`}
                loading="lazy"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <DoorStyleSwatch
                style={style}
                className="relative h-32 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <span className="absolute bottom-2 right-2 text-[10px] font-medium text-white bg-black/55 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              {t("ds_view_details")}
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
                <p className="text-xs text-muted-foreground">{t("ds_wood")}: {style.woodSpecies}</p>
              )}
              {style.finish && (
                <p className="text-xs text-muted-foreground">{t("ds_finish")}: {style.finish}</p>
              )}
              {style.color && (
                <p className="text-xs text-muted-foreground">{t("ds_color")}: {style.color}</p>
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

        {/* Primary: the clean studio door sample for this finish */}
        <div className="rounded-lg overflow-hidden border border-border bg-gradient-to-b from-muted/40 to-muted/70">
          {realDoor ? (
            <img
              src={realDoor}
              alt={`${style.ourName || style.styleCode} door sample`}
              className="w-full h-auto block"
            />
          ) : (
            <DoorStyleSwatch style={style} className="w-full h-auto block" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <DoorStyleSwatch style={style} className="h-12 w-auto" />
            <div className="text-xs text-muted-foreground">{t("ds_true_color")}</div>
          </div>
          <div className="space-y-0.5">
            {style.doorStyle && <p className="text-xs"><span className="text-muted-foreground">{t("ds_style")}:</span> {style.doorStyle}</p>}
            {style.woodSpecies && <p className="text-xs"><span className="text-muted-foreground">{t("ds_wood")}:</span> {style.woodSpecies}</p>}
            {style.finish && <p className="text-xs"><span className="text-muted-foreground">{t("ds_finish")}:</span> {style.finish}</p>}
            {style.color && <p className="text-xs"><span className="text-muted-foreground">{t("ds_color")}:</span> {style.color}</p>}
          </div>
        </div>

        {/* Primary path into shopping: see EVERY cabinet available in this family */}
        <Link href={`/family/${encodeURIComponent(style.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            {t("ds_shop_collection", { name: style.ourName || style.styleCode })}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Door Styles page ────────────────────────────────────────────────────

export default function DoorStyles() {
  const { t } = useLanguage();
  // Read an optional ?door=<DoorStyle> query param so links from the Home page
  // hero chips (e.g. /styles?door=Shaker) open the grid pre-filtered to that
  // door profile. Falls back to "All Styles" when absent or unrecognized.
  const initialType = (() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("door");
    return p && p.trim() ? p.trim() : null;
  })();
  const [selectedType, setSelectedType] = useState<string | null>(initialType);

  // Keep the URL in sync so the filtered view is shareable/back-button friendly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedType) url.searchParams.set("door", selectedType);
    else url.searchParams.delete("door");
    window.history.replaceState({}, "", url.toString());
  }, [selectedType]);

  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery();
  // Admin-curated featured set (80/20 merchandising), ordered by rank, max 30.
  const { data: featuredData } = trpc.doorStyles.featured.useQuery();

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

  // Featured push styles come from the admin-curated list (Admin → Featured
  // Styles). The backend already orders by rank and caps at 30; we preserve
  // that order here. Membership is keyed by display name so de-duped rows match.
  const featuredNames = useMemo(() => {
    const names = new Map<string, number>();
    ((featuredData ?? []) as DoorStyle[]).forEach((s, i) => {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!names.has(key)) names.set(key, i);
    });
    return names;
  }, [featuredData]);

  const isFeatured = (s: DoorStyle) =>
    featuredNames.has((s.ourName || s.styleCode || String(s.id)).toLowerCase());

  const featured = useMemo(
    () =>
      uniqueStyles
        .filter(isFeatured)
        .sort(
          (a, b) =>
            (featuredNames.get((a.ourName || a.styleCode || String(a.id)).toLowerCase()) ?? 0) -
            (featuredNames.get((b.ourName || b.styleCode || String(b.id)).toLowerCase()) ?? 0)
        )
        .slice(0, 30),
    [uniqueStyles, featuredNames]
  );

  const visible = selectedType
    ? uniqueStyles.filter((s) => s.doorStyle === selectedType)
    : uniqueStyles;

  // When no profile filter is active, show the Featured row separately and keep
  // the main grid as the rest (so featured styles aren't duplicated below).
  const showFeatured = !selectedType && featured.length > 0;
  const gridStyles = showFeatured
    ? visible.filter((s) => !isFeatured(s))
    : visible;

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          {t("ds_title")}
        </h1>
        <p className="text-muted-foreground">
          {t("ds_sub")}
        </p>
      </div>

      {/* Match a door from a photo */}
      <div className="mb-8">
        <DoorPhotoMatchWidget />
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
            {t("ds_all_styles")}
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

      {/* Featured: Skyline (Aero) styles lead the page */}
      {!isLoading && showFeatured && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-serif text-xl font-bold text-foreground">{t("ds_featured")}</h2>
            <Badge className="bg-primary text-primary-foreground">{t("ds_editors_picks")}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {featured.map((style) => (
              <StyleCard key={style.id} style={style} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && showFeatured && gridStyles.length > 0 && (
        <h2 className="font-serif text-xl font-bold text-foreground mb-4">{t("ds_all_door_styles")}</h2>
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
          <p className="text-sm">{t("ds_none")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {gridStyles.map((style) => (
            <StyleCard key={style.id} style={style} />
          ))}
        </div>
      )}
    </div>
  );
}
