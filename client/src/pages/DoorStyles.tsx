import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Palette, ArrowRight, ChevronLeft, ChevronRight, ImageIcon, Search, X } from "lucide-react";
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
  distributorId?: number | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
}

/** Returns the public-facing display name: aliasName → featuredLabel → ourName → styleCode */
function displayName(style: DoorStyle): string {
  return styleDisplayName(style) || style.featuredLabel || style.styleCode;
}

function StyleCard({ style, seriesName }: { style: DoorStyle; seriesName?: string | null }) {
  const { t } = useLanguage();
  const [showDoor, setShowDoor] = useState(false);
  // Room scene is the featured image; door sample is the secondary toggle view
  const roomScene = style.roomSceneImageUrl || null;
  const doorSample = style.doorSampleImageUrl || null;
  // Hero: room scene first, fall back to door sample
  const heroSrc = showDoor ? (doorSample || roomScene) : (roomScene || doorSample);
  const canToggle = !!(roomScene && doorSample); // only show toggle when both exist

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cabinet-card group relative rounded-xl border border-border bg-card overflow-hidden text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* Room scene as the primary visual — door sample available via toggle */}
          <div className="h-48 flex items-center justify-center border-b border-border overflow-hidden relative bg-gradient-to-b from-muted/40 to-muted/70">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={showDoor ? `${style.ourName || style.styleCode} door sample` : `${style.ourName || style.styleCode} kitchen`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <DoorStyleSwatch
                style={style}
                className="relative h-32 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            {/* Door/scene toggle button */}
            {canToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowDoor(v => !v); }}
                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/80 bg-black/40 text-white hover:bg-black/60 transition-colors"
                aria-label={showDoor ? "Show room scene" : "Show door close-up"}
              >
                <ImageIcon className="h-3 w-3" />
              </button>
            )}
            <span className="absolute bottom-2 left-2 text-[10px] font-medium text-white bg-black/55 px-2 py-0.5 rounded-full">
              {showDoor ? "Door sample" : "Room scene"}
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
                <p className="text-xs text-muted-foreground">
                  {t("ds_color")}: {style.color}{seriesName ? <span className="text-muted-foreground/70"> ({seriesName})</span> : null}
                </p>
              )}
              {!style.color && seriesName && (
                <p className="text-xs text-muted-foreground/70">({seriesName})</p>
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

        {/* Primary: room scene (full-width hero), then door sample thumbnail below */}
        {roomScene && (
          <div className="rounded-lg overflow-hidden border border-border">
            <img
              src={roomScene}
              alt={`${style.ourName || style.styleCode} kitchen`}
              className="w-full h-auto block"
            />
          </div>
        )}
        {/* Door sample — shown as secondary if room scene is present, or primary if not */}
        <div className={`rounded-lg overflow-hidden border border-border bg-gradient-to-b from-muted/40 to-muted/70 ${roomScene ? "flex items-center gap-3 p-3" : ""}`}>
          {doorSample ? (
            <img
              src={doorSample}
              alt={`${style.ourName || style.styleCode} door sample`}
              className={roomScene ? "h-24 w-auto rounded object-contain" : "w-full h-auto block"}
            />
          ) : (
            <DoorStyleSwatch style={style} className={roomScene ? "h-24 w-auto" : "w-full h-auto block"} />
          )}
          {roomScene && (
            <div className="text-xs text-muted-foreground">Door close-up</div>
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
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();
  const PER_PAGE = 16;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [selectedType, selectedColor, searchQuery]);

  // Fetch distributors to map series names
  const { data: distributorList } = trpc.distributors.list.useQuery();
  const seriesById = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const d of (distributorList ?? [])) m.set(d.id, d.seriesName ?? null);
    return m;
  }, [distributorList]);

  // Color filter buckets
  const COLOR_BUCKETS: { key: string; label: string; match: (n: string, c: string) => boolean }[] = [
    { key: "White",       label: "White",       match: (n) => (n.includes("white")) && !n.includes("off white") && !n.includes("off-white") },
    { key: "Grey",        label: "Grey",        match: (n) => (n.includes("grey") || n.includes("gray")) && !n.includes("stain") },
    { key: "Off White",   label: "Off White",   match: (n) => n.includes("off white") || n.includes("off-white") || n.includes("cream") || n.includes("antique white") || n.includes("linen") },
    { key: "Tan",         label: "Tan",         match: (n) => (n.includes("tan") || n.includes("beige") || n.includes("sand")) && !n.includes("stain") },
    { key: "Dark",        label: "Dark",        match: (n) => (n.includes("espresso") || n.includes("dark") || n.includes("black") || n.includes("charcoal") || n.includes("navy")) && !n.includes("stain") },
    { key: "Light Stain", label: "Light Stain", match: (n) => n.includes("light") && n.includes("stain") },
    { key: "Grey Stain",  label: "Grey Stain",  match: (n) => (n.includes("grey") || n.includes("gray")) && n.includes("stain") },
    { key: "Tan Stain",   label: "Tan Stain",   match: (n) => (n.includes("tan") || n.includes("honey") || n.includes("natural") || n.includes("oak")) && n.includes("stain") },
    { key: "Dark Stain",  label: "Dark Stain",  match: (n) => (n.includes("dark") || n.includes("walnut") || n.includes("cherry") || n.includes("mahogany") || n.includes("tobacco") || n.includes("java")) && n.includes("stain") },
  ];

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

  const visible = useMemo(() => {
    let list = uniqueStyles;
    if (selectedType) list = list.filter((s) => s.doorStyle === selectedType);
    if (selectedColor) {
      const bucket = COLOR_BUCKETS.find((b) => b.key === selectedColor);
      if (bucket) list = list.filter((s) => {
        const n = ((s.ourName || "") + " " + (s.aliasName || "") + " " + (s.color || "")).toLowerCase();
        return bucket.match(n, "");
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => {
        const sn = seriesById.get(s.distributorId ?? -1) ?? "";
        const n = ((s.ourName || "") + " " + (s.aliasName || "") + " " + (s.color || "") + " " + (s.doorStyle || "") + " " + sn).toLowerCase();
        return n.includes(q);
      });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueStyles, selectedType, selectedColor, searchQuery, seriesById]);

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

      {/* Search + Filters */}
      <div className="mb-8 space-y-3">
        {/* Search bar */}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, color or series…"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Style type pills */}
        {types.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedType(null)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                selectedType === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              }`}>
              {t("ds_all_styles")}
            </button>
            {["Shaker", "Raised Panel", "Flat Panel"].map((type) => (
              <button key={type}
                onClick={() => setSelectedType(selectedType === type ? null : type)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  selectedType === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                }`}>
                {type}
              </button>
            ))}
            {types.filter((tp) => !["Shaker", "Raised Panel", "Flat Panel"].includes(tp)).map((type) => (
              <button key={type}
                onClick={() => setSelectedType(selectedType === type ? null : type)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  selectedType === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                }`}>
                {type}
              </button>
            ))}
          </div>
        )}

        {/* Color filter pills */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedColor(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              selectedColor === null
                ? "bg-[#d4a75a] text-white border-[#d4a75a]"
                : "bg-background text-muted-foreground border-border hover:border-[#d4a75a]/60 hover:text-foreground"
            }`}>
            All Colors
          </button>
          {COLOR_BUCKETS.map((b) => (
            <button key={b.key}
              onClick={() => setSelectedColor(selectedColor === b.key ? null : b.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                selectedColor === b.key
                  ? "bg-[#d4a75a] text-white border-[#d4a75a]"
                  : "bg-background text-muted-foreground border-border hover:border-[#d4a75a]/60 hover:text-foreground"
              }`}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Active filter summary */}
        {(selectedType || selectedColor || searchQuery) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{visible.length} style{visible.length !== 1 ? "s" : ""} found</span>
            <button onClick={() => { setSelectedType(null); setSelectedColor(null); setSearchQuery(""); }}
              className="text-primary hover:underline">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Featured: Skyline (Aero) styles lead the page */}
      {!isLoading && showFeatured && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-serif text-xl font-bold text-foreground">{t("ds_featured")}</h2>
            <Badge className="bg-primary text-primary-foreground">{t("ds_editors_picks")}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {featured.map((style) => (
              <StyleCard key={style.id} style={style} seriesName={seriesById.get(style.distributorId ?? -1) ?? null} />
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
              <StyleCard key={style.id} style={style} seriesName={seriesById.get(style.distributorId ?? -1) ?? null} />
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
