import { useMemo, useState } from "react";
import { Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

// ─── Style card ───────────────────────────────────────────────────────────────
// Presents purely by door-style attributes. No supplier/line identity is shown.

interface DoorStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  finish: string | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
}

function StyleCard({ style }: { style: DoorStyle }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="cabinet-card group rounded-xl border border-border bg-card overflow-hidden">
      {/* Door sample image */}
      <div className="h-40 bg-muted/40 flex items-center justify-center border-b border-border overflow-hidden relative">
        {style.thumbnailImageUrl && !imgError ? (
          <img
            src={style.thumbnailImageUrl}
            alt={style.ourName || style.styleCode}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <Palette className="h-10 w-10" />
            <span className="text-xs font-mono">{style.styleCode}</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="font-semibold text-sm text-foreground leading-snug">
            {style.ourName || style.styleCode}
          </p>
          {style.doorStyle && (
            <Badge variant="outline" className="text-xs shrink-0">{style.doorStyle}</Badge>
          )}
        </div>

        <div className="mt-1 space-y-0.5">
          {style.woodSpecies && (
            <p className="text-xs text-muted-foreground">Wood: {style.woodSpecies}</p>
          )}
          {style.finish && (
            <p className="text-xs text-muted-foreground">Finish: {style.finish}</p>
          )}
          {style.color && (
            <p className="text-xs text-muted-foreground">Color: {style.color}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Door Styles page ────────────────────────────────────────────────────

export default function DoorStyles() {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery();

  // De-duplicate styles by display name (the same style can be carried by more
  // than one supply line internally; members should only ever see it once).
  const uniqueStyles = useMemo(() => {
    const map = new Map<string, DoorStyle>();
    for (const s of (styles ?? []) as DoorStyle[]) {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.ourName || "").localeCompare(b.ourName || "")
    );
  }, [styles]);

  // Door-style type facets (Shaker, Raised Panel, Slab, ...) derived from data.
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of uniqueStyles) if (s.doorStyle) set.add(s.doorStyle);
    return Array.from(set).sort();
  }, [uniqueStyles]);

  const visible = selectedType
    ? uniqueStyles.filter((s) => s.doorStyle === selectedType)
    : uniqueStyles;

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Door Styles
        </h1>
        <p className="text-muted-foreground">
          {uniqueStyles.length} finishes available. Each style carries its own pricing —
          open any cabinet to compare styles and trade pricing.
        </p>
      </div>

      {/* Door-style type filter */}
      {types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedType === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All Styles
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Palette className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No door styles match this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visible.map((style) => (
            <StyleCard key={style.id} style={style} />
          ))}
        </div>
      )}
    </div>
  );
}
