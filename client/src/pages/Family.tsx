import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CabinetImage } from "@/components/CabinetImage";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { finishColors } from "@/lib/design";
import { type CabinetLike, cabinetTypeLabel } from "@/lib/cabinetGraphics";

// ─────────────────────────────────────────────────────────────────────────────
// Family page — the DOOR-STYLE-FAMILY-first shopping experience.
//
// A door style (e.g. "Silva Shaker" / Hickory) IS the product line. Landing
// here shows the family's room scene + sample door + facts, then EVERY cabinet
// available in that family (base, wall, tall, vanity, accessory) together,
// filterable by type. Each cabinet is drawn to scale and recolored to this
// family's real finish so the picture always matches the actual item.
// ─────────────────────────────────────────────────────────────────────────────

interface FamilyStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  finish: string | null;
  roomSceneImageUrl: string | null;
  doorSampleImageUrl: string | null;
}

interface FamilyItem extends CabinetLike {
  cabinetId: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  skuImageUrl?: string | null;
}

// Group the DB categories into the buyer-facing room-section filters.
const TYPE_FILTERS: { key: string; label: string; match: (cat: string) => boolean }[] = [
  { key: "all", label: "All Cabinets", match: () => true },
  { key: "base", label: "Base", match: (c) => c === "base" },
  { key: "wall", label: "Wall", match: (c) => c === "wall" },
  { key: "tall", label: "Tall & Pantry", match: (c) => c === "tall" },
  { key: "vanity", label: "Vanity", match: (c) => c === "vanity" },
  { key: "ada", label: "ADA", match: (c) => c === "ada" },
  { key: "accessory", label: "Trim & Accessories", match: (c) => c === "accessory" },
];

