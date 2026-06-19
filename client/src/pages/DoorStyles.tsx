import { useState } from "react";
import { Palette, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

// ─── Style card ───────────────────────────────────────────────────────────────

interface DoorStyle {
  id: number;
  distributorId: number;
  styleCode: string;
  ourName: string | null;
  distributorName: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
}

function StyleCard({ style, distName }: { style: DoorStyle; distName: string }) {
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
          <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
            {style.styleCode}
          </span>
          <Badge variant="outline" className="text-xs shrink-0">{distName}</Badge>
        </div>

        <p className="font-semibold text-sm text-foreground leading-snug">
          {style.ourName || style.distributorName || style.styleCode}
        </p>
        {style.distributorName && style.ourName && style.distributorName !== style.ourName && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Dist: {style.distributorName}
          </p>
        )}

        <div className="mt-2 space-y-0.5">
          {style.doorStyle && (
            <p className="text-xs text-muted-foreground">Style: {style.doorStyle}</p>
          )}
          {style.woodSpecies && (
            <p className="text-xs text-muted-foreground">Wood: {style.woodSpecies}</p>
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
  const [selectedDist, setSelectedDist] = useState<number | null>(null);

  const { data: distributors } = trpc.distributors.list.useQuery();
  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery(
    selectedDist ? { distributorId: selectedDist } : undefined
  );

  // Group styles by distributor
  const grouped = styles?.reduce<Record<number, DoorStyle[]>>((acc, s) => {
    if (!acc[s.distributorId]) acc[s.distributorId] = [];
    acc[s.distributorId].push(s as DoorStyle);
    return acc;
  }, {}) ?? {};

  const distMap = distributors?.reduce<Record<number, string>>((acc, d) => {
    acc[d.id] = d.name;
    return acc;
  }, {}) ?? {};

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Door Styles
        </h1>
        <p className="text-muted-foreground">
          {styles?.length ?? 0} styles available across {distributors?.length ?? 0} distributors.
          Each style has its own pricing — select a cabinet to compare.
        </p>
      </div>

      {/* Distributor filter tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setSelectedDist(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedDist === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All Distributors
        </button>
        {distributors?.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedDist(d.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedDist === d.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

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
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([distId, distStyles]) => {
            const dName = distMap[Number(distId)] || `Distributor ${distId}`;
            return (
              <section key={distId}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-serif text-xl font-bold text-foreground">{dName}</h2>
                  <Badge variant="secondary">{distStyles.length} styles</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {distStyles.map((style) => (
                    <StyleCard key={style.id} style={style} distName={dName} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
