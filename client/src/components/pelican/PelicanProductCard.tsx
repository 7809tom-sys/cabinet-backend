import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CATEGORY_GRADIENT, formatPrice } from "@/lib/pelican";
import { Star } from "lucide-react";

export type PelicanCardProduct = {
  id: number;
  slug: string;
  name: string;
  category: string;
  subCategory?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  sellPrice: number | null;
  isPopular?: boolean;
};

export function PelicanProductCard({ product }: { product: PelicanCardProduct }) {
  const gradient = CATEGORY_GRADIENT[product.category] ?? "linear-gradient(135deg,#e5e7eb,#cbd5e1)";
  return (
    <Link href={`/surfaces/product/${product.slug}`}>
      <Card className="group h-full overflow-hidden border-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: gradient }}
            >
              <span className="px-3 text-center text-xs font-medium uppercase tracking-wide text-black/45">
                {product.category}
              </span>
            </div>
          )}
          {product.isPopular && (
            <Badge className="absolute left-2 top-2 gap-1 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]">
              <Star className="h-3 w-3 fill-current" /> Featured
            </Badge>
          )}
        </div>
        <div className="space-y-1 p-3">
          {product.subCategory && (
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {product.subCategory}
            </div>
          )}
          <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
            {product.name}
          </div>
          {product.size && (
            <div className="text-xs text-muted-foreground">{product.size}</div>
          )}
          <div className="pt-1 text-base font-bold text-[var(--color-navy)] dark:text-foreground">
            {formatPrice(product.sellPrice)}
          </div>
        </div>
      </Card>
    </Link>
  );
}
