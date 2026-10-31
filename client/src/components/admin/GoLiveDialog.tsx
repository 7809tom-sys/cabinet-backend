import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * One-click "Go live" for any supplier that is offline (admin preview). Shows the supplier's saved terms,
 * requires the "I accept" checkbox, then publishes the supplier in one step. Works for every distributor.
 */
export function GoLiveDialog({
  distributorId,
  label,
  open,
  onOpenChange,
}: {
  distributorId: number;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [accepted, setAccepted] = useState(false);
  const summary = trpc.distributorAdmin.goLiveSummary.useQuery({ distributorId }, { enabled: open });
  const goLive = trpc.distributorAdmin.goLive.useMutation({
    onSuccess: (res) => {
      toast.success(`${label} is live: ${res.publishedSkus} SKU(s) published, ${res.activatedStyles} door style(s) activated${res.skippedStyles.length ? `, ${res.skippedStyles.length} left offline` : ""}.`);
      utils.distributorAdmin.adminList.invalidate();
      utils.distributors.list.invalidate();
      utils.doorStyles.list.invalidate();
      setAccepted(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || "Could not take this supplier live"),
  });
  const terms = summary.data;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setAccepted(false); onOpenChange(next); }}>
      <DialogContent data-testid="go-live-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Go live: {label}</DialogTitle>
          <DialogDescription>Review the supplier terms. Customers will see this supplier as soon as you confirm.</DialogDescription>
        </DialogHeader>
        {summary.isLoading || !terms ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-4 w-4" /> Loading terms…</div>
        ) : (
          <div className="space-y-3">
            <ul data-testid="go-live-terms" className="list-disc space-y-1 pl-5 text-sm">
              {terms.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {terms.warnings.length > 0 && (
              <ul data-testid="go-live-warnings" className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {terms.warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}
              </ul>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                data-testid="go-live-accept"
                checked={accepted}
                onCheckedChange={(value) => setAccepted(value === true)}
                className="mt-0.5"
              />
              <span>{terms.acceptance}</span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="go-live-confirm"
            disabled={!terms || !accepted || goLive.isPending}
            onClick={() => terms && goLive.mutate({ distributorId, acceptedTerms: true, termsVersion: terms.version })}
          >
            {goLive.isPending ? "Going live…" : "Go live"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
