import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Package, Search, X, Expand, Minus, Plus, ShoppingCart, Check, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CabinetImage } from "@/components/CabinetImage";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { realImageUrl } from "@/lib/doorFamilyPhotos";
import { finishColors } from "@/lib/design";
import { type CabinetLike, cabinetTypeLabel } from "@/lib/cabinetGraphics";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { translateSpec } from "@/lib/i18n/specPhrases";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  resolveStorefrontTier,
  resolveTierPrice,
  tierLabel,
  type PricingTier,
} from "@shared/pricingTier";

// ─────────────────────────────────────────────────────────────────────────────
// Family page — the DOOR-STYLE-FAMILY-first shopping experience.
//
// A door style (e.g. "Silver Shaker" / Hickory) IS the product line. Landing
// here shows the family's room scene + sample door + facts, then EVERY cabinet
// available in that family (base, wall, tall, vanity, accessory) together,
// filterable by type. Each cabinet is drawn to scale and recolored to this
// family's real finish so the picture always matches the actual item.
// ─────────────────────────────────────────────────────────────────────────────

interface FamilyStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  featuredLabel?: string | null;
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
  // Pricing + supply line for on-card price + add-to-cart
  listPrice?: string | null;
  adjustedListPrice?: string | null;
  wholesalePrice?: string | null;
  contractorPrice?: string | null;
  homeownerPrice?: string | null;
  distributorId?: number | null;
}

function fmtPrice(n: number | null): string {
  if (n == null) return "";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// Group the DB categories into the buyer-facing room-section filters.
const TYPE_FILTERS: { key: string; labelKey: string; match: (cat: string) => boolean }[] = [
  { key: "all", labelKey: "fam_f_all", match: () => true },
  { key: "base", labelKey: "fam_f_base", match: (c) => c === "base" },
  { key: "wall", labelKey: "fam_f_wall", match: (c) => c === "wall" },
  { key: "tall", labelKey: "fam_f_tall", match: (c) => c === "tall" },
  { key: "vanity", labelKey: "fam_f_vanity", match: (c) => c === "vanity" },
  { key: "ada", labelKey: "fam_f_ada", match: (c) => c === "ada" },
  { key: "accessory", labelKey: "fam_f_accessory", match: (c) => c === "accessory" },
];

// ── Favorites helpers ────────────────────────────────────────────────────────
const FAV_KEY = "cabinet-dealz:favorites";

function readFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeFavs(favs: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
}

function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => readFavs());

  const toggle = useCallback((key: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFavs(next);
      return next;
    });
  }, []);

  return { favs, toggle };
}
// ─────────────────────────────────────────────────────────────────────────────

