import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useFamilyLock, type LockedFamily } from "@/hooks/useFamilyLock";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { doorFamilyPhoto, kitchenSceneFor } from "@/lib/doorFamilyPhotos";
import {
  STOREFRONT_STRINGS,
  type Lang,
  type StringKey,
} from "@/lib/storefrontI18n";
import {
  ArrowRight, Check, Lock, RefreshCw, Sparkles, Search, Truck, ChevronRight,
} from "lucide-react";

type Brand = { primary: string; accent: string };

type SwatchStyle = {
  styleCode?: string | null;
  ourName?: string | null;
  name?: string | null;
  doorStyle?: string | null;
  color?: string | null;
  finish?: string | null;
  woodSpecies?: string | null;
};

/**
 * Shows the line's photo when it loads, otherwise (empty URL OR broken/missing
 * file) renders the code-generated DoorStyleSwatch so a card is never blank.
 */
function FamilyCardImage({
  src,
  alt,
  style,
  imgClassName,
  swatchClassName,
}: {
  src?: string | null;
  alt: string;
  style: SwatchStyle;
  imgClassName?: string;
  swatchClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  if (showImg) {
    return (
      <img
        src={src as string}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={imgClassName}
      />
    );
  }
  return (
    <div className={swatchClassName}>
      <DoorStyleSwatch style={style} className="h-full w-full" />
    </div>
  );
}

function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>) {
  const table = STOREFRONT_STRINGS[lang] ?? STOREFRONT_STRINGS.en;
  let s: string = table[key] ?? STOREFRONT_STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

function money(v: unknown): string {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Family-locked shopping surface. Until a family (cabinet line) is chosen it
 * shows the line picker. Once locked, all browsing is scoped to that one line
 * (single distributor → single shipment).
 */
export function StorefrontShop({
  slug,
  brand,
  lang,
  withRef,
}: {
  slug: string;
  brand: Brand;
  lang: Lang;
  withRef: (path: string) => string;
}) {
  const { family, lock, clear } = useFamilyLock(slug);

  if (!family) {
    return <FamilyPicker brand={brand} lang={lang} onPick={lock} />;
  }
  return (
    <LockedCatalog
      family={family}
      brand={brand}
      lang={lang}
      withRef={withRef}
      onSwitch={clear}
    />
  );
}

// ─── Line picker ────────────────────────────────────────────────────────────
function FamilyPicker({
  brand,
  lang,
  onPick,
}: {
  brand: Brand;
  lang: Lang;
  onPick: (f: LockedFamily) => void;
}) {
  const { data, isLoading } = trpc.storefront.families.useQuery();

  return (
    <section id="shop" className="py-16 md:py-20">
      <div className="container">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">
            {t(lang, "family_pick_title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(lang, "family_pick_sub")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        ) : !data || data.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">—</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((f) => {
              // We sell the dream kitchen, not a door: lead with a full-room
              // lifestyle scene (RTA-retailer style). The color-accurate door
              // swatch is demoted to a small detail chip overlaid on the scene.
              const scene = kitchenSceneFor({
                doorStyle: [f.doorStyle, f.color, f.name, f.woodSpecies]
                  .filter(Boolean)
                  .join(" "),
              });
              return (
                <button
                  key={f.styleId}
                  type="button"
                  onClick={() =>
                    onPick({
                      styleId: f.styleId,
                      distributorId: f.distributorId,
                      name: f.name,
                      doorStyle: f.doorStyle,
                      finish: f.finish,
                      color: f.color,
                      thumbnailImageUrl: f.thumbnailImageUrl,
                      roomSceneImageUrl: f.roomSceneImageUrl,
                    })
                  }
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ ['--tw-ring-color' as string]: brand.accent }}
                >
                  {/* Full kitchen scene hero */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <img
                      src={scene}
                      alt={`${f.name} kitchen`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {/* gradient for legibility */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                    {f.doorStyle && (
                      <Badge
                        className="absolute left-3 top-3 border-0 text-white shadow-sm"
                        style={{ backgroundColor: brand.primary }}
                      >
                        {f.doorStyle}
                      </Badge>
                    )}
                    {/* Door-style detail swatch chip */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <div className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white/90 shadow-md">
                        <DoorStyleSwatch
                          style={{
                            styleCode: f.styleCode,
                            ourName: f.name,
                            name: f.name,
                            doorStyle: f.doorStyle,
                            color: f.color,
                            finish: f.finish,
                            woodSpecies: f.woodSpecies,
                          }}
                          className="h-full w-full"
                        />
                      </div>
                      <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                        {t(lang, "family_door_detail")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-serif text-lg font-bold leading-tight">{f.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[f.finish, f.color].filter(Boolean).join(" · ") || "\u00A0"}
                    </p>
                    <span
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold text-white transition-transform group-active:scale-[0.98]"
                      style={{ backgroundColor: brand.accent }}
                    >
                      {t(lang, "family_shop_this")} <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Locked catalog ───────────────────────────────────────────────────────────
function LockedCatalog({
  family,
  brand,
  lang,
  withRef,
  onSwitch,
}: {
  family: LockedFamily;
  brand: Brand;
  lang: Lang;
  withRef: (path: string) => string;
  onSwitch: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [subGroup, setSubGroup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset the sub-group whenever the top-level category changes.
  useEffect(() => {
    setSubGroup(null);
  }, [category]);

  const { data: cats } = trpc.storefront.familyCategories.useQuery({ styleId: family.styleId });

  // Accessory has clean display sub-groups (Trim & Molding / Accessories) so the
  // tab never shows a sprawl of micro-categories.
  const { data: accessorySubs } = trpc.storefront.familySubCategories.useQuery(
    { styleId: family.styleId, category: "Accessory" },
    { enabled: category === "Accessory" }
  );

  const catalogInput = useMemo(
    () => ({
      styleId: family.styleId,
      category: category ?? undefined,
      subCategory: category === "Accessory" && subGroup ? subGroup : undefined,
      search: debounced || undefined,
      limit: 60,
    }),
    [family.styleId, category, subGroup, debounced]
  );
  const { data: catalog, isLoading } = trpc.storefront.familyCatalog.useQuery(catalogInput);

  return (
    <section id="shop" className="py-12 md:py-16">
      <div className="container">
        {/* Dream-kitchen scene banner for the locked line */}
        <div className="relative mb-4 overflow-hidden rounded-2xl">
          <img
            src={kitchenSceneFor({
              doorStyle: [family.doorStyle, family.color, family.name]
                .filter(Boolean)
                .join(" "),
            })}
            alt={`${family.name} kitchen`}
            className="h-44 w-full object-cover sm:h-56"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white/85">
              <Lock className="h-3 w-3" /> {t(lang, "family_locked_label")}
            </div>
            <h2 className="font-serif text-2xl font-bold text-white drop-shadow sm:text-3xl">
              {family.name}
            </h2>
            {[family.finish, family.color].filter(Boolean).length > 0 && (
              <p className="text-sm text-white/85">
                {[family.finish, family.color].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Lock banner */}
        <div
          className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <FamilyCardImage
              src={doorFamilyPhoto({ doorStyle: family.doorStyle }) || family.thumbnailImageUrl || family.roomSceneImageUrl}
              alt={family.name}
              style={{
                ourName: family.name,
                name: family.name,
                doorStyle: family.doorStyle,
                color: family.color,
                finish: family.finish,
              }}
              imgClassName="h-12 w-12 rounded-lg object-cover"
              swatchClassName="h-12 w-12 overflow-hidden rounded-lg"
            />
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Lock className="h-3 w-3" /> {t(lang, "family_locked_label")}
              </div>
              <div className="font-serif text-lg font-bold leading-tight" style={{ color: brand.primary }}>
                {family.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={onSwitch}>
              <RefreshCw className="h-3.5 w-3.5" /> {t(lang, "family_switch")}
            </Button>
          </div>
        </div>

        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4" style={{ color: brand.accent }} />
          {t(lang, "family_one_line_note")}
        </p>

        {/* AI recommender */}
        <Recommender family={family} brand={brand} lang={lang} />

        {/* Category tabs + search */}
        <div className="mt-8 mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategory(null)}
              className="rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors"
              style={
                category === null
                  ? { backgroundColor: brand.primary, color: "#fff", borderColor: brand.primary }
                  : { borderColor: "var(--border)" }
              }
            >
              {t(lang, "shop_view_all")}
            </button>
            {(cats ?? []).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors"
                style={
                  category === c
                    ? { backgroundColor: brand.primary, color: "#fff", borderColor: brand.primary }
                    : { borderColor: "var(--border)" }
                }
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, "rec_placeholder")}
              className="pl-9"
            />
          </div>
        </div>

        {/* Accessory sub-group tabs (Trim & Molding / Accessories) — only the
            consolidated groups, never a sprawl of micro-categories. */}
        {category === "Accessory" && (accessorySubs?.length ?? 0) > 0 && (
          <div className="-mt-2 mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setSubGroup(null)}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={
                subGroup === null
                  ? { backgroundColor: brand.accent, color: "#fff", borderColor: brand.accent }
                  : { borderColor: "var(--border)" }
              }
            >
              {t(lang, "shop_view_all")}
            </button>
            {(accessorySubs ?? []).map((g) => (
              <button
                key={g}
                onClick={() => setSubGroup(g)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={
                  subGroup === g
                    ? { backgroundColor: brand.accent, color: "#fff", borderColor: brand.accent }
                    : { borderColor: "var(--border)" }
                }
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Catalog grid */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        ) : !catalog || catalog.items.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{t(lang, "rec_empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {catalog.items.map((it) => (
              <CatalogCard
                key={it.id}
                item={it}
                styleId={family.styleId}
                brand={brand}
                lang={lang}
              />
            ))}
          </div>
        )}

        {/* Shipping note + continue */}
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-border pt-8 text-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4" /> {t(lang, "ship_not_included")}
          </p>
          <Link href={withRef("/order/new")}>
            <Button size="lg" className="gap-2 font-semibold text-white" style={{ backgroundColor: brand.accent }}>
              {t(lang, "family_continue_quote")} <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Catalog card (with glass-door upsell on solid wall cabinets) ──────────────
type CatalogItem = {
  id: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  homeownerPrice: unknown;
};

function CatalogCard({
  item,
  styleId,
  brand,
  lang,
}: {
  item: CatalogItem;
  styleId: number;
  brand: Brand;
  lang: Lang;
}) {
  const [glass, setGlass] = useState(false);

  // Only solid WALL cabinets are eligible to offer a glass-door swap. The query
  // returns null for anything else (oven/tall/base, or no buyable GD twin), so
  // the prompt simply never appears for those.
  const eligible =
    item.category === "Wall" && !item.masterCode.toUpperCase().endsWith("GD");
  const { data: upsell } = trpc.storefront.glassDoorUpsell.useQuery(
    { styleId, masterCode: item.masterCode },
    { enabled: eligible }
  );

  const showing = glass && upsell ? upsell : item;
  const code = showing.masterCode;
  const description = showing.description;
  const price = showing.homeownerPrice;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold" style={{ color: brand.primary }}>
          {code}
        </span>
        {item.category && (
          <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
        )}
      </div>
      <p className="line-clamp-2 text-sm text-foreground">{description}</p>

      {/* Glass-door upsell — only when a buyable GD twin exists for this line. */}
      {upsell && (
        <button
          type="button"
          onClick={() => setGlass((g) => !g)}
          className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
          style={
            glass
              ? { backgroundColor: brand.accent, color: "#fff", borderColor: brand.accent }
              : { borderColor: "var(--border)", color: brand.accent }
          }
        >
          <Sparkles className="h-3 w-3" />
          {glass ? t(lang, "glass_upsell_add") : t(lang, "glass_upsell_q")}
        </button>
      )}

      <div className="mt-auto pt-3">
        <div className="font-serif text-lg font-bold">{money(price)}</div>
      </div>
    </div>
  );
}

// ─── Family-locked recommender ────────────────────────────────────────────────
function Recommender({
  family,
  brand,
  lang,
}: {
  family: LockedFamily;
  brand: Brand;
  lang: Lang;
}) {
  const [intent, setIntent] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, isFetching } = trpc.storefront.recommendForIntent.useQuery(
    { styleId: family.styleId, intent: submitted ?? "", limit: 6 },
    { enabled: !!submitted }
  );

  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: brand.accent }} />
        <h3 className="font-serif text-lg font-bold">{t(lang, "rec_title")}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t(lang, "rec_sub")}</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(intent.trim());
        }}
      >
        <Input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={t(lang, "rec_placeholder")}
        />
        <Button
          type="submit"
          className="font-semibold text-white"
          style={{ backgroundColor: brand.primary }}
          disabled={!intent.trim()}
        >
          {t(lang, "rec_btn")}
        </Button>
      </form>

      {submitted && (
        <div className="mt-4">
          {isFetching ? (
            <div className="flex justify-center py-4"><Spinner className="h-5 w-5" /></div>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(lang, "rec_empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(data.items as Array<{ id: number; masterCode: string; description: string | null; homeownerPrice: unknown }>).map((it) => (
                <div key={it.id} className="rounded-lg border border-border bg-card p-3">
                  <span className="font-mono text-xs font-semibold" style={{ color: brand.primary }}>
                    {it.masterCode}
                  </span>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{it.description}</p>
                  <div className="mt-1 text-sm font-bold">{money(it.homeownerPrice)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
