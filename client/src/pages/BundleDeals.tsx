import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageOpen, Wand2, LayoutGrid, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function BundleDeals() {
  const [, navigate] = useLocation();
  const bundles = trpc.priceShop.listPublishedBundles.useQuery();
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleLoadBundle = (id: number) => {
    setLoadingId(id);
    navigate(`/design?bundleId=${id}`);
    toast.success("Loading bundle into designer…");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0a1628] to-[#1a2d4a] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium mb-6">
            <PackageOpen className="h-4 w-4 text-[#d4a75a]" />
            Pre-Designed Kitchen Packages
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready-to-Order <span className="text-[#d4a75a]">Bundle Deals</span>
          </h1>
          <p className="text-white/70 text-lg max-w-2xl mx-auto">
            Choose a pre-designed kitchen layout, customize it to fit your space, and order — all in minutes.
          </p>
        </div>
      </div>

      {/* Bundles grid */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        {bundles.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-9 w-full mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : bundles.isError ? (
          <div className="text-center py-20 text-muted-foreground">
            <PackageOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Unable to load bundle deals. Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => bundles.refetch()}>Retry</Button>
          </div>
        ) : !bundles.data || bundles.data.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <PackageOpen className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Bundle Deals Yet</h2>
            <p className="text-sm max-w-sm mx-auto">
              We're working on pre-designed kitchen packages. Check back soon, or design your own kitchen from scratch.
            </p>
            <Button className="mt-6 gap-2 bg-[#d4a75a] hover:bg-[#c49648] text-white" onClick={() => navigate("/design")}>
              <Wand2 className="h-4 w-4" /> Design Your Own Kitchen
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">{bundles.data.length} package{bundles.data.length !== 1 ? "s" : ""} available</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/design")}>
                <Wand2 className="h-3.5 w-3.5" /> Design from Scratch
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {bundles.data.map((bundle) => (
                <div
                  key={bundle.id}
                  className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-[#d4a75a]/50 transition-all duration-200"
                >
                  {/* Hero image or placeholder */}
                  <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                    {bundle.floorPlanImageUrl ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
                        <img
                          src={bundle.floorPlanImageUrl}
                          alt={`${bundle.name} floor plan`}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : bundle.heroImageUrl ? (
                      <img
                        src={bundle.heroImageUrl}
                        alt={bundle.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <LayoutGrid className="h-12 w-12 opacity-20" />
                        <span className="text-xs opacity-40">No preview image</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {bundle.styleName && (
                        <Badge className="bg-black/60 text-white border-0 text-[10px] backdrop-blur-sm">
                          {bundle.styleName}
                        </Badge>
                      )}
                      {bundle.roomWidthInches && bundle.roomDepthInches && (
                        <Badge className="bg-black/60 text-white border-0 text-[10px] backdrop-blur-sm">
                          <MapPin className="h-2.5 w-2.5 mr-0.5" />
                          {Math.round(bundle.roomWidthInches / 12)}' × {Math.round(bundle.roomDepthInches / 12)}'
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <h3 className="font-semibold text-base text-foreground leading-tight mb-1">{bundle.name}</h3>
                    {bundle.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{bundle.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4 flex-wrap">
                      {bundle.cabinetCount > 0 && (
                        <span className="flex items-center gap-1">
                          <LayoutGrid className="h-3 w-3" />
                          {bundle.cabinetCount} cabinets
                        </span>
                      )}
                      {bundle.fixtureCount > 0 && (
                        <span className="flex items-center gap-1">
                          <PackageOpen className="h-3 w-3" />
                          {bundle.fixtureCount} fixture{bundle.fixtureCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <Button
                      className="w-full gap-2 bg-[#d4a75a] hover:bg-[#c49648] text-white"
                      onClick={() => handleLoadBundle(bundle.id)}
                      disabled={loadingId === bundle.id}
                    >
                      <Wand2 className="h-4 w-4" />
                      {loadingId === bundle.id ? "Loading…" : "Customize & Order"}
                      <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
import { MapPin } from "lucide-react";
