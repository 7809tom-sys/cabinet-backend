import { Link } from "wouter";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ArrowRight, Grid3X3, Palette, Ruler, FileSpreadsheet, Users, ChevronRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

import { KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";


const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M";

// ─── 4th of July Banner ──────────────────────────────────────────────────────

function JulyBanner() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-blue-900 via-red-700 to-blue-900 text-white py-3">
      {/* Animated stars */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute text-white/30 animate-pulse"
            style={{
              left: `${8 + i * 8}%`,
              top: `${i % 2 === 0 ? 20 : 60}%`,
              animationDelay: `${i * 0.2}s`,
            }}
          >
            ★
          </div>
        ))}
      </div>
      <div className="container relative flex items-center justify-center gap-3 text-center">
        <span className="text-lg">🇺🇸</span>
        <p className="text-sm md:text-base font-semibold tracking-wide">
          Happy 4th of July! Celebrate Independence Day with trade pricing on everything for your next project.
        </p>
        <span className="text-lg">🎆</span>
      </div>
    </div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function Hero() {
  const { t } = useLanguage();
  return (
    <section className="relative overflow-hidden bg-[var(--color-navy)] text-white">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 40px,
            rgba(255,255,255,0.03) 40px,
            rgba(255,255,255,0.03) 80px
          )`
        }}
      />
      <div className="relative container py-16 md:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: copy + CTAs */}
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gold)]" />
              {t("home_hero_badge")}
            </div>

            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Your One-Stop Shop for
              <br />
              <span className="text-[var(--color-gold)]">Kitchen & Bath.</span>
            </h1>

            <p className="text-lg md:text-xl text-white/75 mb-8 leading-relaxed">
              Cabinets, countertops, tile, flooring, sinks, faucets, showers, and toilets — all at trade pricing. Design kitchens in 2D, browse thousands of products, and submit orders in one membership.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Link href="/styles">
                <Button size="lg" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold gap-2">
                  Shop Cabinets
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/surfaces">
                <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                  Surfaces & Fixtures
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/plumbers-choice">
                <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                  Plumber's Choice
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/design">
                <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                  Design Your Kitchen
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: kitchen lifestyle collage */}
          <div className="relative hidden lg:block">
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <img
                src={KITCHEN_SCENES["shaker-white"]}
                alt="Beautiful white shaker kitchen"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden w-40 overflow-hidden rounded-xl shadow-xl ring-4 ring-[var(--color-navy)] xl:block">
              <img
                src={`${CDN}/stonecreek-bath-hero-fCp9GA4H5XXQNmpgUdMiWg.webp`}
                alt="StoneCreek bathroom fixtures"
                className="aspect-square w-full object-cover"
              />
            </div>
            <div className="absolute -right-5 -top-5 hidden w-32 overflow-hidden rounded-xl shadow-xl ring-4 ring-[var(--color-navy)] xl:block">
              <img
                src={KITCHEN_SCENES["raised-cherry"]}
                alt="Cherry kitchen"
                className="aspect-square w-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Value props row */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-white/15 pt-10">
          {[
            { value: "Cabinets", label: "Full catalog, every door style" },
            { value: "Surfaces", label: "Quartz, tile, flooring & more" },
            { value: "Fixtures", label: "Sinks, faucets, showers, toilets" },
            { value: "Design", label: "2D kitchen planner included" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl md:text-3xl font-bold text-[var(--color-gold)]">{stat.value}</div>
              <div className="text-sm text-white/60 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Featured Door Styles (from DB) ─────────────────────────────────────────

function FeaturedStyles() {
  const { data: featured, isLoading } = trpc.doorStyles.featured.useQuery();

  // Deduplicate by styleCode (keep first/lowest id per code)
  const uniqueFeatured = useMemo(() => {
    if (!featured) return [];
    const seen = new Set<string>();
    return featured.filter((s) => {
      const code = (s as { styleCode?: string | null }).styleCode ?? String(s.id);
      if (seen.has(code)) return false;
      seen.add(code);
      return true;
    });
  }, [featured]);

  if (isLoading) {
    return (
      <section className="py-16 md:py-20">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-6">
            {[1,2,3].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!uniqueFeatured.length) return null;

  const [first, ...rest] = uniqueFeatured;

  return (
    <section className="py-16 md:py-20">
      <div className="container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-3">
            <span className="h-px w-8 bg-[var(--color-wood)]" />
            Featured Door Styles
            <span className="h-px w-8 bg-[var(--color-wood)]" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            Find Your Perfect Kitchen Style
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Browse our most popular door styles — each available in multiple finishes. Shop the full catalog or jump straight into the 2D design tool.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Hero style — large card */}
          <Link
            href={`/family/${encodeURIComponent((first as { styleCode?: string | null }).styleCode ?? String(first.id))}`}
            className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 md:row-span-2"
          >
            <img
              src={(first as { roomSceneImageUrl?: string | null }).roomSceneImageUrl ?? KITCHEN_SCENES["shaker-white"]}
              alt={(first as { ourName?: string | null }).ourName ?? "Featured Style"}
              className="h-72 w-full object-cover transition-transform duration-500 group-hover:scale-105 md:h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              {(first as { featuredLabel?: string | null }).featuredLabel && (
                <span className="inline-block text-xs font-bold uppercase tracking-wider text-[var(--color-gold)] bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/30 rounded-full px-3 py-0.5 mb-2">
                  {(first as { featuredLabel?: string | null }).featuredLabel}
                </span>
              )}
              <h3 className="font-serif text-2xl font-bold text-white mb-1">
                {(first as { ourName?: string | null }).ourName ?? (first as { styleCode?: string | null }).styleCode}
              </h3>
              <p className="text-sm text-white/75 mb-4">
                {[(first as { doorStyle?: string | null }).doorStyle, (first as { woodSpecies?: string | null }).woodSpecies].filter(Boolean).join(" · ") || "Premium cabinet door style"}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-gold)] group-hover:gap-2.5 transition-all">
                  Shop this style <ArrowRight className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/design?style=${first.id}`; }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 transition-all"
                >
                  <ChevronRight className="h-3.5 w-3.5" /> Design with this
                </button>
              </div>
            </div>
          </Link>

          {/* Remaining featured styles — smaller cards */}
          <div className="grid grid-cols-2 gap-6">
            {rest.slice(0, 4).map((style) => (
              <div key={style.id} className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300">
                <Link href={`/family/${encodeURIComponent((style as { styleCode?: string | null }).styleCode ?? String(style.id))}`}>
                  <img
                    src={(style as { roomSceneImageUrl?: string | null }).roomSceneImageUrl ?? KITCHEN_SCENES["shaker-white"]}
                    alt={(style as { ourName?: string | null }).ourName ?? "Style"}
                    className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-48"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    {(style as { featuredLabel?: string | null }).featuredLabel && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gold)] block mb-0.5">
                        {(style as { featuredLabel?: string | null }).featuredLabel}
                      </span>
                    )}
                    <div className="font-serif text-sm font-bold text-white leading-tight">
                      {(style as { ourName?: string | null }).ourName ?? (style as { styleCode?: string | null }).styleCode}
                    </div>
                  </div>
                </Link>
                {/* Design with this button */}
                <Link
                  href={`/design?style=${style.id}`}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-navy)]/80 hover:bg-[var(--color-navy)] text-white text-[10px] font-semibold rounded-full px-2.5 py-1 flex items-center gap-1"
                >
                  <ChevronRight className="h-3 w-3" /> Design
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/styles">
            <Button size="lg" variant="outline" className="gap-2 bg-card">
              Browse All Door Styles <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/design">
            <Button size="lg" className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 gap-2">
              Start Designing Your Kitchen <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Product Category Showcase ───────────────────────────────────────────────

