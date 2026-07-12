import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Palette, ArrowRight, ChevronLeft, ChevronRight, ImageIcon, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import DoorPhotoMatchWidget from "@/components/DoorPhotoMatchWidget";
import { styleDisplayName } from "@/lib/styleDisplayName";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// ─── Style card ───────────────────────────────────────────────────────────────
// Presents purely by door-style attributes. No supplier/line identity is shown.

interface DoorStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  aliasName?: string | null;
  featuredLabel?: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  finish: string | null;
  hardware?: string | null;
  isBuilderGrade?: boolean | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
}

/** Returns the public-facing display name: aliasName → featuredLabel → ourName → styleCode */
function displayName(style: DoorStyle): string {
  return styleDisplayName(style) || style.featuredLabel || style.styleCode;
}

function StyleCard({ style }: { style: DoorStyle }) {
  const { t } = useLanguage();
  const [showDoor, setShowDoor] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [doorFailed, setDoorFailed] = useState(false);
  const roomScene = style.roomSceneImageUrl;
  const doorSample = style.doorSampleImageUrl;
  // Hero: room scene is PRIMARY; door icon toggles to close-up door sample
  const heroSrc = showDoor
    ? (doorSample && !doorFailed ? doorSample : null)
    : (roomScene && !sceneFailed ? roomScene : null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cabinet-card group relative rounded-xl border border-border bg-card overflow-hidden text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* Room scene is the primary hero; door icon toggles to close-up */}
          <div className="h-48 flex items-center justify-center border-b border-border overflow-hidden relative bg-gradient-to-b from-muted/40 to-muted/70">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={showDoor ? `${style.ourName || style.styleCode} door sample` : `${style.ourName || style.styleCode} kitchen`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={() => showDoor ? setDoorFailed(true) : setSceneFailed(true)}
              />
            ) : (
              <DoorStyleSwatch
                style={style}
                className="relative h-32 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            {/* Gradient overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {/* Door toggle button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDoor((v) => !v); }}
              className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-md transition-colors z-10 ${
                showDoor ? "border-white bg-white text-foreground" : "border-white/80 bg-black/40 text-white hover:bg-black/60"
              }`}
              title={showDoor ? "Show room scene" : "View door close-up"}
            >
              {showDoor ? <Maximize2 className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            </button>
            {/* View-mode label */}
            <span className="absolute bottom-2 left-2 text-[10px] font-medium text-white/90 bg-black/50 px-1.5 py-0.5 rounded-full">
              {showDoor ? "Door" : "Room"}
            </span>
          </div>

          {/* Builder Grade line marker — standard hardware, value line */}
          {style.isBuilderGrade && (
            <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wide text-amber-950 bg-amber-300/95 px-2 py-0.5 rounded-full shadow-sm">
              {t("ds_builder_grade")}
            </span>
          )}

          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-semibold text-sm text-foreground leading-snug">
                {displayName(style)}
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
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {displayName(style)}
            {style.doorStyle && (
              <Badge variant="outline" className="text-xs">{style.doorStyle}</Badge>
            )}
            {style.isBuilderGrade && (
              <Badge className="text-xs bg-amber-300 text-amber-950 hover:bg-amber-300">{t("ds_builder_grade")}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Primary: the clean studio door sample for this finish */}
        <div className="rounded-lg overflow-hidden border border-border bg-gradient-to-b from-muted/40 to-muted/70">
          {doorSample && !doorFailed ? (
            <img
              src={doorSample}
              alt={`${style.ourName || style.styleCode} door sample`}
              className="w-full h-auto block"
              onError={() => setDoorFailed(true)}
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
            {style.hardware && <p className="text-xs"><span className="text-muted-foreground">{t("ds_hardware")}:</span> {style.hardware}</p>}
          </div>
        </div>

        {/* Builder Grade advisory: this value line ships standard hardware, not soft-close */}
        {style.isBuilderGrade && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("ds_builder_grade_note")}
          </div>
        )}

        {/* Primary path into shopping: see EVERY cabinet available in this family */}
        <Link href={`/family/${encodeURIComponent(style.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            {t("ds_shop_collection", { name: displayName(style) })}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Door Styles page ────────────────────────────────────────────────────

export default function DoorStyles() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_styles_t"), description: t("seo_styles_d"), lang });
  // Read an optional ?door=<DoorStyle> query param so links from the Home page
  // hero chips (e.g. /styles?door=Shaker) open the grid pre-filtered to that
  // door profile. Falls back to "All Styles" when absent or unrecognized.
  const initialType = (() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("door");
    return p && p.trim() ? p.trim() : null;
  })();
  const [selectedType, setSelectedType] = useState<string | null>(initialType);
  const isMobile = useIsMobile();
  // Desktop pages the main grid 16-at-a-time (a 4x4 grid) so the photos load
  // fast and the page stays light. Mobile keeps the familiar single scroll.
  const PER_PAGE = 16;
  const [page, setPage] = useState(0);
  // Reset to the first page whenever the active filter changes.
  useEffect(() => { setPage(0); }, [selectedType]);

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

  // Desktop pages the main grid by 16 (4x4). Mobile shows the full list so the
  // familiar scroll is preserved. Clamp the page if the list shrank.
  const paginate = !isMobile;
  const pageCount = paginate ? Math.max(1, Math.ceil(gridStyles.length / PER_PAGE)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pagedStyles = paginate
    ? gridStyles.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)
    : gridStyles;

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
          {types.map((doorType) => (
            <button
              key={doorType}
              onClick={() => setSelectedType(doorType)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedType === doorType
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {doorType}
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
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {pagedStyles.map((style) => (
              <StyleCard key={style.id} style={style} />
            ))}
          </div>

          {/* Desktop pager: 16 styles per page, Prev / Next + position. */}
          {paginate && pageCount > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("ds_prev")}
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("ds_page_of", { page: String(safePage + 1), total: String(pageCount) })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => {
                  setPage((p) => Math.min(pageCount - 1, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {t("ds_next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
