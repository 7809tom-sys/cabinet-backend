import { Link } from "wouter";
import { useEffect } from "react";
import { toast } from "sonner";
import { ArrowRight, Grid3X3, Palette, Ruler, FileSpreadsheet, Building2, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";

// ─── Hero Section ─────────────────────────────────────────────────────────────

function Hero() {
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
              The Trade Platform for Cabinet Professionals
            </div>

            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Design the
              <br />
              <span className="text-[var(--color-gold)]">Kitchen of Their Dreams.</span>
            </h1>

            <p className="text-lg md:text-xl text-white/75 mb-8 leading-relaxed">
              Browse one unified cabinet catalog, choose from a wide range of door styles, and
              compare trade pricing instantly. Design kitchens in 2D and submit orders — all
              in one membership.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/catalog">
                <Button size="lg" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold gap-2">
                  Browse Catalog
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/styles">
                <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 gap-2">
                  Explore Door Styles
                </Button>
              </Link>
              <a href={getLoginUrl()}>
                <Button size="lg" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 gap-2">
                  Member Sign In
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>

          {/* Right: kitchen lifestyle collage */}
          <div className="relative hidden lg:block">
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <img
                src={KITCHEN_SCENES["shaker-white"]}
                alt="Designed kitchen"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden w-40 overflow-hidden rounded-xl shadow-xl ring-4 ring-[var(--color-navy)] xl:block">
              <img
                src={KITCHEN_SCENES["shaker-gray"]}
                alt="Gray shaker kitchen"
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
            { value: "One", label: "Unified Catalog" },
            { value: "Trade", label: "Member Pricing" },
            { value: "2D", label: "Kitchen Designer" },
            { value: "1-Click", label: "Order Submission" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-[var(--color-gold)]">{stat.value}</div>
              <div className="text-sm text-white/60 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Audience Cards ───────────────────────────────────────────────────────────

function AudienceCards() {
  const cards = [
    {
      icon: Building2,
      title: "Suppliers",
      description: "Join the supply network to put your catalog in front of every member dealer, with private or published listing control.",
      cta: "Supplier Portal",
      href: "/portal/distributor",
      color: "bg-blue-50 dark:bg-blue-950/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: Grid3X3,
      title: "Dealers & Contractors",
      description: "Access member trade pricing, build kitchen designs, place bulk orders, and manage your projects in one place.",
      cta: "Dealer Portal",
      href: "/portal/dealer",
      color: "bg-amber-50 dark:bg-amber-950/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: Users,
      title: "Affiliates",
      description: "Run your own branded storefront on top of the platform catalog and earn on every order you bring in.",
      cta: "Affiliate Program",
      href: "/portal/dealer",
      color: "bg-green-50 dark:bg-green-950/30",
      iconColor: "text-green-600 dark:text-green-400",
    },
  ];

  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            Built for the Cabinet Trade
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Whether you supply, sell, or refer — there's a membership workflow designed for you.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div key={card.title} className={`rounded-xl p-6 ${card.color} border border-border cabinet-card`}>
              <div className={`inline-flex p-2.5 rounded-lg bg-white dark:bg-card mb-4 ${card.iconColor}`}>
                <card.icon className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-bold text-foreground mb-2">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">{card.description}</p>
              <Link href={card.href}>
                <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-card">
                  {card.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Platform Features ────────────────────────────────────────────────────────

function PlatformFeatures() {
  const features = [
    {
      icon: Palette,
      title: "One-Click Style Switcher",
      description: "Select a kitchen configuration, then instantly swap the door style or line to see updated pricing across all items.",
    },
    {
      icon: Ruler,
      title: "2D Kitchen Design Tool",
      description: "Draw your room walls, place cabinets from the catalog, and export a full bill of materials — all in the browser.",
    },
    {
      icon: FileSpreadsheet,
      title: "CSV & Bulk Ordering",
      description: "Upload a spreadsheet or scan barcodes to build a full kitchen order in seconds. Perfect for contractors.",
    },
    {
      icon: Grid3X3,
      title: "Photo-to-Cart OCR",
      description: "Upload a floor plan or quote. Our system reads the cabinet codes and auto-populates the order for review.",
    },
  ];

  return (
    <section className="py-16 md:py-20">
      <div className="container">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-4">
              <span className="h-px w-8 bg-[var(--color-wood)]" />
              Platform Features
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Move Cabinets Faster
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              A shared trade platform where the supply network and member dealers run on the same
              backend technology — keeping costs low and capabilities high across the supply chain.
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
                  Build an Order
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-2">
                Scan a quote, import a CSV, or type your codes — priced and ready in seconds.
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
              <div className="mt-4 text-xs text-white/40 text-center">B24 — 24" Double Door Base Cabinet · Member Pricing</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Supply Network Strip ─────────────────────────────────────────────────────

function DistributorsStrip() {
  // Door-style-first: we promote the breadth of finishes, never supplier names.
  const styles = ["Shaker", "Raised Panel", "Contemporary Slab", "Inset", "Beaded"];
  return (
    <section className="py-10 border-y border-border bg-muted/20">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-sm font-medium text-muted-foreground shrink-0">
            Every cabinet, in the door style you want:
          </p>
          <div className="flex flex-wrap justify-center md:justify-end gap-3">
            {styles.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Category Quick Links ─────────────────────────────────────────────────────

function CategoryLinks() {
  const categories = [
    { name: "Base", description: "Standard base cabinets, sink bases, drawer bases", href: "/catalog?category=Base" },
    { name: "Wall", description: "Upper wall cabinets in all widths and heights", href: "/catalog?category=Wall" },
    { name: "Tall", description: "Pantry, utility, and full-height cabinets", href: "/catalog?category=Tall" },
    { name: "ADA", description: "Accessible design, ADA-compliant cabinets", href: "/catalog?category=ADA" },
    { name: "Vanity", description: "Bathroom vanity bases and wall cabinets", href: "/catalog?category=Vanity" },
    { name: "Accessory", description: "Fillers, trim, molding, and specialty items", href: "/catalog?category=Accessory" },
  ];

  return (
    <section className="py-16 md:py-20">
      <div className="container">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
            Shop by Category
          </h2>
          <Link href="/catalog">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              View all
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <Link key={cat.name} href={cat.href}>
              <div className="group rounded-xl border border-border bg-card p-4 text-center hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                <div className="font-serif text-lg font-bold text-foreground group-hover:text-primary transition-colors mb-1">
                  {cat.name}
                </div>
                <div className="text-xs text-muted-foreground leading-snug hidden md:block">
                  {cat.description}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Style Showcase (dream-kitchen scenes) ─────────────────────────────────────

function StyleShowcase() {
  const looks = [
    { name: "White Shaker", blurb: "Bright, timeless, the #1 request", scene: KITCHEN_SCENES["shaker-white"], href: "/styles" },
    { name: "Gray Shaker", blurb: "Soft, modern transitional", scene: KITCHEN_SCENES["shaker-gray"], href: "/styles" },
    { name: "Cherry Raised Panel", blurb: "Warm, traditional elegance", scene: KITCHEN_SCENES["raised-cherry"], href: "/styles" },
    { name: "Natural Slab", blurb: "Clean, handleless, contemporary", scene: KITCHEN_SCENES["slab-natural"], href: "/styles" },
    { name: "Espresso Shaker", blurb: "Rich, dramatic, modern", scene: KITCHEN_SCENES["shaker-espresso"], href: "/styles" },
  ];
  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-wood)] mb-3">
            <span className="h-px w-8 bg-[var(--color-wood)]" />
            Shop the Look
            <span className="h-px w-8 bg-[var(--color-wood)]" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
            Find Your Kitchen Style
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every look below is available across the full catalog — pick a style, then build the whole kitchen around it.
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
                Shop this kitchen <ArrowRight className="h-4 w-4" />
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
              Explore All Door Styles <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
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
              The trade platform connecting the cabinet supply network with member dealers and affiliates.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Catalog</div>
            <ul className="space-y-2 text-sm">
              {["Base Cabinets", "Wall Cabinets", "Tall Cabinets", "ADA Cabinets", "Vanity", "Accessories"].map((item) => (
                <li key={item}>
                  <Link href={`/catalog?category=${item.split(" ")[0]}`} className="hover:text-white transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Tools</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: "Door Style Selector", href: "/styles" },
                { label: "2D Design Tool", href: "/design" },
                { label: "Bulk Order", href: "/bulk-order" },
                { label: "Photo-to-Cart", href: "/ocr" },
                { label: "Join Our Pro Network", href: "/pro-network" },
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
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Portals</div>
            <ul className="space-y-2 text-sm">
              {[
                { label: "Supplier Portal", href: "/portal/distributor" },
                { label: "Dealer Portal", href: "/portal/dealer" },
                { label: "Admin Dashboard", href: "/admin" },
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
          <span>© {new Date().getFullYear()} Cabinet Dealz. All rights reserved.</span>
          <span>A members-only trade platform.</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Home Page ───────────────────────────────────────────────────────────

export default function Home() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error")) {
      toast.error("Sign-in didn't complete. Please try again.");
      // Clean the flag from the URL so it doesn't re-fire on refresh.
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Hero />
      <DistributorsStrip />
      <StyleShowcase />
      <AudienceCards />
      <PlatformFeatures />
      <CategoryLinks />
      <Footer />
    </div>
  );
}
