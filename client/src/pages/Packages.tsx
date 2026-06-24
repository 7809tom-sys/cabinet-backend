import { Link } from "wouter";
import { ArrowRight, Check, Package as PackageIcon, Hammer, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const SHAPE_ART: Record<string, React.ReactNode> = {
  "L-Shape": (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <path d="M14 14 H66 V26 H26 V66 H14 Z" className="fill-[var(--color-gold)]/80" />
    </svg>
  ),
  "U-Shape": (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <path d="M14 14 H26 V54 H54 V14 H66 V66 H14 Z" className="fill-[var(--color-gold)]/80" />
    </svg>
  ),
  Galley: (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <rect x="14" y="14" width="52" height="14" className="fill-[var(--color-gold)]/80" />
      <rect x="14" y="52" width="52" height="14" className="fill-[var(--color-gold)]/40" />
    </svg>
  ),
};

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function Packages() {
  const { data: packages, isLoading, isError, refetch } = trpc.packages.list.useQuery();

  return (
    <div className="bg-[var(--color-cream,#f7f4ee)] min-h-screen">
      {/* Hero */}
      <section className="bg-[var(--color-navy)] text-white">
        <div className="container py-14 md:py-20">
          <Badge className="mb-4 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
            Kitchen Packages
          </Badge>
          <h1 className="font-serif text-3xl md:text-5xl font-bold max-w-3xl leading-tight">
            Whole-kitchen floor-plan bundles — priced as one package, shipped your way.
          </h1>
          <p className="mt-5 text-white/75 max-w-2xl text-lg">
            Pick a standard layout, see the full cabinet list, and quote a complete kitchen in
            seconds. Every package is benchmarked against the major online sellers, and ships your
            way — <span className="font-semibold text-white">assembled or flat-pack (RTA)</span>.
          </p>
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2 text-white/80">
              <PackageIcon className="h-4 w-4 text-[var(--color-gold)]" /> Complete cabinet bill of materials
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Hammer className="h-4 w-4 text-[var(--color-gold)]" /> Assembled or flat-pack — your choice
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Truck className="h-4 w-4 text-[var(--color-gold)]" /> Shipping quoted live at order from network hubs
            </div>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="container py-12 md:py-16">
        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              We couldn't load the kitchen packages right now.
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center rounded-lg bg-[var(--color-navy)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--color-navy)]/90"
            >
              Try again
            </button>
          </div>
        )}

        {!isError && !isLoading && (packages?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-border bg-white p-10 text-center">
            <p className="text-sm text-muted-foreground">No kitchen packages are available yet.</p>
          </div>
        )}

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[460px] w-full rounded-2xl" />
              ))
            : packages?.map((p) => {
                const pctUnder = Math.round(
                  ((p.competitorAvg - p.suggestedRetail) / p.competitorAvg) * 100
                );
                return (
                  <Link
                    key={p.slug}
                    href={`/packages/${p.slug}`}
                    className="group flex flex-col rounded-2xl border border-border bg-white overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                  >
                    {/* Layout art */}
                    <div className="relative bg-gradient-to-br from-[var(--color-navy)] to-[#243456] p-6">
                      <div className="mx-auto h-32 w-32 rounded-xl bg-white/5 p-3">
                        {SHAPE_ART[p.shape] ?? SHAPE_ART["Galley"]}
                      </div>
                      <Badge className="absolute top-4 right-4 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
                        {p.cabinetCount} cabinets
                      </Badge>
                    </div>

                    {/* Body */}
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="font-serif text-xl font-bold text-[var(--color-navy)]">
                        {p.name}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground flex-1">{p.blurb}</p>

                      {/* Pricing block */}
                      <div className="mt-5 rounded-xl bg-[var(--color-cream,#f7f4ee)] p-4">
                        <div className="flex items-end justify-between">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Suggested retail
                            </div>
                            <div className="font-serif text-2xl font-bold text-[var(--color-navy)]">
                              {usd(p.suggestedRetail)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground line-through">
                              {usd(p.competitorAvg)} avg
                            </div>
                            <Badge variant="secondary" className="mt-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              {pctUnder}% under market
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-sm font-medium text-[var(--color-navy)]">
                        <span className="flex items-center gap-1.5 text-emerald-600">
                          <Check className="h-4 w-4" /> Assembled or RTA
                        </span>
                        <span className="flex items-center gap-1 group-hover:gap-2 transition-all">
                          View package <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Competitor figures are assembled white-shaker package prices captured as a planning
          benchmark; sellers run frequent sales, so treat these as guidance rather than a live
          quote. Cabinet pricing shown excludes freight — shipping is quoted live (LTL carrier)
          at order time.
        </p>
      </section>
    </div>
  );
}
