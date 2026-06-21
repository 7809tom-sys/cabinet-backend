import { Link } from "wouter";
import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReferral } from "@/hooks/useReferral";
import { useStorefrontLang } from "@/lib/storefrontI18n";
import { StorefrontShop } from "@/components/storefront/StorefrontShop";
import {
  ArrowRight, Phone, Mail, MapPin, Globe, Facebook, Instagram, Award,
  Ruler, ShieldCheck, Zap, Heart, Languages,
} from "lucide-react";

const PLATFORM_NAVY = "#1a2b4a";
const PLATFORM_GOLD = "#c9a227";

function color(val: string | null | undefined, fallback: string): string {
  if (!val) return fallback;
  const v = val.trim();
  return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : fallback;
}

export default function Storefront({ slug }: { slug: string }) {
  const { data, isLoading } = trpc.affiliates.bySlug.useQuery({ slug }, { retry: false });
  const { lang, toggle, t } = useStorefrontLang();

  // Capture this affiliate's referral code for the visitor's session.
  const { setReferral } = useReferral(null);
  useEffect(() => {
    if (data?.referralCode) setReferral(data.referralCode);
  }, [data?.referralCode, setReferral]);

  const brand = useMemo(
    () => ({
      primary: color(data?.primaryColor, PLATFORM_NAVY),
      accent: color(data?.accentColor, PLATFORM_GOLD),
    }),
    [data?.primaryColor, data?.accentColor]
  );

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
          <Button>Go to Cabinet Dealz</Button>
        </Link>
      </div>
    );
  }

  const ref = data.referralCode;
  const withRef = (path: string) => `${path}${path.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`;

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="container flex items-center justify-between h-16">
          <Link href={withRef(`/store/${data.slug}`)}>
            <div className="flex items-center gap-3 cursor-pointer">
              {data.logoUrl ? (
                <img src={data.logoUrl} alt={data.storeName} className="h-9 w-auto max-w-[180px] object-contain" />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded font-bold text-white"
                  style={{ backgroundColor: brand.primary }}
                >
                  {data.storeName.slice(0, 1)}
                </div>
              )}
              <span className="font-serif text-lg font-bold" style={{ color: brand.primary }}>
                {data.storeName}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <a href="#shop" className="hidden sm:block">
              <Button variant="ghost" size="sm">{t("cat_shop")}</Button>
            </a>
            <Link href={withRef("/design")} className="hidden sm:block">
              <Button variant="ghost" size="sm">{t("nav_design")}</Button>
            </Link>
            <button
              onClick={toggle}
              aria-label="Toggle language"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === "en" ? "ES" : "EN"}
            </button>
            <Link href={withRef("/order/new")}>
              <Button size="sm" className="font-semibold text-white" style={{ backgroundColor: brand.accent }}>
                {t("nav_quote")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden text-white" style={{ backgroundColor: brand.primary }}>
          {data.heroImageUrl && (
            <div className="absolute inset-0">
              <img src={data.heroImageUrl} alt="" className="h-full w-full object-cover opacity-30" />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, ${brand.primary} 10%, ${brand.primary}cc 55%, ${brand.primary}66 100%)`,
                }}
              />
            </div>
          )}
          <div className="relative container py-20 md:py-28">
            <div className="max-w-2xl">
              {data.yearsInBusiness ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
                  <Award className="h-3.5 w-3.5" style={{ color: brand.accent }} />
                  {t("hero_badge_years", { years: data.yearsInBusiness })}
                </div>
              ) : null}
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
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
                <Link href={withRef("/design")}>
                  <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                    {t("hero_design")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Value strip ───────────────────────────────────────────────── */}
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

        {/* ─── Family-locked shop (line picker → locked catalog) ─────────── */}
        <StorefrontShop slug={data.slug} brand={brand} lang={lang} withRef={withRef} />

        {/* ─── How it works ──────────────────────────────────────────────── */}
        <section className="py-16 md:py-20 bg-muted/30">
          <div className="container">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-center mb-12">{t("how_title")}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s) => (
                <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                  <div
                    className="mb-4 flex h-9 w-9 items-center justify-center rounded-full font-bold text-white"
                    style={{ backgroundColor: brand.accent }}
                  >
                    {s.n}
                  </div>
                  <h3 className="font-serif text-lg font-bold mb-1.5">{s.t}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Quote CTA band ────────────────────────────────────────────── */}
        <section className="py-16" style={{ backgroundColor: brand.primary }}>
          <div className="container text-center text-white">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">{t("quote_title")}</h2>
            <p className="text-white/80 max-w-2xl mx-auto mb-8">{t("quote_sub")}</p>
            <Link href={withRef("/order/new")}>
              <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                {t("quote_btn")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="text-white/75" style={{ backgroundColor: brand.primary }}>
        <div className="container py-12">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="font-serif text-xl font-bold text-white mb-3">{data.storeName}</div>
              {data.aboutText && <p className="text-sm leading-relaxed mb-4">{data.aboutText}</p>}
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
                {data.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <a href={`tel:${data.phone}`} className="hover:text-white">{data.phone}</a>
                  </li>
                )}
                {data.email && (
                  <li className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <a href={`mailto:${data.email}`} className="hover:text-white break-all">{data.email}</a>
                  </li>
                )}
                {(data.location || data.serviceArea) && (
                  <li className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{data.serviceArea || data.location}</span>
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
                <li><Link href={withRef("/design")} className="hover:text-white">{t("nav_design")}</Link></li>
                <li><Link href={withRef("/order/new")} className="hover:text-white">{t("nav_quote")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/15 text-xs text-white/50 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} {data.storeName}. {t("footer_rights")}</span>
            <span>{t("footer_powered")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
