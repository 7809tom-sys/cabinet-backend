/**
 * PotentialMergesAdmin
 * Surfaces cabinets whose codes are similar or overlap (e.g. B12 vs B-12,
 * OC30 vs OC-30, or one cabinet's masterCode appears in another's alias fields).
 * Admin can:
 *   - Accept → sets the duplicate as an alias of the canonical and hides it
 *   - Swap   → reverses which one is canonical before accepting
 *   - Dismiss → marks the pair as intentionally separate (won't appear again)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, ArrowLeftRight, Check, X, GitMerge } from "lucide-react";

type Candidate = {
  key: string;
  cabinetA: { id: number; masterCode: string; description: string | null; category: string | null };
  cabinetB: { id: number; masterCode: string; description: string | null; category: string | null };
  reason: string;
};

export default function PotentialMergesAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.genericCabinets.potentialMerges.useQuery();

  // Track which pairs have been swapped (canonicalId = B instead of A)
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  // Track which pairs are being processed
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const acceptMerge = trpc.genericCabinets.acceptMerge.useMutation({
    onSuccess: () => {
      utils.genericCabinets.potentialMerges.invalidate();
      toast.success("Merged — duplicate is now hidden and aliased to the canonical cabinet.");
    },
    onError: (e) => toast.error(e.message),
  });

  const dismissMerge = trpc.genericCabinets.dismissMerge.useMutation({
    onSuccess: () => {
      utils.genericCabinets.potentialMerges.invalidate();
      toast.success("Dismissed — this pair won't appear again.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAccept = async (c: Candidate) => {
    const isSwapped = swapped[c.key];
    const canonicalId = isSwapped ? c.cabinetB.id : c.cabinetA.id;
    const duplicateId = isSwapped ? c.cabinetA.id : c.cabinetB.id;
    setPending((p) => ({ ...p, [c.key]: true }));
    try {
      await acceptMerge.mutateAsync({ canonicalId, duplicateId });
    } finally {
      setPending((p) => ({ ...p, [c.key]: false }));
    }
  };

  const handleDismiss = async (c: Candidate) => {
    setPending((p) => ({ ...p, [c.key]: true }));
    try {
      await dismissMerge.mutateAsync({ key: c.key });
    } finally {
      setPending((p) => ({ ...p, [c.key]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-destructive">Failed to load suggestions: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <GitMerge className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground font-medium">No potential duplicates found.</p>
        <p className="text-sm text-muted-foreground">
          All cabinet codes are unique or already aliased correctly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-amber-500" />
            Potential Duplicate Cabinets
            <Badge variant="secondary">{data.length}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            These cabinet codes appear to be the same product under different codes. Review each
            pair and either merge them (one becomes an alias of the other) or dismiss if they are
            intentionally separate.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {data.map((c) => {
          const isSwap = swapped[c.key];
          const canonical = isSwap ? c.cabinetB : c.cabinetA;
          const duplicate = isSwap ? c.cabinetA : c.cabinetB;
          const isPending = pending[c.key];

          return (
            <Card key={c.key} className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/40">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Cabinet pair display */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {/* Canonical (keep visible) */}
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 font-mono text-xs">
                          {canonical.masterCode}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {canonical.description}
                        </span>
                        {canonical.category && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {canonical.category}
                          </Badge>
                        )}
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                      {/* Duplicate (will be hidden) */}
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="font-mono text-xs line-through opacity-60">
                          {duplicate.masterCode}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {duplicate.description}
                        </span>
                        {duplicate.category && (
                          <Badge variant="outline" className="text-xs shrink-0 opacity-60">
                            {duplicate.category}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                      Reason: {c.reason}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {canonical.masterCode}
                      </span>{" "}
                      will be the canonical listing.{" "}
                      <span className="font-medium text-muted-foreground/70">
                        {duplicate.masterCode}
                      </span>{" "}
                      will be hidden and aliased to it.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs gap-1"
                      title="Swap which cabinet is the canonical one"
                      disabled={isPending}
                      onClick={() => setSwapped((s) => ({ ...s, [c.key]: !s[c.key] }))}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Swap
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={isPending}
                      onClick={() => handleAccept(c)}
                    >
                      {isPending ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs gap-1 text-muted-foreground"
                      disabled={isPending}
                      onClick={() => handleDismiss(c)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
