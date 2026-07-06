import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="bg-[var(--color-navy)] text-white/70">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          <div>
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
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{t("home_footer_col_tools")}</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: t("nav_shop_by_style"), href: "/styles" },
                { label: t("nav_design_tool"), href: "/design" },
                { label: t("nav_build_an_order"), href: "/bulk-order" },
                { label: t("nav_photo_to_cart"), href: "/photo-to-cart" },
                { label: "Fixture Photo Match", href: "/fixture-photo" },
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
