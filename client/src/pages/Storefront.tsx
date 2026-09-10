import { Link } from "wouter";
import { useEffect, useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReferral, setReferralCode } from "@/hooks/useReferral";
import { useStorefrontLangGlobal as useStorefrontLang } from "@/contexts/LanguageContext";
import { StorefrontShop } from "@/components/storefront/StorefrontShop";
import { KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";
import {
  ArrowRight, Phone, Mail, MapPin, Globe, Facebook, Instagram, Award,
  Ruler, ShieldCheck, Zap, Heart, Languages, Waves, LogIn, ShoppingCart, X, PackageOpen,
} from "lucide-react";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWhiteLabelHead } from "@/hooks/useWhiteLabelHead";
import { StorefrontEmbed } from "@/components/storefront/StorefrontEmbed";

const PLATFORM_NAVY = "#1a2b4a";
const PLATFORM_GOLD = "#c9a227";

type TemplateId = "classic" | "showcase" | "minimal" | "craftsman";

type Brand = { primary: string; accent: string };

// Defined early so the Storefront function can reference it in its props
type StorefrontData = NonNullable<inferRouterOutputs<AppRouter>["affiliates"]["bySlug"]>;

function color(val: string | null | undefined, fallback: string): string {
  if (!val) return fallback;
  const v = val.trim();
  return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : fallback;
}

