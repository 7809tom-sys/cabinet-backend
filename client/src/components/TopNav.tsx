import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Menu, X, ShoppingCart, ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SiteStringKey } from "@/lib/i18n/site";
import { ChatTrigger } from "@/components/ChatWidget";
import { trpc } from "@/lib/trpc";
import { affiliateStorefrontPath } from "@/lib/affiliateStorefrontUrl";

type NavLink = { key: SiteStringKey; href: string };

// Primary links shown inline on desktop
const PRIMARY_LINKS: NavLink[] = [
  { key: "nav_shop_by_style", href: "/styles" },
  { key: "nav_all_cabinets", href: "/catalog" },
  { key: "nav_countertops", href: "/countertops" },
  { key: "nav_surfaces", href: "/surfaces" },
  { key: "nav_stonecreek", href: "/stonecreek" },
  { key: "nav_plumbers_choice", href: "/plumbers-choice" },
  { key: "nav_design_tool", href: "/design" },
];

// Secondary links folded into the "More" dropdown on desktop
const MORE_LINKS: NavLink[] = [
  { key: "nav_build_an_order", href: "/order/new" },
  { key: "nav_photo_to_cart", href: "/photo-to-cart" },
  { key: "nav_fixture_photo", href: "/fixture-photo" },
  { key: "nav_price_shop", href: "/price-shop" },
  { key: "nav_pro_network", href: "/pro-network" },
  { key: "nav_become_vendor", href: "/become-a-vendor" },
  { key: "nav_contractor", href: "/contractor" },
];

const PORTAL_LINKS: NavLink[] = [
  { key: "nav_supplier_portal", href: "/distributor" },
  { key: "nav_dealer_portal", href: "/portal/dealer" },
  { key: "nav_affiliate_portal", href: "/affiliate" },
];

// All links flattened for the mobile menu
const ALL_LINKS: NavLink[] = [...PRIMARY_LINKS, ...MORE_LINKS];

