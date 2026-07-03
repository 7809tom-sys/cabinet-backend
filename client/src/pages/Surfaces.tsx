import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";
import {
  PELICAN_STOREFRONT_CATEGORIES,
  categorySlug,
  CATEGORY_BLURB,
  CATEGORY_GRADIENT,
} from "@/lib/pelican";
import { ArrowRight, Waves, PencilRuler } from "lucide-react";

export default function Surfaces() {
  useSeo({
    title: "Surfaces & Fixtures — Quartz, Flooring, Tile, Sinks & Baths | Cabinet Dealz",
    description:
      "Shop Pelican surfaces and fixtures: quartz countertops, waterproof flooring, tile & mosaic, sinks, faucets, showers, tubs, toilets and bidets — with trade pricing.",
  });

  // Only categories that actually have visible catalog items are shown.
  const { data: categories, isLoading } = trpc.pelican.categories.useQuery({ scope: "catalog" });
  const available = new Set((categories ?? []).map((c) => c.category));
  const visibleCats = PELICAN_STOREFRONT_CATEGORIES.filter((c) => available.has(c));

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="border-b border-border/50 bg-[var(--color-navy)] text-white">
        <div className="container py-14">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium">
            <Waves className="h-3.5 w-3.5 text-[var(--color-gold)]" /> Surfaces & Fixtures
          </div>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight md:text-5xl">
            Finish the whole room, not just the cabinets.
          </h1>
          <p className="mt-4 max-w-2xl text-white/70">
            Quartz countertops, waterproof flooring, tile, sinks, faucets, showers, tubs and
            more — sourced through Pelican and priced for the trade. Add them straight into
            your kitchen design or browse by category below.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/design">
              <Button className="gap-2 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90">
                <PencilRuler className="h-4 w-4" /> Add to a Design
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Category grid */}
      <section className="container py-12">
        <h2 className="mb-6 font-serif text-2xl font-bold">Shop by category</h2>
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PELICAN_STOREFRONT_CATEGORIES.map((c) => (
              <Skeleton key={c} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : visibleCats.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            The surfaces catalog is being updated. Please check back shortly.
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCats.map((c) => {
              const count = categories?.find((x) => x.category === c)?.count ?? 0;
              return (
                <Link key={c} href={`/surfaces/${categorySlug(c)}`}>
                  <Card className="group relative h-56 overflow-hidden border-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="absolute inset-0" style={{ background: CATEGORY_GRADIENT[c] }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <div className="text-lg font-bold">{c}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-white/80">
                        {CATEGORY_BLURB[c]}
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-gold)]">
                        Browse {count > 0 ? `(${count})` : ""}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
