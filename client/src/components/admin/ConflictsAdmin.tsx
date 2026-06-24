import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

function fmtDim(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n % 1 === 0 ? n.toFixed(0) : n}"`;
}

export default function ConflictsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.cabinets.conflicts.useQuery();
  const clear = trpc.cabinets.clearConflict.useMutation({
    onSuccess: () => {
      utils.cabinets.conflicts.invalidate();
      toast.success("Conflict cleared — product is live again.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-destructive">Couldn't load conflicts: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Conflicts / Needs Review</p>
          <p className="text-amber-800">
            Products held here are hidden from the public catalog, storefront and the Design Tool
            until reviewed. Prices are preserved. Clear a conflict to put a product back live.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No products in conflict. Everything is live.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-mono">
                    {c.masterCode}
                  </CardTitle>
                  <Badge variant="destructive">Conflict</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-foreground">{c.description}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Category:</span>{" "}
                    {c.category}
                    {c.subCategory ? ` / ${c.subCategory}` : ""}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Size:</span>{" "}
                    {fmtDim(c.width)}W × {fmtDim(c.height)}H × {fmtDim(c.depth)}D
                  </span>
                  <span>
                    <span className="font-medium text-foreground">SKUs:</span> {c.skuCount}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Distributor:</span>{" "}
                    {c.distributorNames.length ? c.distributorNames.join(", ") : "—"}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Door style:</span>{" "}
                    {c.doorStyleNames.length ? c.doorStyleNames.join(", ") : "—"}
                  </span>
                </div>
                {c.conflictReason && (
                  <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {c.conflictReason}
                  </p>
                )}
                <div className="flex justify-end pt-1">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Clear conflict
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear conflict for {c.masterCode}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This returns the product to live status — it will appear in the public
                          catalog, storefront and Design Tool again. Only do this after you've
                          verified the product against the catalog book.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => clear.mutate({ id: c.id })}
                          disabled={clear.isPending}
                        >
                          Clear conflict
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