/** Compact EN | ES | 中文 selector reused on desktop + mobile. */
function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  const langs: { code: "en" | "es" | "zh"; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "es", label: "ES" },
    { code: "zh", label: "中文" },
  ];
  return (
    <div
      className={`flex items-center gap-0.5 rounded-md border border-border px-1.5 py-1 text-xs font-semibold ${className}`}
      aria-label={t("lang_toggle_aria")}
    >
      <Languages className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
      {langs.map((l, i) => (
        <span key={l.code} className="flex items-center">
          {i > 0 && <span className="text-muted-foreground/40 mx-0.5">|</span>}
          <button
            type="button"
            onClick={() => setLang(l.code)}
            className={`px-1 transition-colors ${
              lang === l.code ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.label}
          </button>
        </span>
      ))}
    </div>
  );
}

export function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [location] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const { count: cartCount } = useCart();
  const { t } = useLanguage();

  // Check if the current user is a linked affiliate (partner role or has affiliate record)
  const { data: myAffiliateData } = trpc.affiliates.myReferrals.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });
  const isAffiliate = !!myAffiliateData?.affiliate;

  // Detect affiliate slug from multiple sources:
  // 1. ?ref= param (referral code)
  // 2. /store/:slug/* URL path
  // 3. localStorage (cd_cart_slug_v1)
  const refCode = new URLSearchParams(search).get("ref") ?? "";
  const storeSlugMatch = location.match(/^\/store\/([^/]+)/);
  const storeSlug = storeSlugMatch ? storeSlugMatch[1] : null;
  const storedSlug = typeof localStorage !== "undefined" ? localStorage.getItem("cd_cart_slug_v1") : null;
  
  // Query affiliate by referral code OR by slug (for storefront pages)
  const { data: affiliateBrand } = trpc.affiliates.byCode.useQuery(
    { code: refCode },
    { enabled: !!refCode, staleTime: 5 * 60 * 1000 }
  );
  const { data: affiliateBySlug } = trpc.affiliates.bySlug.useQuery(
    { slug: storeSlug || storedSlug || "" },
    { enabled: !refCode && !!(storeSlug || storedSlug), staleTime: 5 * 60 * 1000 }
  );
  
  // Use whichever affiliate data is available
  const currentAffiliate = affiliateBrand || affiliateBySlug;

  const isActive = (href: string) => location.startsWith(href);
  const moreActive = [...MORE_LINKS, ...PORTAL_LINKS].some((l) => isActive(l.href));

  // On affiliate pages, hide internal portals (Supplier Portal, Dealer Portal)
  const visiblePortalLinks = currentAffiliate
    ? PORTAL_LINKS.filter((l) => l.href === "/affiliate")
    : PORTAL_LINKS;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-2">
        {/* Logo — show affiliate branding when on affiliate storefront or ?ref= present */}
        {currentAffiliate ? (
          <a
            href={affiliateStorefrontPath(currentAffiliate.slug)}
            className="flex items-center gap-2 shrink-0 max-w-[200px]"
          >
            {currentAffiliate.logoUrl ? (
              <img
                src={currentAffiliate.logoUrl}
                alt={currentAffiliate.storeName}
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-navy)] text-white font-bold text-sm shrink-0">
                  {currentAffiliate.storeName.slice(0, 1).toUpperCase()}
                </div>
                <span className="font-serif text-lg font-bold text-[var(--color-navy)] dark:text-foreground truncate">
                  {currentAffiliate.storeName}
                </span>
              </>
            )}
          </a>
        ) : (
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-navy)] text-white font-bold text-sm">
              CD
            </div>
            <span className="font-serif text-xl font-bold text-[var(--color-navy)] dark:text-foreground">
              Cabinet<span className="text-[var(--color-gold)]">Dealz</span>
            </span>
          </Link>
        )}

        {/* Chat trigger — right after logo, out of the way */}
        <ChatTrigger />

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-2.5 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                isActive(link.href)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              }`}
            >
              {t(link.key)}
            </Link>
          ))}

          {/* More dropdown (secondary links + portals) */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                moreActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              }`}
            >
              {t("nav_more")}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg py-1 fade-in"
                onMouseLeave={() => setMoreOpen(false)}
              >
                {MORE_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      isActive(link.href)
                        ? "bg-primary/10 text-primary"
                        : "text-popover-foreground hover:bg-muted"
                    }`}
                  >
                    {t(link.key)}
                  </Link>
                ))}
                <div className="my-1 border-t border-border" />
                <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("nav_more")}
                </div>
                {visiblePortalLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      isActive(link.href)
                        ? "bg-primary/10 text-primary"
                        : "text-popover-foreground hover:bg-muted"
                    }`}
                  >
                    {t(link.key)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Language toggle (desktop) */}
          <LangToggle className="hidden sm:flex" />

          <Button variant="ghost" size="icon" asChild className="relative">
            <Link href="/cart" aria-label={t("nav_cart")}>
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </Link>
          </Button>

          {user ? (
            <div className="hidden lg:flex items-center gap-2">
              <span className="hidden xl:inline text-sm text-muted-foreground max-w-[140px] truncate">{user.name || user.email}</span>
              {(user.role === "admin" || user.role === "designer") && (
                <Link href="/admin">
                  <Button
                    size="sm"
                    className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90"
                  >
                    {user.role === "designer" ? t("nav_crm") : t("nav_admin")}
                  </Button>
                </Link>
              )}
              {isAffiliate && (
                <Link href="/affiliate">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                  >
                    Administration
                  </Button>
                </Link>
              )}
              {user.role === "contractor" && (
                <Link href="/contractor">
                  <Button
                    size="sm"
                    className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90"
                  >
                    {t("nav_contractor_crm")}
                  </Button>
                </Link>
              )}
              <Link href="/account">
                <Button variant="outline" size="sm">{t("nav_account")}</Button>
              </Link>
            </div>
          ) : (
            <Link href="/signin">
              <Button
                size="sm"
                className="hidden lg:flex bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
              >
                {t("nav_sign_in")}
              </Button>
            </Link>
          )}

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background slide-up">
          <nav className="container py-4 flex flex-col gap-1">
            {ALL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                {t(link.key)}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            {visiblePortalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
              >
                {t(link.key)}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            {/* Language toggle (mobile) */}
            <div className="px-3 pb-1">
              <LangToggle className="w-full justify-center" />
            </div>
            {(user?.role === "admin" || user?.role === "designer") && (
              <Link href="/admin" onClick={() => setMobileOpen(false)} className="px-3">
                <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90">
                  {user?.role === "designer" ? t("nav_crm") : t("nav_admin")}
                </Button>
              </Link>
            )}
            {isAffiliate && (
              <Link href="/affiliate" onClick={() => setMobileOpen(false)} className="px-3">
                <Button variant="outline" className="w-full border-[var(--color-gold)] text-[var(--color-gold)]">
                  Administration
                </Button>
              </Link>
            )}
            {user?.role === "contractor" && (
              <Link href="/contractor" onClick={() => setMobileOpen(false)} className="px-3">
                <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90">
                  {t("nav_contractor_crm")}
                </Button>
              </Link>
            )}
            {user && (
              <Link href="/account" onClick={() => setMobileOpen(false)} className="px-3">
                <Button variant="outline" className="w-full">{t("nav_account")}</Button>
              </Link>
            )}
            {!user && (
              <Link href="/signin" onClick={() => setMobileOpen(false)} className="px-3">
                <Button className="w-full bg-[var(--color-navy)] text-white">{t("nav_sign_in")}</Button>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