function FamilyCabinetCard({
  item,
  finish,
  styleId,
}: {
  item: FamilyItem;
  finish: string;
  styleId: number;
}) {
  return (
    <Link href={`/catalog/${item.masterCode}?style=${styleId}`}>
      <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/40 cursor-pointer overflow-hidden transition-colors">
        {/* Accurate, to-scale drawing recolored to THIS family's finish — always
            matches the real item type (drawer base draws drawers, sink base shows
            the sink, glass walls show glass, corners show the L-shape, etc.). */}
        <div className="relative h-44 bg-gradient-to-b from-white to-muted/30 flex items-center justify-center border-b border-border p-3">
          {item.skuImageUrl ? (
            <img
              src={item.skuImageUrl}
              alt={item.description ?? item.masterCode}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <CabinetImage
              cabinet={item}
              finishColor={finish}
              className="h-full w-auto max-w-full transition-transform duration-300 group-hover:scale-[1.04]"
            />
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {item.masterCode}
            </span>
            <Badge variant="secondary" className="text-xs shrink-0">
              {cabinetTypeLabel(item)}
            </Badge>
          </div>

          <p className="text-sm font-medium text-foreground mt-2 leading-snug line-clamp-2">
            {item.description}
          </p>

          {(item.width || item.height || item.depth) && (
            <p className="text-xs text-muted-foreground mt-2">
              {[
                item.width && `W: ${item.width}"`,
                item.height && `H: ${item.height}"`,
                item.depth && `D: ${item.depth}"`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">View pricing →</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Family({ styleCode }: { styleCode: string }) {
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Resolve the family by its style code, then load its full catalog.
  const { data: style, isLoading: styleLoading } = trpc.doorStyles.byCode.useQuery({
    styleCode,
  });
  const styleId = (style as FamilyStyle | null)?.id ?? 0;

  const { data, isLoading: catalogLoading } = trpc.doorStyles.familyCatalog.useQuery(
    { styleId },
    { enabled: !!styleId },
  );

  const items = useMemo(() => (data?.items ?? []) as FamilyItem[], [data]);

  // Color variations within the same door profile (in-place finish picker).
  const { data: siblingsData } = trpc.doorStyles.siblings.useQuery(
    { styleCode },
    { enabled: !!styleCode },
  );
  const siblings = useMemo(
    () => (siblingsData ?? []) as FamilyStyle[],
    [siblingsData],
  );

  // Finish color for recoloring every drawing to this family's real finish.
  const finish = useMemo(() => {
    const s = style as FamilyStyle | null;
    const fc = finishColors(s?.color || s?.ourName || s?.styleCode);
    return fc.face;
  }, [style]);

  // Only show type-filter chips that actually have items in this family.
  const availableTypes = useMemo(() => {
    const cats = new Set(items.map((i) => (i.category ?? "").toLowerCase()));
    return TYPE_FILTERS.filter((f) => f.key === "all" || cats.has(f.key));
  }, [items]);

  const visible = useMemo(() => {
    const f = TYPE_FILTERS.find((t) => t.key === activeType) ?? TYPE_FILTERS[0];
    return items.filter((i) => {
      if (!f.match((i.category ?? "").toLowerCase())) return false;
      if (debounced) {
        const hay = `${i.masterCode} ${i.description ?? ""} ${i.subCategory ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      return true;
    });
  }, [items, activeType, debounced]);

  const s = style as FamilyStyle | null;
  const familyName = s?.ourName || s?.styleCode || "Door Style";
  // STRICT ONE-FAMILY-ONE-COLOR: a family shows ONLY its own verified photo.
  // There is NO keyword/bucket fallback — we never borrow another family's
  // scene. When a family has no real photo yet, `realScene` stays null and the
  // header renders a clean color-accurate door panel (in this family's exact
  // finish) instead of a stock kitchen.
  const realScene = s?.roomSceneImageUrl || null;
  const realDoor = s?.doorSampleImageUrl || null;

  if (styleLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-64 w-full rounded-2xl mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="container py-16 text-center">
        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <h2 className="font-serif text-2xl font-bold mb-2">Door Style Not Found</h2>
        <p className="text-muted-foreground mb-4">
          We couldn't find a door style with code "{styleCode}".
        </p>
        <Link
          href="/styles"
          className="text-sm font-medium text-primary hover:underline"
        >
          Browse all door styles
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <Link
        href="/styles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All door styles
      </Link>

      {/* ── Family header: room scene + sample door + the facts ───────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border mb-8">
        {realScene ? (
          <img
            src={realScene}
            alt={`${familyName} kitchen room scene`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // No verified photo for this family yet — fill the backdrop with this
          // family's EXACT finish color (never another family's kitchen).
          <div
            className="absolute inset-0"
            style={{ backgroundColor: finish }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/92 via-[var(--color-navy)]/75 to-transparent" />
        <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-6 p-6 md:p-10 items-center">
          <div className="max-w-xl">
            <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-2">
              Door Style Collection
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-white mb-3">
              {familyName}
            </h1>
            <p className="text-white/85 text-sm md:text-base mb-5">
              Shop the complete {familyName} kitchen — base, wall, tall, vanity and
              trim, all in this one finish, with member trade pricing built in.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
              {s.doorStyle && (
                <p className="text-white/90">
                  <span className="text-white/60">Door:</span> {s.doorStyle}
                </p>
              )}
              {s.woodSpecies && (
                <p className="text-white/90">
                  <span className="text-white/60">Wood:</span> {s.woodSpecies}
                </p>
              )}
              {s.finish && (
                <p className="text-white/90">
                  <span className="text-white/60">Finish:</span> {s.finish}
                </p>
              )}
              {s.color && (
                <p className="text-white/90">
                  <span className="text-white/60">Color:</span> {s.color}
                </p>
              )}
            </div>

            {/* In-place finish picker: switch the color within this door profile
                without leaving the family. Current color is highlighted. */}
            {siblings.length > 1 && (
              <div className="mt-6">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-2">
                  Choose your finish
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {siblings.map((sib) => {
                    const isCurrent = sib.id === s.id;
                    const sc = finishColors(sib.color || sib.ourName || sib.styleCode);
                    const label = sib.color || sib.ourName || sib.styleCode;
                    return (
                      <Link
                        key={sib.id}
                        href={`/family/${sib.styleCode}`}
                        title={label}
                        aria-label={`View ${label} finish`}
                        className={`group/sw relative flex flex-col items-center gap-1 outline-none`}
                      >
                        <span
                          className={`block h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-navy)] transition-transform duration-150 group-hover/sw:scale-110 ${
                            isCurrent
                              ? "ring-[var(--color-gold)]"
                              : "ring-white/30 group-hover/sw:ring-white/70"
                          }`}
                          style={{ backgroundColor: sc.face }}
                        />
                        <span
                          className={`max-w-[4.5rem] truncate text-[10px] leading-tight text-center ${
                            isCurrent ? "text-white font-semibold" : "text-white/60"
                          }`}
                        >
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compact door+finish swatch for mobile (the large sample is desktop-only). */}
          <div className="md:hidden mt-4 flex items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-white/40">
            {realDoor ? (
              <img
                src={realDoor}
                alt={`${familyName} door sample`}
                className="h-16 w-14 shrink-0 rounded object-cover ring-1 ring-border"
              />
            ) : (
              <DoorStyleSwatch style={s} className="h-16 w-14 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {familyName} door &amp; finish
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {[s.doorStyle, s.color].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {/* Sample door for this family. Use the color-accurate swatch (recolored
              to THIS family's exact finish) as the primary, so a black family shows
              a black door and an oak family shows an oak door. The generic panel
              profile photo is shown small underneath for door-profile reference. */}
          <div className="hidden md:flex items-center justify-center">
            <div className="rounded-xl bg-white/95 p-4 shadow-xl ring-1 ring-white/40">
              {realDoor ? (
                <img
                  src={realDoor}
                  alt={`${familyName} door sample`}
                  className="h-44 w-44 rounded-lg object-cover ring-1 ring-border"
                />
              ) : (
                <DoorStyleSwatch style={s} className="h-44 w-auto" />
              )}
              <p className="text-center text-[11px] text-muted-foreground mt-2">
                {familyName} door &amp; finish
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Type filter + search ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {availableTypes.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveType(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeType === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${familyName} cabinets…`}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Cabinet grid ──────────────────────────────────────────────────────── */}
      {catalogLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-44 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cabinets match this filter</p>
          <p className="text-sm mt-1">Try a different type or clear your search.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Showing {visible.length} cabinet{visible.length === 1 ? "" : "s"} in{" "}
            {familyName}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((item) => (
              <FamilyCabinetCard
                key={item.cabinetId}
                item={item}
                finish={finish}
                styleId={s.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
