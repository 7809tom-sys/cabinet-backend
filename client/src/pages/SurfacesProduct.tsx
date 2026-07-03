import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";
import { categorySlug, CATEGORY_GRADIENT, formatPrice } from "@/lib/pelican";
import { ArrowLeft, PencilRuler, Star, Waves } from "lucide-react";

export default function SurfacesProduct({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.pelican.bySlug.useQuery({ slug });

  useSeo({
    title: data
      ? `${data.name} — Surfaces & Fixtures | Cabinet Dealz`
      : "Product — Surfaces & Fixtures | Cabinet Dealz",
    description: data?.description?.slice(0, 160),
    type: "product",
    image: data?.imageUrl ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="grid gap-8 md:grid-cols-2">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container py-16 text-center">
        <Waves className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Product not found</h1>
        <p className="mt-2 text-muted-foreground">
          This item may no longer be available.
        </p>
        <Link href="/surfaces">
          <Button className="mt-5 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Surfaces
          </Button>
        </Link>
      </div>
    );
  }

  const gradient = CATEGORY_GRADIENT[data.category] ?? "linear-gradient(135deg,#e5e7eb,#cbd5e1)";

  return (
    <div className="container py-8">
      <button
        onClick={() => navigate(`/surfaces/${categorySlug(data.category)}`)}
        className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {data.category}
      </button>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Image */}
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] w-full">
            {data.imageUrl ? (
              <img src={data.imageUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: gradient }}
              >
                <span className="text-sm font-medium uppercase tracking-wide text-black/40">
                  {data.category}
                </span>
              </div>
            )}
            {data.isPopular && (
              <Badge className="absolute left-3 top-3 gap-1 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
                <Star className="h-3 w-3 fill-current" /> Featured
              </Badge>
            )}
          </div>
        </Card>

        {/* Details */}
        <div>
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {data.category}
            {data.subCategory ? ` · ${data.subCategory}` : ""}
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold">{data.name}</h1>

          <div className="mt-4 text-3xl font-bold text-[var(--color-navy)] dark:text-foreground">
            {formatPrice(data.sellPrice)}
          </div>
          {data.size && (
            <div className="mt-1 text-sm text-muted-foreground">Size: {data.size}</div>
          )}

          {data.description && (
            <p className="mt-5 whitespace-pre-line leading-relaxed text-foreground/80">
              {data.description}
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/design">
              <Button className="gap-2 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90">
                <PencilRuler className="h-4 w-4" /> Add to a Design
              </Button>
            </Link>
            <Link href="/pro-network">
              <Button variant="outline">Talk to a Pro</Button>
            </Link>
          </div>

          <div className="mt-6 text-xs text-muted-foreground">
            Item code: {data.pelicanCode}
          </div>
        </div>
      </div>
    </div>
  );
}