function ProductShowcase() {
  const categories = [
    {
      title: "Countertops & Tile",
      description: "Premium quartz slabs, porcelain tile, mosaic backsplash, and luxury flooring options.",
      image: KITCHEN_SCENES["slab-natural"],
      href: "/surfaces",
      cta: "Browse Surfaces",
      accent: "from-slate-600/80 to-slate-900/90",
    },
    {
      title: "StoneCreek Fixtures",
      description: "Exclusive sinks, faucets, and kitchen accessories. Modern designs at wholesale pricing.",
      image: `${CDN}/stonecreek-kitchen-hero-GNgNkcBRXKeBwSEoXrBMBg.webp`,
      href: "/stonecreek",
      cta: "StoneCreek Collection",
      accent: "from-emerald-600/80 to-emerald-900/90",
    },
    {
      title: "Plumber's Choice",
      description: "Complete bathroom install kits — showers, toilets, and bidets. Everything a plumber needs.",
      image: `${CDN}/stonecreek-bath-hero-fCp9GA4H5XXQNmpgUdMiWg.webp`,
      href: "/plumbers-choice",
      cta: "Shop Plumber's Choice",
      accent: "from-blue-600/80 to-blue-900/90",
    },
  ];

  return (
    <section className="py-12 md:py-16 bg-muted/30">
      <div className="container">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-3">
            <span className="h-px w-8 bg-[var(--color-wood)]" />
            Everything You Need
            <span className="h-px w-8 bg-[var(--color-wood)]" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            One Platform, Every Product
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From countertops to complete bathroom kits — shop everything for your next kitchen or bath project at trade pricing.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <Link key={cat.title} href={cat.href} className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer">
              <img
                src={cat.image}
                alt={cat.title}
                className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${cat.accent} via-transparent to-transparent`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="font-serif text-xl font-bold text-white mb-1">{cat.title}</h3>
                <p className="text-xs text-white/80 mb-3 line-clamp-2">{cat.description}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-gold)] group-hover:gap-2.5 transition-all">
                  {cat.cta} <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Supply Network Strip ─────────────────────────────────────────────────────

function DistributorsStrip() {
  const { t } = useLanguage();
  const styles = ["Shaker", "Raised Panel", "Slim Shaker", "Slab"];
  return (
    <section className="py-10 border-y border-border bg-muted/20">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-sm font-medium text-muted-foreground shrink-0">
            {t("home_strip_label")}
          </p>
          <div className="flex flex-wrap justify-center md:justify-end gap-3">
            {styles.map((name) => (
              <Link
                key={name}
                href={`/styles?door=${encodeURIComponent(name)}`}
                className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Style Showcase (dream-kitchen scenes) ─────────────────────────────────────

function StyleShowcase() {
  const { t } = useLanguage();
  const { data: styles } = trpc.doorStyles.list.useQuery();
  const fallback = useMemo(
    () => [
      { name: "White Shaker", blurb: t("home_showcase_blurb_fallback"), scene: KITCHEN_SCENES["shaker-white"], href: "/styles" },
      { name: "Gray Shaker", blurb: t("home_showcase_blurb_fallback"), scene: KITCHEN_SCENES["shaker-gray"], href: "/styles" },
      { name: "Cherry Raised Panel", blurb: t("home_showcase_blurb_fallback"), scene: KITCHEN_SCENES["raised-cherry"], href: "/styles" },
      { name: "Natural Slab", blurb: t("home_showcase_blurb_fallback"), scene: KITCHEN_SCENES["slab-natural"], href: "/styles" },
      { name: "Espresso Shaker", blurb: t("home_showcase_blurb_fallback"), scene: KITCHEN_SCENES["shaker-espresso"], href: "/styles" },
    ],
    [t]
  );
  const looks = useMemo(() => {
    type S = { id: number; styleCode: string; ourName: string | null; doorStyle: string | null; color: string | null; woodSpecies: string | null; roomSceneImageUrl?: string | null };
    const list = (styles ?? []).filter((s) => !!(s as S).roomSceneImageUrl) as S[];
    if (list.length === 0) return fallback;
    const bucketOf = (s: S) => {
      const t2 = [s.color, s.ourName, s.doorStyle, s.woodSpecies].filter(Boolean).join(" ").toLowerCase();
      if (/black|obsidian|onyx|tricorn|espresso|java|ebony/.test(t2)) return "dark";
      if (/grey|gray|graphite|slate|sage|fog|navy|blue|cobalt/.test(t2)) return "gray";
      if (/cherry|mahogany|chestnut|saddle|autumn|rust|spice/.test(t2)) return "warm";
      if (/oak|honey|natural|maple|hickory|wheat|gold|solstice/.test(t2)) return "light";
      return "white";
    };
    const seen = new Set<string>();
    const picked: S[] = [];
    for (const s of list) {
      const b = bucketOf(s);
      if (seen.has(b)) continue;
      seen.add(b);
      picked.push(s);
      if (picked.length >= 5) break;
    }
    for (const s of list) {
      if (picked.length >= 5) break;
      if (picked.some((p) => p.id === s.id)) continue;
      picked.push(s);
    }
    return picked.map((s) => ({
      name: s.ourName || s.styleCode,
      blurb: [s.doorStyle, s.woodSpecies].filter(Boolean).join(" · ") || t("home_showcase_blurb_fallback"),
      scene: s.roomSceneImageUrl as string,
      href: `/family/${encodeURIComponent(s.styleCode)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, fallback, t]);
  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-3">
            <span className="h-px w-8 bg-[var(--color-wood)]" />
            {t("home_showcase_eyebrow")}
            <span className="h-px w-8 bg-[var(--color-wood)]" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            {t("home_showcase_title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("home_showcase_sub")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Feature the first look large */}
          <Link href={looks[0].href} className="group relative col-span-1 md:row-span-2 overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-lg">
            <img src={looks[0].scene} alt={looks[0].name} className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105 md:h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <div className="font-serif text-2xl font-bold">{looks[0].name}</div>
              <div className="text-sm text-white/85">{looks[0].blurb}</div>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-gold)]">
                {t("home_showcase_shop_this")} <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>

          <div className="grid grid-cols-2 gap-6">
            {looks.slice(1).map((look) => (
              <Link key={look.name} href={look.href} className="group relative overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-lg">
                <img src={look.scene} alt={look.name} className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-48" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="font-serif text-base font-bold leading-tight">{look.name}</div>
                  <div className="text-xs text-white/80">{look.blurb}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link href="/styles">
            <Button size="lg" variant="outline" className="gap-2 bg-card">
              {t("home_showcase_explore_all")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Become an Affiliate ──────────────────────────────────────────────────────

function AffiliatePromo() {
  const advantages = [
    {
      icon: Star,
      title: "Your Own Branded Storefront",
      description: "Get a custom-branded storefront powered by the full Cabinet Dealz catalog. Your name, your brand, our backend.",
    },
    {
      icon: Sparkles,
      title: "Earn on Every Order",
      description: "Every kitchen or bath project that comes through your storefront earns you a commission. No inventory, no risk.",
    },
    {
      icon: Grid3X3,
      title: "Thousands of Products",
      description: "Cabinets, countertops, tile, flooring, sinks, faucets, showers, toilets — your customers get access to everything.",
    },
    {
      icon: Users,
      title: "Trade Pricing Built In",
      description: "Your customers see competitive trade pricing automatically. You don't negotiate — the platform handles it.",
    },
    {
      icon: Palette,
      title: "2D Design Tool Included",
      description: "Your customers can design their kitchen right on your storefront with the built-in 2D planner. No extra software.",
    },
    {
      icon: FileSpreadsheet,
      title: "We Handle Fulfillment",
      description: "Orders ship direct from the supply network. You focus on sales and relationships — we handle the logistics.",
    },
  ];

  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-amber-50 dark:from-emerald-950/20 dark:via-background dark:to-amber-950/20" />
      <div className="relative container">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-5">
            <Sparkles className="h-4 w-4" />
            Affiliate Program
          </div>
          <h2 className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-4">
            Become a Cabinet Dealz Affiliate
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
            Launch your own branded kitchen & bath storefront — backed by the full Cabinet Dealz product catalog, trade pricing, and fulfillment network. Zero inventory. Zero risk. Maximum earning potential.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {advantages.map((adv) => (
            <div key={adv.title} className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="inline-flex p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 mb-4">
                <adv.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-foreground mb-2">{adv.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{adv.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link href="/affiliate">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 px-8 py-6 text-base">
              Start Your Affiliate Storefront
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground mt-3">
            Free to join. No upfront costs. Start earning from day one.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Platform Features ────────────────────────────────────────────────────────

function PlatformFeatures() {
  const { t } = useLanguage();
  const features = [
    { icon: Palette, title: t("home_feat_switcher_t"), description: t("home_feat_switcher_d") },
    { icon: Ruler, title: t("home_feat_design_t"), description: t("home_feat_design_d") },
    { icon: FileSpreadsheet, title: t("home_feat_csv_t"), description: t("home_feat_csv_d") },
    { icon: Grid3X3, title: t("home_feat_ocr_t"), description: t("home_feat_ocr_d") },
  ];

  return (
    <section className="py-16 md:py-20">
      <div className="container">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-4">
              <span className="h-px w-8 bg-[var(--color-wood)]" />
              {t("home_feat_eyebrow")}
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t("home_feat_title")}
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              {t("home_feat_sub")}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <div className="shrink-0 mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground mb-0.5">{f.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{f.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link href="/order/new">
                <Button size="lg" className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 gap-2">
                  {t("home_feat_build_cta")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-2">
                {t("home_feat_build_note")}
              </p>
            </div>
          </div>

          {/* Visual mockup */}
          <div className="relative">
            <div className="rounded-2xl bg-[var(--color-navy)] p-6 text-white">
              <div className="text-xs text-white/50 mb-3 font-mono">PRICE BY DOOR STYLE</div>
              <div className="space-y-3">
                {[
                  { name: "Shaker White", style: "Shaker", price: "$194.50" },
                  { name: "Frost White", style: "Raised Panel", price: "$218.40" },
                  { name: "Graphite", style: "Contemporary Slab", price: "$249.94" },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg p-3 ${i === 0 ? "bg-[var(--color-gold)]/20 border border-[var(--color-gold)]/30" : "bg-white/5"}`}>
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-white/50">{item.style}</div>
                    </div>
                    <div className={`text-lg font-bold ${i === 0 ? "text-[var(--color-gold)]" : "text-white/70"}`}>
                      {item.price}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-white/40 text-center">B24 — 24" Double Door Base Cabinet · {t("home_stat_trade")}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="bg-[var(--color-navy)] text-white/70">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-[var(--color-gold)] text-[var(--color-navy)] font-bold text-xs">
                CD
              </div>
              <span className="font-serif text-lg font-bold text-white">
                Cabinet<span className="text-[var(--color-gold)]">Dealz</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              {t("home_footer_blurb")}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{t("home_footer_col_catalog")}</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: t("home_cat_base_t"), key: "Base" },
                { label: t("home_cat_wall_t"), key: "Wall" },
                { label: t("home_cat_tall_t"), key: "Tall" },
                { label: t("home_cat_ada_t"), key: "ADA" },
                { label: t("home_cat_vanity_t"), key: "Vanity" },
                { label: t("home_cat_accessory_t"), key: "Accessory" },
              ].map((item) => (
                <li key={item.key}>
                  <Link href={`/catalog?category=${item.key}`} className="hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{t("home_footer_col_tools")}</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: t("nav_shop_by_style"), href: "/styles" },
                { label: t("nav_design_tool"), href: "/design" },
                { label: t("nav_build_an_order"), href: "/bulk-order" },
                { label: t("nav_photo_to_cart"), href: "/photo-to-cart" },
                { label: "Surfaces & Fixtures", href: "/surfaces" },
                { label: "Plumber's Choice", href: "/plumbers-choice" },
                { label: "StoneCreek", href: "/stonecreek" },
              ].map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{t("home_footer_col_portals")}</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: t("nav_supplier_portal"), href: "/distributor" },
                { label: t("home_aud_affiliates_cta"), href: "/affiliate" },
                { label: t("nav_admin"), href: "/admin" },
              ].map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <span>&copy; {new Date().getFullYear()} Cabinet Dealz. {t("footer_rights")}</span>
          <span>{t("home_footer_members_only")}</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Home Page ───────────────────────────────────────────────────────────

export default function Home() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_home_t"), description: t("seo_home_d"), lang });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error")) {
      toast.error("Sign-in didn't complete. Please try again.");
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <JulyBanner />
      <Hero />
      <FeaturedStyles />
      <ProductShowcase />
      <AffiliatePromo />
      <Footer />
    </div>
  );
}
