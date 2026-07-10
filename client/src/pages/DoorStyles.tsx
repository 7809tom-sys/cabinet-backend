import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight, Palette, Star, Award } from "lucide-react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  bestValue?: boolean | null;
  designersChoice?: boolean | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
}

function displayName(style: DoorStyle): string {
  return styleDisplayName(style) || style.featuredLabel || style.styleCode;
}

function subtitle(style: DoorStyle): string {
  const parts: string[] = [];
  if (style.doorStyle) parts.push(style.doorStyle);
  if (style.woodSpecies) parts.push(style.woodSpecies);
  return parts.join(" · ");
}

// ─── Room Scene Card (full-bleed, tall) ───────────────────────────────────────
// Matches the screenshot: photo fills the card, name + subtitle overlay at bottom-left,
// chevron at bottom-right, badge ribbon at top-left.

function RoomSceneCard({ style, href }: { style: DoorStyle; href?: string }) {
  const { t } = useLanguage();
  const bg = style.roomSceneImageUrl || style.doorSampleImageUrl;
  const name = displayName(style);
  const sub = subtitle(style);

  const inner = (
    <div className="relative w-full overflow-hidden rounded-2xl bg-muted group cursor-pointer"
         style={{ aspectRatio: "4/3" }}>
      {/* Background room scene photo */}
      {bg ? (
        <img
          src={bg}
          alt={`${name} kitchen`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
          <DoorStyleSwatch style={style} className="h-24 w-auto drop-shadow-lg" />
        </div>
      )}

      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {/* Badge ribbons — top-left */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
        {style.bestValue && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider
                           text-amber-950 bg-amber-400 px-2.5 py-1 rounded-full shadow-md">
            <Star className="h-3 w-3 fill-amber-950" />
            Best Value
          </span>
        )}
        {style.designersChoice && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider
                           text-white bg-indigo-600 px-2.5 py-1 rounded-full shadow-md">
            <Award className="h-3 w-3" />
            Designer's Choice
          </span>
        )}
        {style.isBuilderGrade && !style.bestValue && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider
                           text-amber-950 bg-amber-300 px-2.5 py-1 rounded-full shadow-sm">
            Value Line
          </span>
        )}
      </div>

      {/* Name + subtitle + chevron — bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 flex items-end justify-between z-10">
        <div className="min-w-0">
          <p className="text-white font-bold text-lg leading-tight drop-shadow-sm truncate">
            {name}
          </p>
          {sub && (
            <p className="text-white/75 text-sm leading-tight mt-0.5 truncate">
              {sub}
            </p>
          )}
        </div>
        <div className="ml-3 shrink-0 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center
                        group-hover:bg-white/35 transition-colors duration-200">
          <ChevronRight className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl">
          {inner}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {name}
            {style.doorStyle && (
              <Badge variant="outline" className="text-xs">{style.doorStyle}</Badge>
            )}
            {style.bestValue && (
              <Badge className="text-xs bg-amber-400 text-amber-950 hover:bg-amber-400 gap-1">
                <Star className="h-3 w-3 fill-amber-950" /> Best Value
              </Badge>
            )}
            {style.designersChoice && (
              <Badge className="text-xs bg-indigo-600 text-white hover:bg-indigo-600 gap-1">
                <Award className="h-3 w-3" /> Designer's Choice
              </Badge>
            )}
            {style.isBuilderGrade && !style.bestValue && (
              <Badge className="text-xs bg-amber-300 text-amber-950 hover:bg-amber-300">{t("ds_builder_grade")}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Room scene or door sample */}
        <div className="rounded-lg overflow-hidden border border-border bg-muted">
          {bg ? (
            <img
              src={bg}
              alt={`${name} kitchen`}
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
            {style.hardware && <p className="text-xs"><span className="text-muted-foreground">{t("ds_hardware")}:</span> {style.hardware}</p>}
          </div>
        </div>

        {style.isBuilderGrade && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("ds_builder_grade_note")}
          </div>
        )}

        <Link href={`/family/${encodeURIComponent(style.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            {t("ds_shop_collection", { name })}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compact thumbnail card (for the "All Styles" grid below featured) ────────

function CompactCard({ style }: { style: DoorStyle }) {
  const { t } = useLanguage();
  const realDoor = style.doorSampleImageUrl || null;
  const name = displayName(style);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cabinet-card group relative rounded-xl border border-border bg-card overflow-hidden text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="h-40 flex items-center justify-center border-b border-border overflow-hidden relative bg-gradient-to-b from-muted/40 to-muted/70">
            {realDoor ? (
              <img
                src={realDoor}
                alt={`${name} door`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <DoorStyleSwatch
                style={style}
                className="relative h-28 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            {/* Badge ribbons */}
            {style.bestValue && (
              <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide
                               text-amber-950 bg-amber-400/95 px-2 py-0.5 rounded-full shadow-sm">
                <Star className="h-2.5 w-2.5 fill-amber-950" /> Best Value
              </span>
            )}
            {style.designersChoice && !style.bestValue && (
              <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide
                               text-white bg-indigo-600/95 px-2 py-0.5 rounded-full shadow-sm">
                <Award className="h-2.5 w-2.5" /> Designer's
              </span>
            )}
            {style.isBuilderGrade && !style.bestValue && !style.designersChoice && (
              <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wide text-amber-950 bg-amber-300/95 px-2 py-0.5 rounded-full shadow-sm">
                {t("ds_builder_grade")}
              </span>
            )}
          </div>
          <div className="p-3">
            <p className="font-semibold text-sm text-foreground leading-snug truncate">{name}</p>
            {style.doorStyle && (
              <p className="text-xs text-muted-foreground mt-0.5">{style.doorStyle}</p>
            )}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {name}
            {style.doorStyle && <Badge variant="outline" className="text-xs">{style.doorStyle}</Badge>}
            {style.bestValue && (
              <Badge className="text-xs bg-amber-400 text-amber-950 hover:bg-amber-400 gap-1">
                <Star className="h-3 w-3 fill-amber-950" /> Best Value
              </Badge>
            )}
            {style.designersChoice && (
              <Badge className="text-xs bg-indigo-600 text-white hover:bg-indigo-600 gap-1">
                <Award className="h-3 w-3" /> Designer's Choice
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg overflow-hidden border border-border bg-muted">
          {realDoor ? (
            <img src={realDoor} alt={`${name} door`} className="w-full h-auto block" />
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
        <Link href={`/family/${encodeURIComponent(style.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            {t("ds_shop_collection", { name })}
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

  const initialType = (() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("door");
    return p && p.trim() ? p.trim() : null;
  })();
  const [selectedType, setSelectedType] = useState<string | null>(initialType);
  const isMobile = useIsMobile();
  const PER_PAGE = 16;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [selectedType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedType) url.searchParams.set("door", selectedType);
    else url.searchParams.delete("door");
    window.history.replaceState({}, "", url.toString());
  }, [selectedType]);

  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery();
  const { data: featuredData } = trpc.doorStyles.featured.useQuery();

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

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of uniqueStyles) if (s.doorStyle) set.add(s.doorStyle);
    return Array.from(set).sort();
  }, [uniqueStyles]);

  const featuredNames = useMemo(() => {
    const names = new Map<string, number>();
    ((featuredData ?? []) as DoorStyle[]).forEach((s, i) => {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!names.has(key)) names.set(key, i);
    });
    return names;
  }, [featuredData]);

  const isFeaturedStyle = (s: DoorStyle) =>
    featuredNames.has((s.ourName || s.styleCode || String(s.id)).toLowerCase());

  const featured = useMemo(
    () =>
      uniqueStyles
        .filter(isFeaturedStyle)
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

  const showFeatured = !selectedType && featured.length > 0;
  const gridStyles = showFeatured
    ? visible.filter((s) => !isFeaturedStyle(s))
    : visible;

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
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* ── Featured: full-bleed room scene cards ── */}
      {!isLoading && showFeatured && (
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="font-serif text-xl font-bold text-foreground">{t("ds_featured")}</h2>
            <Badge className="bg-primary text-primary-foreground">{t("ds_editors_picks")}</Badge>
          </div>
          {/* Single-column on mobile, 2-col on md, 3-col on lg — tall room scene cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((style) => (
              <RoomSceneCard key={style.id} style={style} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && showFeatured && gridStyles.length > 0 && (
        <h2 className="font-serif text-xl font-bold text-foreground mb-4">{t("ds_all_door_styles")}</h2>
      )}

      {/* ── All Styles grid (compact cards) ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-16" />
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
              <CompactCard key={style.id} style={style} />
            ))}
          </div>

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
