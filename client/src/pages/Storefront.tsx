import { Link } from "wouter";
import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReferral } from "@/hooks/useReferral";
import {
  ArrowRight, Phone, Mail, MapPin, Globe, Palette, Ruler,
  FileSpreadsheet, Grid3X3, ChevronRight, Facebook, Instagram, Award,
} from "lucide-react";

const PLATFORM_NAVY = "#1a2b4a";
const PLATFORM_GOLD = "#c9a227";

// Normalize a possibly-missing hex color to a usable CSS value.
function color(val: string | null | undefined, fallback: string): string {
  if (!val) return fallback;
  const v = val.trim();
  return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : fallback;
}

export default function Storefront({ slug }: { slug: string }) {
  const { data, isLoading } = trpc.affiliates.bySlug.useQuery({ slug }, { retry: false });

  // Capture this affiliate's referral code for the visitor's session.
  const { setReferral } = useReferral(null);
  useEffect(() => {
    if (data?.referralCode) setReferral(data.referralCode);
  }, [data?.referralCode, setReferral]);

  const brand = useMemo(() => {
    return {
      primary: color(data?.primaryColor, PLATFORM_NAVY),
      accent: color(data?.accentColor, PLATFORM_GOLD),
    };
  }, [data?.primaryColor, data?.accentColor]);

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

  const categories = [
    { name: "Base", href: "/catalog?category=Base" },
    { name: "Wall", href: "/catalog?category=Wall" },
    { name: "Tall", href: "/catalog?category=Tall" },
    { name: "ADA", href: "/catalog?category=ADA" },
    { name: "Vanity", href: "/catalog?category=Vanity" },
    { name: "Accessory", href: "/catalog?category=Accessory" },
  ];

  const features = [
    { icon: Palette, title: "Every Door Style", desc: "Browse dozens of finishes and pick the look that fits the room." },
    { icon: Ruler, title: "Free 2D Kitchen Design", desc: "Lay out your kitchen, place cabinets, and get a full materials list." },
    { icon: FileSpreadsheet, title: "Fast Quotes", desc: "Scan a plan, import a list, or type codes — priced in seconds." },
    { icon: Grid3X3, title: "Full Cabinet Catalog", desc: "Base, wall, tall, vanity, ADA, and specialty cabinets in one place." },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Storefront header ───────────────────────────────────────────── */}
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
          <nav className="hidden md:flex items-center gap-1">
            <Link href={withRef("/catalog")}>
              <Button variant="ghost" size="sm">Catalog</Button>
            </Link>
            <Link href={withRef("/styles")}>
              <Button variant="ghost" size="sm">Door Styles</Button>
            </Link>
            <Link href={withRef("/packages")}>
              <Button variant="ghost" size="sm">Packages</Button>
            </Link>
            <Link href={withRef("/design")}>
              <Button variant="ghost" size="sm">Design Tool</Button>
            </Link>
          </nav>
          <Link href={withRef("/order/new")}>
            <Button size="sm" className="font-semibold text-white" style={{ backgroundColor: brand.accent }}>
              Get a Quote
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden text-white" style={{ backgroundColor: brand.primary }}>
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(255,255,255,0.04) 40px, rgba(255,255,255,0.04) 80px)`,
            }}
          />
          {data.heroImageUrl && (
            <div className="absolute inset-0">
              <img src={data.heroImageUrl} alt="" className="h-full w-full object-cover opacity-25" />
              <div className="absolute inset-0" style={{ backgroundColor: brand.primary, opacity: 0.7 }} />
            </div>
          )}
          <div className="relative container py-20 md:py-28">
            <div className="max-w-3xl">
              {data.yearsInBusiness ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
                  <Award className="h-3.5 w-3.5" style={{ color: brand.accent }} />
                  Serving customers for {data.yearsInBusiness}+ years
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brand.accent }} />
                  Quality Cabinets & Design
                </div>
              )}
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                {data.tagline || (
                  <>
                    Beautiful Kitchens,
                    <br />
                    <span style={{ color: brand.accent }}>Built Around You.</span>
                  </>
                )}
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl leading-relaxed">
                {data.aboutText ||
                  `Shop a full cabinet catalog, choose from dozens of door styles, design your kitchen in 2D, and get a fast quote — all backed by ${data.storeName}.`}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={withRef("/catalog")}>
                  <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                    Browse Cabinets <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href={withRef("/design")}>
                  <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                    Design Your Kitchen
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Door-style strip ──────────────────────────────────────────── */}
        <section className="py-10 border-b border-border bg-muted/20">
          <div className="container flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-sm font-medium text-muted-foreground shrink-0">
              Every cabinet, in the door style you want:
            </p>
            <div className="flex flex-wrap justify-center md:justify-end gap-3">
              {["Shaker", "Raised Panel", "Contemporary Slab", "Inset", "Beaded"].map((name) => (
                <span key={name} className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ──────────────────────────────────────────────────── */}
        <section className="py-16 md:py-20">
          <div className="container">
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">Everything for Your Project</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                From browsing to a finished quote, {data.storeName} makes it easy.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                  <div className="inline-flex p-2.5 rounded-lg mb-4 text-white" style={{ backgroundColor: brand.primary }}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-serif text-lg font-bold mb-1.5">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Shop by category ──────────────────────────────────────────── */}
        <section className="py-16 md:py-20 bg-muted/30">
          <div className="container">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-serif text-2xl md:text-3xl font-bold">Shop by Category</h2>
              <Link href={withRef("/catalog")}>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                  View all <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <Link key={cat.name} href={withRef(cat.href)}>
                  <div className="group rounded-xl border border-border bg-card p-5 text-center hover:shadow-md transition-all cursor-pointer h-full">
                    <div className="font-serif text-lg font-bold mb-1 transition-colors" style={{ color: brand.primary }}>
                      {cat.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA band ──────────────────────────────────────────────────── */}
        <section className="py-16" style={{ backgroundColor: brand.primary }}>
          <div className="container text-center text-white">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">Ready for a Quote?</h2>
            <p className="text-white/75 max-w-2xl mx-auto mb-8">
              Scan an existing plan, upload a list, or type your cabinet codes. We'll price it for your
              door style and get it ready — no obligation.
            </p>
            <Link href={withRef("/order/new")}>
              <Button size="lg" className="font-semibold text-white gap-2" style={{ backgroundColor: brand.accent }}>
                Build Your Order <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Storefront footer (store contact) ───────────────────────────── */}
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
              <div className="font-semibold text-white mb-3">Contact</div>
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
              <div className="font-semibold text-white mb-3">Shop</div>
              <ul className="space-y-2 text-sm">
                <li><Link href={withRef("/catalog")} className="hover:text-white">Cabinet Catalog</Link></li>
                <li><Link href={withRef("/styles")} className="hover:text-white">Door Styles</Link></li>
                <li><Link href={withRef("/packages")} className="hover:text-white">Kitchen Packages</Link></li>
                <li><Link href={withRef("/design")} className="hover:text-white">2D Design Tool</Link></li>
                <li><Link href={withRef("/order/new")} className="hover:text-white">Get a Quote</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/15 text-xs text-white/50 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} {data.storeName}. All rights reserved.</span>
            <span>Powered by Cabinet Dealz</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
