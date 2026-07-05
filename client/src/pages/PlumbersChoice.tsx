import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PelicanProductCard } from "@/components/pelican/PelicanProductCard";
import { formatPrice } from "@/lib/pelican";
import { useSeo } from "@/hooks/useSeo";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import {
  ShowerHead, Droplets, Search, ShoppingCart, ArrowRight,
  CheckCircle2, Wrench, Truck, Shield, Star,
} from "lucide-react";

const HERO_IMG = "/manus-storage/plumbers-choice-hero_5d58ea20.jpg";

// The two Pelican categories that make up a plumber's bathroom install kit
const PLUMBER_CATEGORIES = ["Shower & Bath", "Toilets & Bidets"] as const;

type TabId = "all" | "shower" | "toilets";
const TABS: { id: TabId; label: string; icon: React.ReactNode; category?: string }[] = [
  { id: "all", label: "All Products", icon: <Wrench className="h-4 w-4" /> },
  { id: "shower", label: "Shower & Bath", icon: <ShowerHead className="h-4 w-4" />, category: "Shower & Bath" },
  { id: "toilets", label: "Toilets & Bidets", icon: <Droplets className="h-4 w-4" />, category: "Toilets & Bidets" },
];

export default function PlumbersChoice() {
  useSeo({
    title: "StoneCreek Plumber's Choice Collection | Cabinet Dealz",
    description:
      "Everything a plumber needs for a complete bathroom install — showers, toilets, bidets, and bath fixtures. Trade pricing, one order, one shipment.",
  });

  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch both categories
  const { data: showerData, isLoading: loadingShower } = trpc.pelican.byCategory.useQuery(
    { category: "Shower & Bath" as any, scope: "catalog", limit: 200, offset: 0 },
    { staleTime: 60_000 }
  );
  const { data: toiletData, isLoading: loadingToilets } = trpc.pelican.byCategory.useQuery(
    { category: "Toilets & Bidets" as any, scope: "catalog", limit: 200, offset: 0 },
    { staleTime: 60_000 }
  );

  const isLoading = loadingShower || loadingToilets;

  const allProducts = useMemo(() => {
    const shower = showerData?.items ?? [];
    const toilets = toiletData?.items ?? [];
    return [...shower, ...toilets];
  }, [showerData, toiletData]);

  const filtered = useMemo(() => {
    let items = allProducts;
    if (activeTab === "shower") items = items.filter((p) => p.category === "Shower & Bath");
    if (activeTab === "toilets") items = items.filter((p) => p.category === "Toilets & Bidets");
    if (debounced) {
      const q = debounced.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.pelicanCode || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [allProducts, activeTab, debounced]);

  const { addItem } = useCart();

  const handleAddAll = () => {
    let added = 0;
    for (const p of filtered.slice(0, 20)) {
      if (p.sellPrice) {
        addItem({
          masterCode: p.pelicanCode || `PL-${p.id}`,
          name: p.name,
          styleId: 0,
          styleLabel: "Plumber's Choice",
          distributorId: null,
          tier: "wholesale",
          unitPrice: p.sellPrice,
          qty: 1,
          imageUrl: p.imageUrl ?? undefined,
          category: p.category,
        });
        added++;
      }
    }
    if (added > 0) toast.success(`Added ${added} items to cart`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[var(--color-navy)]">
        <div className="absolute inset-0">
          <img
            src={HERO_IMG}
            alt="Modern bathroom with premium fixtures"
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)] via-[var(--color-navy)]/80 to-transparent" />
        </div>
        <div className="container relative py-20 md:py-28">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/30 hover:bg-[var(--color-gold)]/30">
              <Star className="h-3 w-3 mr-1 fill-current" />
              StoneCreek Exclusive
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight">
              Plumber's Choice
              <span className="block text-[var(--color-gold)]">Collection</span>
            </h1>
            <p className="mt-4 text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
              Everything you need for a complete bathroom install — showers, toilets, bidets, and bath fixtures.
              Trade pricing, one order, one shipment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
              >
                Shop the Collection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
                asChild
              >
                <Link href="/stonecreek">View StoneCreek Faucets</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="border-b border-border bg-muted/30">
        <div className="container py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {[
              { icon: <Wrench className="h-5 w-5" />, label: "Complete Install Kits" },
              { icon: <Truck className="h-5 w-5" />, label: "One Shipment" },
              { icon: <Shield className="h-5 w-5" />, label: "Trade Pricing" },
              { icon: <CheckCircle2 className="h-5 w-5" />, label: "Pro Quality" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <span className="text-[var(--color-gold)]">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fixture Photo Match CTA */}
      <section className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-b border-border">
        <div className="container py-8">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
            <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-primary/10 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-semibold">Have a fixture you want to match?</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Snap a photo of any sink, faucet, bathtub, shower, or toilet and our AI will find matching products from our catalog.
              </p>
            </div>
            <Button asChild className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold shrink-0">
              <Link href="/fixture-photo">
                Try Fixture Photo Match
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="container py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-serif font-bold">
              Shop the Collection
            </h2>
            <p className="text-muted-foreground mt-1">
              {allProducts.length > 0
                ? `${allProducts.length} products for your next bathroom project`
                : "Loading products..."}
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? "bg-[var(--color-navy)] text-white" : ""}
            >
              {tab.icon}
              <span className="ml-1.5">{tab.label}</span>
              {!isLoading && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {tab.id === "all"
                    ? allProducts.length
                    : allProducts.filter((p) => p.category === tab.category).length}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {/* Product Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShowerHead className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">No products found</p>
            <p className="text-sm text-muted-foreground/70">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product) => (
              <PelicanProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="bg-[var(--color-navy)] py-16">
        <div className="container text-center">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-white">
            Ready to Outfit Your Next Bathroom?
          </h2>
          <p className="mt-3 text-white/70 max-w-lg mx-auto">
            Add everything you need to the cart and request a quote — we'll get you trade pricing
            and coordinate a single shipment.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              asChild
            >
              <Link href="/cart">
                <ShoppingCart className="mr-2 h-4 w-4" />
                View Cart
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              asChild
            >
              <Link href="/stonecreek">Browse StoneCreek Faucets</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
