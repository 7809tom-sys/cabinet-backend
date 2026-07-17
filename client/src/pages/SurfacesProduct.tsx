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
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, DollarSign, Minus, PencilRuler, Plus, ShoppingCart, Star, Tag, TrendingDown, Waves } from "lucide-react";
import { toast } from "sonner";

export default function SurfacesProduct({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.pelican.bySlug.useQuery({ slug });
  const { addItem } = useCart();
  const { user } = useAuth();
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

  // Pricing breakdown logic
  const sellPrice = data.sellPrice;
  const msrp = data.msrp ? Number(data.msrp) : null;
  const listPrice = data.listPrice ? Number(data.listPrice) : null;
  // Use MSRP as the "compare at" reference; fall back to listPrice if MSRP is missing
  const compareAt = msrp && msrp > (sellPrice ?? 0) ? msrp : listPrice && listPrice > (sellPrice ?? 0) ? listPrice : null;
  const savePct = compareAt && sellPrice && compareAt > sellPrice
    ? Math.round(((compareAt - sellPrice) / compareAt) * 100)
    : null;

  // Cost breakdown - show our cost (yourCost or listPrice as fallback)
  const isOwner = user?.role === "admin";
  const ourCost = data.yourCost ? Number(data.yourCost) : (data.listPrice ? Number(data.listPrice) : null);
  const yourCost = ourCost;
  const marginDollars = isOwner && yourCost != null && sellPrice != null ? Math.round((sellPrice - yourCost) * 100) / 100 : null;
  const marginPct = marginDollars != null && sellPrice != null && sellPrice > 0
    ? Math.round((marginDollars / sellPrice) * 1000) / 10
    : null;

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

          {/* ─── Pricing Breakdown Card ─── */}
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Pricing</span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="text-3xl font-bold text-[var(--color-navy)] dark:text-foreground">
                {formatPrice(sellPrice)}
              </div>
              {compareAt != null && (
                <div className="text-base text-muted-foreground line-through">
                  ${compareAt.toFixed(2)}
                </div>
              )}
              {savePct != null && savePct > 0 && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  Save {savePct}%
                </Badge>
              )}
            </div>
            {/* Price detail rows */}
            <div className="mt-3 space-y-1.5 text-sm">
              {yourCost != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Our Cost
                  </span>
                  <span className="font-medium">${yourCost.toFixed(2)}</span>
                </div>
              )}
              {compareAt != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> MSRP (3× Cost)
                  </span>
                  <span className="font-medium line-through">${compareAt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5" /> Your Price
                </span>
                <span className="font-semibold text-foreground">
                  {sellPrice != null ? `$${sellPrice.toFixed(2)}` : "\u2014"}
                </span>
              </div>
              {savePct != null && savePct > 0 && (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> You Save vs MSRP
                  </span>
                  <span className="font-semibold">
                    ${(compareAt! - sellPrice!).toFixed(2)} ({savePct}%)
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Trade member pricing · no hidden fees
            </div>

            {/* Owner-only cost breakdown */}
            {isOwner && yourCost != null && (
              <div className="mt-3 pt-3 border-t border-dashed border-amber-500/60 rounded-md bg-amber-500/5 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
                  <span>Owner view · not shown to customers</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">My Cost</div>
                    <div className="font-semibold text-foreground">${yourCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Sells At</div>
                    <div className="font-semibold text-foreground">
                      {sellPrice != null ? `$${sellPrice.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Margin</div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {marginDollars != null
                        ? `$${marginDollars.toFixed(2)}${marginPct != null ? ` (${marginPct}%)` : ""}`
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {data.size && (
            <div className="mt-3 text-sm text-muted-foreground">Size: {data.size}</div>
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

      {/* Complete this look: sink ↔ faucet pairing */}
      {(data.subCategory === "Faucets" || data.subCategory === "Sinks") && (
        <CompleteThisLook slug={slug} pairedType={data.subCategory === "Faucets" ? "Sinks" : "Faucets"} />
      )}
    </div>
  );
}

function CompleteThisLook({ slug, pairedType }: { slug: string; pairedType: string }) {
  const [, navigate] = useLocation();
  const { addItem } = useCart();
  const { data: related, isLoading } = trpc.pelican.relatedProducts.useQuery(
    { slug, limit: 4 },
    { staleTime: 60_000 }
  );

  if (isLoading) return null;
  if (!related || related.length === 0) return null;

  const handleAddToCart = (product: any) => {
    if (!product.sellPrice) return;
    const res = addItem({
      masterCode: product.pelicanCode,
      name: product.name,
      styleId: 0,
      styleLabel: product.category,
      distributorId: null,
      tier: "homeowner",
      unitPrice: product.sellPrice,
      qty: 1,
      imageUrl: product.imageUrl ?? null,
      category: product.category,
    });
    if (res.ok) {
      toast.success(`Added ${product.name} to cart`, {
        action: { label: "View Cart", onClick: () => navigate("/cart") },
      });
    }
  };

  return (
    <div className="border-t bg-muted/20 py-12">
      <div className="container">
        <h2 className="text-xl font-semibold mb-2">Complete This Look</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Pair with a matching {pairedType.toLowerCase().replace("s", "")} for a coordinated finish.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {related.map((product: any) => (
            <Link key={product.id} href={`/surfaces/product/${product.slug}`}>
              <Card className="group overflow-hidden border-border/70 hover:shadow-md transition-all duration-200 cursor-pointer">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Waves className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </p>
                  {product.sellPrice && (
                    <p className="mt-1 text-sm font-semibold text-primary">{formatPrice(product.sellPrice)}</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full text-xs h-7"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToCart(product); }}
                  >
                    <ShoppingCart className="mr-1 h-3 w-3" /> Add to Cart
                  </Button>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
