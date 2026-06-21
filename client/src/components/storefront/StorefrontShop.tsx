import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useFamilyLock, type LockedFamily } from "@/hooks/useFamilyLock";
import {
  STOREFRONT_STRINGS,
  type Lang,
  type StringKey,
} from "@/lib/storefrontI18n";
import {
  ArrowRight, Check, Lock, RefreshCw, Sparkles, Search, Truck, ChevronRight,
} from "lucide-react";

type Brand = { primary: string; accent: string };

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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((f) => {
              const img = f.roomSceneImageUrl || f.thumbnailImageUrl || f.doorSampleImageUrl;
              return (
                <div
                  key={f.styleId}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {img ? (
                      <img
                        src={img}
                        alt={f.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {f.name}
                      </div>
                    )}
                    {f.doorStyle && (
                      <Badge
                        className="absolute left-3 top-3 border-0 text-white"
                        style={{ backgroundColor: brand.primary }}
                      >
                        {f.doorStyle}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-serif text-lg font-bold leading-tight">{f.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[f.finish, f.color].filter(Boolean).join(" · ") || "\u00A0"}
                    </p>
                    <Button
                      className="mt-4 w-full gap-2 font-semibold text-white"
                      style={{ backgroundColor: brand.accent }}
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
                    >
                      {t(lang, "family_shop_this")} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data: cats } = trpc.storefront.familyCategories.useQuery({ styleId: family.styleId });
  const catalogInput = useMemo(
    () => ({
      styleId: family.styleId,
      category: category ?? undefined,
      search: debounced || undefined,
      limit: 60,
    }),
    [family.styleId, category, debounced]
  );
  const { data: catalog, isLoading } = trpc.storefront.familyCatalog.useQuery(catalogInput);

  return (
    <section id="shop" className="py-12 md:py-16">
      <div className="container">
        {/* Lock banner */}
        <div
          className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            {(family.thumbnailImageUrl || family.roomSceneImageUrl) && (
              <img
                src={family.thumbnailImageUrl || family.roomSceneImageUrl || ""}
                alt={family.name}
                className="h-12 w-12 rounded-lg object-cover"
              />
            )}
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

        {/* Catalog grid */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        ) : !catalog || catalog.items.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{t(lang, "rec_empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {catalog.items.map((it) => (
              <div key={it.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold" style={{ color: brand.primary }}>
                    {it.masterCode}
                  </span>
                  {it.category && (
                    <Badge variant="secondary" className="text-[10px]">{it.category}</Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-sm text-foreground">{it.description}</p>
                <div className="mt-auto pt-3">
                  <div className="font-serif text-lg font-bold">{money(it.homeownerPrice)}</div>
                </div>
              </div>
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
