import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cabinetFrontEndQuickEditUrl, CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES } from "@shared/cabinetConfigReview";

const ALL_LINES = "__all_lines__";

export default function PendingDistributorConnectionsAdmin() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [lineId, setLineId] = useState<string>(ALL_LINES);
  const utils = trpc.useUtils();
  const distributorId = lineId === ALL_LINES ? undefined : Number(lineId);
  const { data, isLoading, error, refetch } = trpc.cabinets.adminListPendingDistributorConnections.useQuery({
    distributorId,
    search: search || undefined,
  });
  const { data: distributors } = trpc.distributors.list.useQuery();
  const review = trpc.distributorPortal.adminSetProductStatus.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.status === "approved" ? "Distributor connection approved; it remains unpublished until pricing is ready." : "Distributor connection rejected.");
      utils.cabinets.adminListPendingDistributorConnections.invalidate();
      utils.cabinets.adminListPendingReview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const items = data?.items ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Pending Distributor Connections</h2>
        <Badge variant="secondary">{data?.total ?? 0} awaiting review</Badge>
        <Button className="ml-auto h-8 gap-1.5" size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        These supplier links were added while configuring cabinets. Review the actual supplier SKU and style, then approve or reject the connection. Approval does not publish a price or make the cabinet customer-visible.
      </p>
      <div className="flex flex-wrap gap-2">
        <Select value={lineId} onValueChange={setLineId}>
          <SelectTrigger className="h-9 w-52 text-sm"><SelectValue placeholder="All distributor lines" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LINES}>All distributor lines</SelectItem>
            {(distributors ?? []).map((line) => <SelectItem key={line.id} value={String(line.id)}>{line.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="h-9 min-w-56 flex-1 text-sm"
          placeholder="Search cabinet code, name, or supplier SKU…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") setSearch(searchInput); }}
        />
        <Button className="h-9" size="sm" variant="outline" onClick={() => setSearch(searchInput)}>Search</Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load pending distributor connections: {error.message}</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 py-12 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
          No pending distributor connections match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cabinet</th>
                <th className="px-3 py-2 text-left font-medium">Distributor line</th>
                <th className="px-3 py-2 text-left font-medium">Door style</th>
                <th className="px-3 py-2 text-left font-medium">Supplier SKU</th>
                <th className="px-3 py-2 text-left font-medium">Submitted</th>
                <th className="px-3 py-2 text-right font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.skuId} className="border-b border-border last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs font-semibold text-primary">{item.masterCode}</div>
                    <div className="max-w-64 truncate text-xs text-muted-foreground">{item.description}</div>
                  </td>
                  <td className="px-3 py-3 text-xs font-medium">{item.distributorBrandName || item.distributorName}</td>
                  <td className="px-3 py-3 text-xs">{item.styleName}{item.styleCode ? ` (${item.styleCode})` : ""}</td>
                  <td className="px-3 py-3"><div className="font-mono text-xs">{item.distributorSku}</div><div className="text-[10px] text-muted-foreground">{item.platformSku}</div></td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <a href={cabinetFrontEndQuickEditUrl(item.masterCode, item.cabinetId)} {...CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES}>
                        <Button className="h-7 gap-1 px-2 text-xs" size="sm" variant="outline"><ExternalLink className="h-3 w-3" /> Edit</Button>
                      </a>
                      <Button className="h-7 gap-1 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700" size="sm" disabled={review.isPending} onClick={() => review.mutate({ distributorId: item.distributorId, skuId: item.skuId, status: "approved" })}>
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </Button>
                      <Button className="h-7 gap-1 px-2 text-xs" size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ distributorId: item.distributorId, skuId: item.skuId, status: "rejected" })}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