function FamilyCabinetCard({
  item,
  finish,
  styleId,
  styleLabel,
  tier,
  isFavorite,
  onToggleFavorite,
}: {
  item: FamilyItem;
  finish: string;
  styleId: number;
  styleLabel: string;
  tier: PricingTier;
  isFavorite: boolean;
  onToggleFavorite: (key: string) => void;
}) {
  const { lang } = useLanguage();
  const { addItem, lockedDistributorId, lockedStyleLabel } = useCart();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const favKey = `${item.masterCode}::${styleId}`;

  const unitPrice = resolveTierPrice(tier, {
    listPrice: item.listPrice,
    adjustedListPrice: item.adjustedListPrice,
    wholesalePrice: item.wholesalePrice,
    contractorPrice: item.contractorPrice,
    homeownerPrice: item.homeownerPrice,
  });

  function handleAdd() {
    const res = addItem({
      masterCode: item.masterCode,
      name: translateSpec(item.description, lang) || item.masterCode,
      styleId,
      styleLabel,
      distributorId: item.distributorId ?? null,
      tier,
      unitPrice,
      qty,
    });
    if (!res.ok && res.reason === "distributor_locked") {
      toast.error(
        lang === "es"
          ? `Tu carrito ya tiene artículos de “${res.lockedStyleLabel}”. Para evitar cargos de envío extra, todos los artículos deben venir de la misma línea.`
          : `Your cart already has items from “${res.lockedStyleLabel}.” To avoid extra shipping, every item must come from the same supply line.`,
      );
      return;
    }
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
    toast.success(
      lang === "es"
        ? `Añadido: ${qty} × ${item.masterCode}`
        : `Added ${qty} × ${item.masterCode} to cart`,
    );
  }

  // A friendly note when this card is from a different supply line than the
  // one the cart is already locked to (add is blocked to protect freight).
  const blockedByLock =
    lockedDistributorId != null &&
    item.distributorId != null &&
    item.distributorId !== lockedDistributorId;

  return (
    <div className="cabinet-card group rounded-xl border border-border bg-card hover:border-primary/40 overflow-hidden transition-colors flex flex-col">
      {/* Image + specs link through to the detail page */}
      <Link href={`/catalog/${item.masterCode}?style=${styleId}`} className="block">
        <div className="relative h-44 bg-gradient-to-b from-white to-muted/30 flex items-center justify-center border-b border-border p-3 cursor-pointer">
          {/* Heart / favorite button */}
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(favKey); }}
            className={`absolute top-2 right-2 z-10 h-7 w-7 flex items-center justify-center rounded-full transition-all duration-150 ${
              isFavorite
                ? "bg-rose-50 text-rose-500 scale-110"
                : "bg-white/70 text-muted-foreground hover:text-rose-400 hover:bg-rose-50 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-rose-500" : ""}`} />
          </button>
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

        <div className="p-4 pb-2 cursor-pointer">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {item.masterCode}
            </span>
            <Badge variant="secondary" className="text-xs shrink-0">
              {cabinetTypeLabel(item)}
            </Badge>
          </div>

          <p className="text-sm font-medium text-foreground mt-2 leading-snug line-clamp-2">
            {translateSpec(item.description, lang)}
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
        </div>
      </Link>

      {/* Price + quantity + add-to-cart (NOT inside the Link) */}
      <div className="mt-auto px-4 pb-4">
        <div className="flex items-end justify-between gap-2 mb-2">
          <div>
            {unitPrice != null ? (
              <>
                <span className="text-lg font-bold text-foreground">{fmtPrice(unitPrice)}</span>
                <span className="ml-1 text-[11px] text-muted-foreground">/ ea</span>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {tierLabel(tier)}
                </div>
              </>
            ) : (
              <Link
                href={`/catalog/${item.masterCode}?style=${styleId}`}
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {lang === "es" ? "Ver precio" : "View pricing"}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {/* Quantity stepper */}
          {unitPrice != null && (
            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                aria-label={lang === "es" ? "Disminuir cantidad" : "Decrease quantity"}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                disabled={qty <= 1}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setQty(Number.isFinite(n) && n >= 1 ? n : 1);
                }}
                className="h-8 w-10 border-x border-border bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label={lang === "es" ? "Cantidad" : "Quantity"}
              />
              <button
                type="button"
                aria-label={lang === "es" ? "Aumentar cantidad" : "Increase quantity"}
                onClick={() => setQty((q) => q + 1)}
                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {unitPrice != null && (
          <Button
            onClick={handleAdd}
            className="w-full bg-[var(--color-navy,#1a2b4a)] text-white"
            size="sm"
          >
            {justAdded ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-4 w-4" />
                {lang === "es" ? "Añadido" : "Added"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <ShoppingCart className="h-4 w-4" />
                {lang === "es" ? "Añadir al carrito" : "Add to cart"}
              </span>
            )}
          </Button>
        )}

        {blockedByLock && (
          <p className="mt-1.5 text-[10px] leading-tight text-amber-700">
            {lang === "es"
              ? `El carrito está bloqueado a “${lockedStyleLabel}”. Este artículo es de otra línea.`
              : `Cart is locked to “${lockedStyleLabel}.” This item is from another supply line.`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Family({ styleCode }: { styleCode: string }) {
  const { t, lang } = useLanguage();
  const [, navigate] = useLocation();
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const { favs, toggle: toggleFav } = useFavorites();

  // Smart back: use browser history if available, otherwise go to /styles
  const handleBack = useCallback(() => {
    if (window.history.length > 1 && document.referrer && !document.referrer.includes('/family/')) {
      window.history.back();
    } else {
      navigate('/styles');
    }
  }, [navigate]);


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

  // The viewer's storefront tier drives which price shows on each card.
  const { user } = useAuth();
  const viewerTier = resolveStorefrontTier(user);

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

  const s = style as FamilyStyle | null;

  const visible = useMemo(() => {
    const f = TYPE_FILTERS.find((t) => t.key === activeType) ?? TYPE_FILTERS[0];
    return items.filter((i) => {
      if (!f.match((i.category ?? "").toLowerCase())) return false;
      if (debounced) {
        const hay = `${i.masterCode} ${i.description ?? ""} ${i.subCategory ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      if (showFavsOnly && !favs.has(`${i.masterCode}::${s?.id ?? 0}`)) return false;
      return true;
    });
  }, [items, activeType, debounced, showFavsOnly, favs, s?.id]);
  // Prefer white-label name (set by admin) over internal name for all public display.
  const familyName = s?.featuredLabel || s?.ourName || s?.styleCode || "Door Style";
  useSeo({
    title: t("seo_family_t", { name: familyName }),
    description: t("seo_family_d", { name: familyName }),
    image: (s as FamilyStyle | null)?.roomSceneImageUrl || undefined,
    lang,
  });
  // STRICT ONE-FAMILY-ONE-COLOR: a family shows ONLY its own verified photo.
  // There is NO keyword/bucket fallback — we never borrow another family's
  // scene. When a family has no real photo yet, `realScene` stays null and the
  // header renders a clean color-accurate door panel (in this family's exact
  // finish) instead of a stock kitchen.
  const realScene = realImageUrl(s?.roomSceneImageUrl);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const realDoor = realImageUrl(s?.doorSampleImageUrl);

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
        <h2 className="font-serif text-2xl font-bold mb-2">{t("fam_not_found_title")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("fam_not_found_body", { code: styleCode })}
        </p>
        <Link
          href="/styles"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("fam_browse_all")}
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("fam_back")}
      </button>

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
              {t("fam_collection")}
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-white mb-3">
              {familyName}
            </h1>
            <p className="text-white/85 text-sm md:text-base mb-5">
              {t("fam_intro", { name: familyName })}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
              {s.doorStyle && (
                <p className="text-white/90">
                  <span className="text-white/60">{t("fam_door")}</span> {s.doorStyle}
                </p>
              )}
              {s.woodSpecies && (
                <p className="text-white/90">
                  <span className="text-white/60">{t("fam_wood")}</span> {s.woodSpecies}
                </p>
              )}
              {s.finish && (
                <p className="text-white/90">
                  <span className="text-white/60">{t("fam_finish")}</span> {s.finish}
                </p>
              )}
              {s.color && (
                <p className="text-white/90">
                  <span className="text-white/60">{t("fam_color")}</span> {s.color}
                </p>
              )}
            </div>

            {/* In-place finish picker: switch the color within this door profile
                without leaving the family. Current color is highlighted. */}
            {siblings.length > 1 && (
              <div className="mt-6">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-2">
                  {t("fam_choose_finish")}
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

          {/* Mobile: door swatch + room scene side by side */}
          <div className="md:hidden mt-4 flex gap-2">
            {/* Door swatch */}
            <div className="flex-1 rounded-xl bg-white/95 p-2 shadow-lg ring-1 ring-white/40 flex flex-col items-center">
              {realDoor ? (
                <img
                  src={realDoor}
                  alt={`${familyName} door sample`}
                  className="h-24 w-full rounded object-cover ring-1 ring-border"
                />
              ) : (
                <DoorStyleSwatch style={s} className="h-24 w-full" />
              )}
              <p className="text-[10px] text-muted-foreground mt-1 text-center truncate w-full">
                {t("fam_door_finish")}
              </p>
            </div>
            {/* Room scene */}
            <div className="flex-1 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/40 flex flex-col">
              {realScene ? (
                <div className="relative group cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
                  <img
                    src={realScene}
                    alt={`${familyName} kitchen room scene`}
                    className="h-24 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Expand className="text-white opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 drop-shadow" />
                  </div>
                </div>
              ) : (
                <div
                  className="h-24 w-full flex items-center justify-center text-[10px] text-white/60"
                  style={{ backgroundColor: finish }}
                >
                  Room scene coming soon
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1 text-center bg-white/95 py-0.5">
                Room Scene
              </p>
            </div>
          </div>

          {/* Desktop: door swatch + room scene side by side */}
          <div className="hidden md:flex items-center justify-center gap-3">
            {/* Door swatch card */}
            <div className="rounded-xl bg-white/95 p-4 shadow-xl ring-1 ring-white/40 flex flex-col items-center">
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
                {familyName} {t("fam_door_finish")}
              </p>
            </div>
            {/* Room scene card */}
            <div className="rounded-xl overflow-hidden shadow-xl ring-1 ring-white/40 flex flex-col">
              {realScene ? (
                <div className="relative group cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
                  <img
                    src={realScene}
                    alt={`${familyName} kitchen room scene`}
                    className="h-44 w-44 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Expand className="text-white opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 drop-shadow" />
                  </div>
                </div>
              ) : (
                <div
                  className="h-44 w-44 flex items-center justify-center text-[11px] text-white/60"
                  style={{ backgroundColor: finish }}
                >
                  Room scene coming soon
                </div>
              )}
              <p className="text-center text-[11px] text-muted-foreground bg-white/95 py-2">
                {familyName} kitchen
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lightbox (portal to body so no parent clip/transform can block it) ── */}
      {lightboxOpen && realScene && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={realScene}
            alt={`${familyName} kitchen room scene`}
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {familyName} kitchen
          </p>
        </div>,
        document.body
      )}

      {/* ── Type filter + search ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
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
              {t(f.labelKey as never)}
            </button>
          ))}
          {/* end type filters */}
          {/* Favorites toggle */}
          {favs.size > 0 && (
            <button
              onClick={() => setShowFavsOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                showFavsOnly
                  ? "bg-rose-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${showFavsOnly ? "fill-white" : ""}`} />
              {lang === "es" ? `Favoritos (${favs.size})` : `Favorites (${favs.size})`}
            </button>
          )}
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("fam_search_ph", { name: familyName })}
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
          <p className="font-medium">{t("fam_no_match_title")}</p>
          <p className="text-sm mt-1">{t("fam_no_match_body")}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {t("fam_showing_label", { name: familyName })}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((item) => (
              <FamilyCabinetCard
                key={item.cabinetId}
                item={item}
                finish={finish}
                styleId={s.id}
                styleLabel={familyName}
                tier={viewerTier}
                isFavorite={favs.has(`${item.masterCode}::${s.id}`)}
                onToggleFavorite={toggleFav}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