export default function Storefront({ slug, previewData }: { slug: string; previewData?: StorefrontData }) {
  const { data: fetchedData, isLoading } = trpc.affiliates.bySlug.useQuery(
    { slug },
    { retry: false, enabled: !previewData }
  );
  const data = previewData ?? fetchedData;
  const { lang, toggle, t } = useStorefrontLang();

  // Capture this affiliate's referral code + slug for the visitor's session.
  // The slug is stored so the order builder can apply the affiliate's markup.
  const { setReferral } = useReferral(null);
  useEffect(() => {
    if (data?.referralCode) {
      setReferral(data.referralCode);
      // Also persist the slug so priceLines can apply the affiliate markup.
      setReferralCode(data.referralCode, data.slug);
    }
  }, [data?.referralCode, data?.slug, setReferral]);

  const brand = useMemo<Brand>(
    () => ({
      primary: color(data?.primaryColor, PLATFORM_NAVY),
      accent: color(data?.accentColor, PLATFORM_GOLD),
    }),
    [data?.primaryColor, data?.accentColor]
  );

  // White-label the browser tab, favicon, and social meta so the platform name
  // never appears in the affiliate's customer-facing experience.
  useWhiteLabelHead({
    storeName: data?.storeName,
    tagline: data?.tagline,
    logoUrl: data?.logoUrl,
  });

  // Inject Google Fonts + CSS variables for affiliate typography/button radius.
  useEffect(() => {
    const bodyFont = data?.fontFamily;
    const headFont = data?.headingFont;
    const btnRadius = data?.buttonRadius;
    if (!bodyFont && !headFont && !btnRadius) return;

    // Load Google Fonts for any custom fonts selected.
    const fontsToLoad = [bodyFont, headFont].filter(Boolean) as string[];
    if (fontsToLoad.length > 0) {
      const existing = document.getElementById("affiliate-gfonts");
      if (existing) existing.remove();
      const link = document.createElement("link");
      link.id = "affiliate-gfonts";
      link.rel = "stylesheet";
      const families = fontsToLoad.map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join("&");
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
    }

    // Apply CSS variables to :root so all storefront elements inherit them.
    const root = document.documentElement;
    if (bodyFont) root.style.setProperty("--sf-font-body", `"${bodyFont}", sans-serif`);
    if (headFont) root.style.setProperty("--sf-font-heading", `"${headFont}", serif`);
    if (btnRadius) root.style.setProperty("--sf-btn-radius", btnRadius);

    return () => {
      // Clean up when leaving the storefront.
      root.style.removeProperty("--sf-font-body");
      root.style.removeProperty("--sf-font-heading");
      root.style.removeProperty("--sf-btn-radius");
    };
  }, [data?.fontFamily, data?.headingFont, data?.buttonRadius]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container py-24 text-center">
        <h1 className="font-serif text-3xl font-bold mb-3">Storefront not found</h1>
        <p className="text-muted-foreground mb-6">
          This partner storefront isn't available. It may be paused or the link may be incorrect.
        </p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    );
  }

  const template = (data.template ?? "classic") as TemplateId;
  // Language-aware hero copy: prefer the affiliate's Spanish copy when the
  // visitor is viewing in ES and a non-empty ES value exists; otherwise fall
  // back to the default (EN) copy so nothing goes blank.
  const localizedData = {
    ...data,
    tagline: lang === "es" && data.taglineEs?.trim() ? data.taglineEs : data.tagline,
    aboutText: lang === "es" && data.aboutTextEs?.trim() ? data.aboutTextEs : data.aboutText,
  };
  const ref = data.referralCode;
  const withRef = (path: string) => `${path}${path.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`;
  const heroImg = data.heroImageUrl || KITCHEN_SCENES["shaker-white"];
  // New storefront-specific fields take precedence, while existing affiliates
  // retain their already-published contact information without a forced update.
  const storefrontPhone = data.publicPhone || data.phone;
  const storefrontEmail = data.publicEmail || data.email;
  const storefrontLocation = data.publicAddress || data.serviceArea || data.location;

  const valueProps = [
    { icon: Ruler, title: t("value_free_design"), sub: t("value_free_design_sub") },
    { icon: ShieldCheck, title: t("value_all_plywood"), sub: t("value_all_plywood_sub") },
    { icon: Zap, title: t("value_fast_quote"), sub: t("value_fast_quote_sub") },
    { icon: Heart, title: t("value_local"), sub: t("value_local_sub") },
  ];

  const steps = [
    { n: 1, t: t("how_step1_t"), d: t("how_step1_d") },
    { n: 2, t: t("how_step2_t"), d: t("how_step2_d") },
    { n: 3, t: t("how_step3_t"), d: t("how_step3_d") },
    { n: 4, t: t("how_step4_t"), d: t("how_step4_d") },
  ];

  // Template-dependent typography: serif headlines for classic/craftsman, sans for showcase/minimal.
  const headlineFont = template === "showcase" || template === "minimal" ? "font-sans" : "font-serif";

  // Use affiliate's custom fonts when set, otherwise fall back to template defaults.
  const bodyFontStyle = data.fontFamily ? { fontFamily: `var(--sf-font-body, "${data.fontFamily}", sans-serif)` } : {};
  const headingFontStyle = data.headingFont ? { fontFamily: `var(--sf-font-heading, "${data.headingFont}", serif)` } : {};
  const btnRadiusStyle = data.buttonRadius ? { borderRadius: `var(--sf-btn-radius, ${data.buttonRadius})` } : {};

  const LangToggle = (
    <button
      onClick={toggle}
      aria-label="Toggle language"
      className="inline-flex items-center gap-1.5 rounded-md border border-current/20 px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-current/10"
    >
      <Languages className="h-3.5 w-3.5" />
      {lang === "en" ? "ES" : "EN"}
    </button>
  );

  const Logo = ({ light }: { light?: boolean }) => (
    <Link href={withRef(`/store/${data.slug}`)}>
      <div className="flex items-center gap-3 cursor-pointer">
        {data.logoUrl ? (
          <img src={data.logoUrl} alt={data.storeName} className="h-9 w-auto max-w-[180px] object-contain" />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded font-bold text-white"
            style={{ backgroundColor: light ? brand.accent : brand.primary }}
          >
            {data.storeName.slice(0, 1)}
          </div>
        )}
        <span
          className={`${headlineFont} text-lg font-bold`}
          style={{ color: light ? "#fff" : brand.primary }}
        >
          {data.storeName}
        </span>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Header + Hero (varies by template) ──────────────────────────── */}
      {template === "classic" && (
        <ClassicHeader {...{ data: localizedData, brand, t, withRef, headlineFont, LangToggle, Logo }} />
      )}
      {template === "showcase" && (
        <ShowcaseHero {...{ data: localizedData, brand, t, withRef, headlineFont, heroImg, LangToggle, Logo }} />
      )}
      {template === "minimal" && (
        <MinimalHero {...{ data: localizedData, brand, t, withRef, headlineFont, heroImg, LangToggle, Logo }} />
      )}
      {template === "craftsman" && (
        <CraftsmanHero {...{ data: localizedData, brand, t, withRef, headlineFont, LangToggle, Logo }} />
      )}

      <main className="flex-1">
        {/* ─── Affiliate promo banner ──────────────────────────────────── */}
        <AffiliateBannerBar slug={data.slug} brand={brand} />
        {/* ─── Value strip ─────────────────────────────────────────────── */}
        <section className="border-b border-border bg-card">
          <div className="container grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
            {valueProps.map((v) => (
              <div key={v.title} className="flex items-center gap-3 px-3 py-5">
                <div className="inline-flex p-2 rounded-lg text-white shrink-0" style={{ backgroundColor: brand.primary }}>
                  <v.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold leading-tight">{v.title}</div>
                  <div className="text-xs text-muted-foreground">{v.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {data.testimonials.length > 0 && (
          <section aria-labelledby="storefront-testimonials" className="border-b border-border bg-muted/30 py-14 md:py-16">
            <div className="container">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: brand.accent }}>Customer voices</p>
                <h2 id="storefront-testimonials" className={`${headlineFont} mt-2 text-3xl font-bold tracking-tight text-foreground`}>What customers say about {data.storeName}</h2>
              </div>
              <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.testimonials.map((testimonial) => (
                  <figure key={testimonial.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-background p-5">
                    <blockquote className="text-sm leading-relaxed text-foreground">“{testimonial.quote}”</blockquote>
                    <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{testimonial.author ? `— ${testimonial.author}` : "Published customer testimonial"}</span>
                      <a href={testimonial.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">Source</a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── Family-locked shop (shared across templates) ─────────────── */}
        <div id="shop">
          <StorefrontShop slug={data.slug} brand={brand} lang={lang} withRef={withRef} />
        </div>

        {/* ─── Kitchen Packages promo band ─────────────────────────────── */}
        <section id="bundles" className="py-14 md:py-16 border-b border-border">
          <div className="container">
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <PackageOpen className="h-5 w-5" style={{ color: brand.accent }} />
                  <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.accent }}>Pre-Designed Packages</span>
                </div>
                <h2 className={`${headlineFont} text-2xl md:text-3xl font-bold mb-3`}>
                  Ready-to-Customize Kitchen Packages
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Browse complete kitchen packages with floor plans, pricing, and cabinet counts. Customize any package to fit your space and order in minutes.
                </p>
                <Link href={withRef(`/store/${data.slug}/bundles`)}>
                  <Button className="gap-2 font-semibold text-white" style={{ backgroundColor: brand.accent }}>
                    <PackageOpen className="h-4 w-4" /> View Kitchen Packages <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                {[
                  { icon: "📐", label: "Floor Plan Included" },
                  { icon: "🏠", label: "Complete Kitchen" },
                  { icon: "💰", label: "Package Pricing" },
                  { icon: "🎨", label: "Customizable" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Surfaces & Fixtures promo band ─────────────────────────── */}
        <section className="py-14 md:py-16 bg-muted/40">
          <div className="container">
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Waves className="h-5 w-5" style={{ color: brand.accent }} />
                  <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.accent }}>Surfaces &amp; Fixtures</span>
                </div>
                <h2 className={`${headlineFont} text-2xl md:text-3xl font-bold mb-3`}>
                  Complete Your Kitchen &amp; Bath
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Beyond cabinets — shop quartz countertops, waterproof flooring, tile, sinks, faucets, showers, tubs, and toilets. All at trade pricing.
                </p>
                <a href={withRef(`/store/${data.slug}/surfaces`)}>
                  <Button className="gap-2 font-semibold text-white" style={{ backgroundColor: brand.accent }}>
                    Shop Surfaces &amp; Fixtures <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                {[
                  { icon: "🪨", label: "Quartz Countertops" },
                  { icon: "🚿", label: "Showers & Tubs" },
                  { icon: "🚰", label: "Sinks & Faucets" },
                  { icon: "🏠", label: "Flooring & Tile" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── How it works ────────────────────────────────────────────── */}
        <section className="py-16 md:py-20 bg-muted/30">
          <div className="container">
            <h2 className={`${headlineFont} text-3xl md:text-4xl font-bold text-center mb-12`}>{t("how_title")}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s) => (
                <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                  <div
                    className="mb-4 flex h-9 w-9 items-center justify-center rounded-full font-bold text-white"
                    style={{ backgroundColor: brand.accent }}
                  >
                    {s.n}
                  </div>
                  <h3 className={`${headlineFont} text-lg font-bold mb-1.5`}>{s.t}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Quote CTA band ──────────────────────────────────────────── */}
        <section className="py-16" style={{ backgroundColor: brand.primary }}>
          <div className="container text-center text-white">
            <h2 className={`${headlineFont} text-3xl md:text-4xl font-bold mb-3`}>{t("quote_title")}</h2>
            <p className="text-white/80 max-w-2xl mx-auto mb-8">{t("quote_sub")}</p>
            <Link href={withRef(`/store/${data.slug}/order`)}>
              <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                {t("quote_btn")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Footer (shared) ─────────────────────────────────────────────── */}
      <footer className="text-white/75" style={{ backgroundColor: brand.primary }}>
        <div className="container py-12">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className={`${headlineFont} text-xl font-bold text-white mb-3`}>{data.storeName}</div>
              {localizedData.aboutText && <p className="text-sm leading-relaxed mb-4">{localizedData.aboutText}</p>}
              <div className="flex gap-3">
                {data.facebookUrl && (
                  <a href={data.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-white">
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {data.instagramUrl && (
                  <a href={data.instagramUrl} target="_blank" rel="noreferrer" className="hover:text-white">
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">{t("footer_contact")}</div>
              <ul className="space-y-2 text-sm">
                {storefrontPhone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <a href={`tel:${storefrontPhone}`} className="hover:text-white">{storefrontPhone}</a>
                  </li>
                )}
                {storefrontEmail && (
                  <li className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <a href={`mailto:${storefrontEmail}`} className="hover:text-white break-all">{storefrontEmail}</a>
                  </li>
                )}
                {storefrontLocation && (
                  <li className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{storefrontLocation}</span>
                  </li>
                )}
                {data.website && (
                  <li className="flex items-center gap-2">
                    <Globe className="h-4 w-4 shrink-0" />
                    <a href={data.website} target="_blank" rel="noreferrer" className="hover:text-white break-all">
                      {data.website.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">{t("cat_shop")}</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#shop" className="hover:text-white">{t("hero_browse")}</a></li>
                <li><Link href={withRef(`/design?affiliate=${data.slug}`)} className="hover:text-white">{t("nav_design")}</Link></li>
                <li><Link href={withRef(`/store/${data.slug}/order`)} className="hover:text-white">{t("nav_quote")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/15 text-xs text-white/50 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} {data.storeName}. {t("footer_rights")}</span>
            <AffiliateLoginFooterLink />
            <AdminFooterLink affiliateId={data.id} storeName={data.storeName} />
          </div>
        </div>
      </footer>
      {/* Affiliate's own published third-party widget (chat, reviews, etc.) */}
      <StorefrontEmbed code={data.embedCode} />
    </div>
  );
}

// ─── Shared header-nav props ─────────────────────────────────────────────────

type TFn = ReturnType<typeof useStorefrontLang>["t"];

type HeaderProps = {
  data: StorefrontData;
  brand: Brand;
  t: TFn;
  withRef: (path: string) => string;
  headlineFont: string;
  heroImg?: string;
  LangToggle: React.ReactNode;
  Logo: (props: { light?: boolean }) => React.ReactElement;
};

function NavLinks({
  t,
  withRef,
  variant,
  slug,
}: {
  t: TFn;
  withRef: HeaderProps["withRef"];
  variant: "light" | "dark";
  slug: string;
}) {
  const cls = variant === "light" ? "text-white hover:bg-white/15" : "";
  const { count: cartCount } = useCart();
  return (
    <>
      <a href="#shop" className="hidden sm:block">
        <Button variant="ghost" size="sm" className={cls}>{t("cat_shop")}</Button>
      </a>
      <Link href={withRef(`/store/${slug}/kitchens`)} className="hidden sm:block">
        <Button variant="ghost" size="sm" className={cls}>Plan Your Kitchen</Button>
      </Link>
      <Link href={withRef(`/design?affiliate=${slug}`)} className="hidden sm:block">
        <Button variant="ghost" size="sm" className={cls}>{t("nav_design")}</Button>
      </Link>
      <Link href={withRef(`/store/${slug}/cart`)} aria-label="Cart">
        <Button variant="ghost" size="sm" className={`relative ${cls}`}>
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: variant === "light" ? "#fff" : undefined }}
            >
              <span style={{ color: variant === "light" ? "#000" : undefined }}>
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            </span>
          )}
        </Button>
      </Link>
    </>
  );
}

// ─── Classic: navy split hero with lifestyle photo ───────────────────────────
function ClassicHeader({ data, brand, t, withRef, headlineFont, LangToggle, Logo }: HeaderProps) {
  const heroImg = data.heroImageUrl || KITCHEN_SCENES["shaker-white"];
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="container flex items-center justify-between h-16">
          <Logo />
          <div className="flex items-center gap-2">
            <NavLinks t={t} withRef={withRef} variant="dark" slug={data.slug} />
            {LangToggle}
            <Link href={withRef(`/store/${data.slug}/order`)}>
              <Button size="sm" className="font-semibold text-white" style={{ backgroundColor: brand.accent }}>
                {t("nav_quote")}
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <section className="relative overflow-hidden text-white" style={{ backgroundColor: brand.primary }}>
        <div className="relative container py-16 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="max-w-xl">
              {data.yearsInBusiness ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
                  <Award className="h-3.5 w-3.5" style={{ color: brand.accent }} />
                  {t("hero_badge_years", { years: data.yearsInBusiness })}
                </div>
              ) : null}
              <h1 className={`${headlineFont} text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6`}>
                {data.tagline || (
                  <>
                    Beautiful Kitchens,
                    <br />
                    <span style={{ color: brand.accent }}>Built Around You.</span>
                  </>
                )}
              </h1>
              <p className="text-lg md:text-xl text-white/85 mb-8 leading-relaxed">
                {data.aboutText ||
                  `Shop a full cabinet catalog, choose your finish, design your kitchen in 2D, and get a fast quote — all backed by ${data.storeName}.`}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="#shop">
                  <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                    {t("hero_browse")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <Link href={withRef(`/design?affiliate=${data.slug}`)}>
                  <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                    {t("hero_design")}
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
                <img src={heroImg} alt="Designed kitchen" className="aspect-[4/3] w-full object-cover" />
              </div>
              <div className="absolute -bottom-5 -left-5 rounded-xl bg-white/95 px-4 py-3 shadow-xl">
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: brand.primary }}>
                  <Heart className="h-4 w-4" style={{ color: brand.accent }} />
                  {t("value_local")}
                </div>
                <div className="text-xs text-muted-foreground">{t("value_local_sub")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative container pb-16 lg:hidden">
          <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
            <img src={heroImg} alt="Designed kitchen" className="aspect-[16/10] w-full object-cover" />
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Showcase: full-bleed hero photo with overlaid copy ──────────────────────
function ShowcaseHero({ data, brand, t, withRef, headlineFont, heroImg, LangToggle, Logo }: HeaderProps) {
  return (
    <header className="relative">
      <div className="absolute inset-0">
        <img src={heroImg} alt="Designed kitchen" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/55" />
      </div>
      <div className="relative">
        <div className="container flex items-center justify-between h-16">
          <Logo light />
          <div className="flex items-center gap-2 text-white">
            <NavLinks t={t} withRef={withRef} variant="light" slug={data.slug} />
            {LangToggle}
            <Link href={withRef(`/store/${data.slug}/order`)}>
              <Button size="sm" className="font-semibold text-white" style={{ backgroundColor: brand.accent }}>
                {t("nav_quote")}
              </Button>
            </Link>
          </div>
        </div>
        <div className="container py-28 md:py-40 text-white">
          <div className="max-w-2xl">
            {data.yearsInBusiness ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6 backdrop-blur">
                <Award className="h-3.5 w-3.5" style={{ color: brand.accent }} />
                {t("hero_badge_years", { years: data.yearsInBusiness })}
              </div>
            ) : null}
            <h1 className={`${headlineFont} text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6 tracking-tight`}>
              {data.tagline || "Beautiful Kitchens, Built Around You."}
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-8 leading-relaxed max-w-xl">
              {data.aboutText ||
                `Shop a full cabinet catalog, choose your finish, design your kitchen in 2D, and get a fast quote — all backed by ${data.storeName}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="#shop">
                <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                  {t("hero_browse")} <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Link href={withRef(`/design?affiliate=${data.slug}`)}>
                <Button size="lg" variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20 gap-2 backdrop-blur">
                  {t("hero_design")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Minimal: light, airy, thin rules ────────────────────────────────────────
function MinimalHero({ data, brand, t, withRef, headlineFont, heroImg, LangToggle, Logo }: HeaderProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="container flex items-center justify-between h-16">
          <Logo />
          <div className="flex items-center gap-2">
            <NavLinks t={t} withRef={withRef} variant="dark" slug={data.slug} />
            {LangToggle}
            <Link href={withRef(`/store/${data.slug}/order`)}>
              <Button size="sm" variant="outline" className="font-semibold" style={{ borderColor: brand.primary, color: brand.primary }}>
                {t("nav_quote")}
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <section className="bg-background">
        <div className="container py-20 md:py-28">
          <div className="max-w-3xl">
            {data.yearsInBusiness ? (
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-6">
                <span className="h-px w-8" style={{ backgroundColor: brand.accent }} />
                {t("hero_badge_years", { years: data.yearsInBusiness })}
              </div>
            ) : null}
            <h1 className={`${headlineFont} text-4xl md:text-6xl font-bold leading-[1.08] mb-6 tracking-tight text-foreground`}>
              {data.tagline || "Beautiful Kitchens, Built Around You."}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed max-w-2xl">
              {data.aboutText ||
                `Shop a full cabinet catalog, choose your finish, design your kitchen in 2D, and get a fast quote — all backed by ${data.storeName}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="#shop">
                <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.primary }}>
                  {t("hero_browse")} <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Link href={withRef(`/design?affiliate=${data.slug}`)}>
                <Button size="lg" variant="outline" className="gap-2" style={{ borderColor: brand.primary, color: brand.primary }}>
                  {t("hero_design")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="container pb-8">
          <div className="overflow-hidden rounded-xl border border-border">
            <img src={heroImg} alt="Designed kitchen" className="aspect-[21/9] w-full object-cover" />
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Craftsman: warm bold type on an accent block, no photo ──────────────────
function CraftsmanHero({ data, brand, t, withRef, headlineFont, LangToggle, Logo }: HeaderProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 bg-card" style={{ borderColor: brand.accent }}>
        <div className="container flex items-center justify-between h-16">
          <Logo />
          <div className="flex items-center gap-2">
            <NavLinks t={t} withRef={withRef} variant="dark" slug={data.slug} />
            {LangToggle}
            <Link href={withRef(`/store/${data.slug}/order`)}>
              <Button size="sm" className="font-semibold text-white" style={{ backgroundColor: brand.primary }}>
                {t("nav_quote")}
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <section className="relative overflow-hidden" style={{ backgroundColor: brand.accent }}>
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 14px)",
          }}
        />
        <div className="relative container py-20 md:py-28">
          <div className="max-w-3xl">
            {data.yearsInBusiness ? (
              <div
                className="inline-flex items-center gap-2 rounded-sm px-4 py-1.5 text-sm font-bold uppercase tracking-wide mb-6 text-white"
                style={{ backgroundColor: brand.primary }}
              >
                <Award className="h-3.5 w-3.5" />
                {t("hero_badge_years", { years: data.yearsInBusiness })}
              </div>
            ) : null}
            <h1
              className={`${headlineFont} text-5xl md:text-7xl font-black leading-[0.98] mb-6 uppercase tracking-tight`}
              style={{ color: brand.primary }}
            >
              {data.tagline || "Beautiful Kitchens, Built To Last."}
            </h1>
            <p className="text-lg md:text-xl mb-8 leading-relaxed max-w-2xl font-medium" style={{ color: brand.primary }}>
              {data.aboutText ||
                `Shop a full cabinet catalog, choose your finish, design your kitchen in 2D, and get a fast quote — all backed by ${data.storeName}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="#shop">
                <Button size="lg" className="font-bold text-white gap-2 rounded-sm" style={{ backgroundColor: brand.primary }}>
                  {t("hero_browse")} <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Link href={withRef(`/design?affiliate=${data.slug}`)}>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 rounded-sm border-2 bg-transparent font-bold"
                  style={{ borderColor: brand.primary, color: brand.primary }}
                >
                  {t("hero_design")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Affiliate login footer link ────────────────────────────────────────────
// Always visible — lets the affiliate log in to manage their store.
function AffiliateLoginFooterLink() {
  const { user } = useAuth();
  // If already logged in as admin, don't show this (they have the admin link)
  if (user?.role === "admin") return null;
  return (
    <a
      href="/affiliate"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs font-medium transition-colors"
    >
      <LogIn className="h-3.5 w-3.5" /> Manage Your Store
    </a>
  );
}

// ─── Admin footer link ────────────────────────────────────────────────────────
// Only visible to logged-in admins. Provides a quick jump to the Affiliates
// admin page without cluttering the storefront for regular customers.
function AdminFooterLink({ affiliateId, storeName }: { affiliateId?: number; storeName?: string }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const href = affiliateId ? `/admin?tab=affiliates&affiliateId=${affiliateId}` : "/admin#affiliates";
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors border border-white/20"
    >
      <LogIn className="h-3.5 w-3.5" /> Admin: {storeName ?? "Manage Affiliates"}
    </a>
  );
}

// ─── Affiliate Promo Banner Bar ───────────────────────────────────────────────
// Shows the affiliate's active scheduled banner (e.g. "Happy Holidays! 10% off")
// at the top of the main content area. Dismissible per session.
function AffiliateBannerBar({ slug, brand }: { slug: string; brand: { primary: string; accent: string } }) {
  const [dismissed, setDismissed] = useState(false);
  const { data } = trpc.storefront.activeBannerAndPromos.useQuery({ slug }, {
    staleTime: 5 * 60 * 1000,
  });
  if (dismissed || !data?.banner?.message) return null;
  return (
    <div
      className="relative flex items-center justify-center gap-3 px-10 py-2.5 text-sm font-medium text-white"
      style={{ backgroundColor: brand.primary }}
    >
      <span>{data.banner.message}</span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white/20 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
