import { useEffect, useMemo, useState } from "react";
import { Search, PackageCheck, Truck, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";

const PAGE_SIZE = 24;

function price(value: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "Price unavailable";
}

export default function Hardware() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  useSeo({
    title: "Cabinet Hardware | Cabinet Dealz",
    description: "Browse decorative cabinet hardware with current list prices and supplier product images.",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const input = useMemo(() => ({
    category,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [category, debouncedSearch, page]);
  const { data: categories = [] } = trpc.hardware.categories.useQuery();
  const { data, isLoading, error } = trpc.hardware.list.useQuery(input);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border/60 bg-muted/40">
        <div className="container py-8 md:py-10">
          <div className="grid gap-5 lg:grid-cols-[1fr,minmax(280px,360px)] lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-gold)]">
                <PackageCheck className="h-4 w-4" /> Decorative Hardware
              </div>
              <h1 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Cabinet Hardware</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Shop knobs, pulls, appliance handles, and cabinet hardware at the current list price. Each item is shown with its matching supplier product image.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-9" placeholder="Search by item, collection, finish, or SKU" aria-label="Search cabinet hardware" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button size="sm" variant={!category ? "default" : "outline"} onClick={() => { setCategory(undefined); setPage(0); }}>All hardware</Button>
            {categories.map((item) => (
              <Button key={item.category} size="sm" variant={category === item.category ? "default" : "outline"} onClick={() => { setCategory(item.category); setPage(0); }}>
                {item.category} ({item.count})
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-7 md:py-9">
        <Card className="mb-7 flex gap-3 border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 p-4 text-sm leading-6">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold)]" />
          <div><strong>Shipping notice:</strong> Hardware is consolidated into one package per order. Free hardware shipping is available when it is ordered with a qualifying kitchen order. Stand-alone hardware checkout will open after its verified shipping profile is configured.</div>
        </Card>

        {error ? (
          <Card className="p-10 text-center text-destructive">Could not load hardware. {error.message}</Card>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-xl" />)}
          </div>
        ) : total === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No hardware matches your search.</Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{total} approved item{total === 1 ? "" : "s"}</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data?.items.map((item) => (
                <Card key={item.id} className="group overflow-hidden border-border/70">
                  <div className="aspect-square bg-muted/30 p-3">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.025]" /> : null}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.category ?? "Decorative Hardware"}</p>
                    <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{item.name}</h2>
                    <p className="text-xs font-medium text-muted-foreground">Item: {item.sku}</p>
                    <p className="text-lg font-bold text-[var(--color-navy)] dark:text-foreground">{price(item.listPrice)}</p>
                    <p className="text-xs text-muted-foreground">Call or include with your kitchen order to purchase.</p>
                  </div>
                </Card>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="mt-9 flex items-center justify-center gap-3">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</span>
                <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
