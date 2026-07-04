import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";
import { categorySlug, CATEGORY_GRADIENT, formatPrice } from "@/lib/pelican";
import { useCart } from "@/contexts/CartContext";
import { ArrowLeft, Minus, PencilRuler, Plus, ShoppingCart, Star, Waves } from "lucide-react";
import { toast } from "sonner";

export default function SurfacesProduct({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.pelican.bySlug.useQuery({ slug });
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);

  useSeo({
    title: data
      ? `${data.name} — Surfaces & Fixtures | Cabinet Dealz`
      : "Product — Surfaces & Fixtures | Cabinet Dealz",
    description: data?.description?.slice(0, 160),
    type: "product",
    image: data?.imageUrl ?? undefined,
  });

  const handleAddToCart = () => {
    if (!data) return;
    const res = addItem({
      masterCode: data.pelicanCode,
      name: data.name,
      styleId: 0, // No style for pelican products
      styleLabel: data.category,
      distributorId: null, // Pelican products bypass distributor lock
      tier: "homeowner",
      unitPrice: data.sellPrice ?? null,
      qty,
      imageUrl: data.imageUrl ?? null,
      category: data.category,
    });
    if (res.ok) {
      toast.success(`Added ${qty}\u00d7 ${data.name} to cart`, {
        description: data.category,
        action: { label: "View Cart", onClick: () => navigate("/cart") },
      });
    }
  };

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

          {/* Quantity + Add to Cart */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center text-sm font-medium">{qty}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={handleAddToCart}
              className="gap-2"
              disabled={!data.sellPrice}
            >
              <ShoppingCart className="h-4 w-4" /> Add to Cart
            </Button>
            <Link href="/design">
              <Button variant="outline" className="gap-2">
                <PencilRuler className="h-4 w-4" /> Add to a Design
              </Button>
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
