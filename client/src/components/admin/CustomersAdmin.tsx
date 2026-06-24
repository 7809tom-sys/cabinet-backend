import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, Search, Building2, Mail, Clock } from "lucide-react";

type Tier = "homeowner" | "contractor" | "wholesale";

const TIER_LABEL: Record<Tier, string> = {
  homeowner: "Homeowner",
  contractor: "Contractor",
  wholesale: "Wholesale",
};

function tierVariant(t: string): "default" | "secondary" | "outline" {
  if (t === "wholesale") return "default";
  if (t === "contractor") return "secondary";
  return "outline";
}

const PAGE_SIZE = 25;

export default function CustomersAdmin() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [page, setPage] = useState(1);

  const query = trpc.customers.list.useQuery(
    {
      search: search.trim() || undefined,
      tier: tierFilter === "all" ? undefined : tierFilter,
      page,
      pageSize: PAGE_SIZE,
    },
    { retry: false },
  );

  const setTier = trpc.customers.setTier.useMutation({
    onSuccess: (res) => {
      utils.customers.list.invalidate();
      toast.success(`Tier set to ${TIER_LABEL[res.tier as Tier]}`);
    },
    onError: (e) => toast.error("Could not update tier", { description: e.message }),
  });

  const setRole = trpc.customers.setRole.useMutation({
    onSuccess: (res) => {
      utils.customers.list.invalidate();
      toast.success(
        res.role === "designer"
          ? "Granted CRM-only Designer access"
          : "Removed Designer access",
      );
    },
    onError: (e) => toast.error("Could not update role", { description: e.message }),
  });

  const counts = query.data?.counts ?? {};
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Tier summary chips */}
      <div className="flex flex-wrap gap-2">
        {(["homeowner", "contractor", "wholesale"] as Tier[]).map((t) => (
          <Badge key={t} variant={tierVariant(t)} className="px-3 py-1">
            {TIER_LABEL[t]}: {counts[t] ?? 0}
          </Badge>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email, or company…"
            className="pl-9"
          />
        </div>
        <Select
          value={tierFilter}
          onValueChange={(v) => { setTierFilter(v as "all" | Tier); setPage(1); }}
        >
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="homeowner">Homeowner</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-primary" /></div>
      ) : query.error ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-destructive">Couldn't load customers: {query.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No customers match your filters.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total} customer{total === 1 ? "" : "s"}</p>
          <div className="space-y-2">
            {query.data!.rows.map((u) => (
              <Card key={u.id}>
                <CardContent className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{u.name || "Unnamed user"}</span>
                      {u.role !== "user" && (
                        <Badge variant="outline" className="capitalize">{u.role}</Badge>
                      )}
                      <Badge variant={tierVariant(u.pricingTier)} className="capitalize">
                        {TIER_LABEL[u.pricingTier as Tier] ?? u.pricingTier}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      {u.email && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{u.email}</span>
                        </span>
                      )}
                      {u.companyName && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" /> {u.companyName}
                        </span>
                      )}
                      {u.lastSignedIn && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Last seen {new Date(u.lastSignedIn).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {(u.role === "user" || u.role === "designer") && (
                      <Button
                        variant={u.role === "designer" ? "default" : "outline"}
                        size="sm"
                        className="h-9"
                        disabled={setRole.isPending}
                        onClick={() =>
                          setRole.mutate({
                            userId: u.id,
                            role: u.role === "designer" ? "user" : "designer",
                          })
                        }
                        title="Designers can log into the admin backend but only see the Sales CRM"
                      >
                        {u.role === "designer" ? "Designer ✓" : "Make Designer"}
                      </Button>
                    )}
                    <Select
                      value={u.pricingTier}
                      onValueChange={(v) => setTier.mutate({ userId: u.id, tier: v as Tier })}
                      disabled={setTier.isPending}
                    >
                      <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homeowner">Homeowner</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Tip: when the live-chat ping tells you a customer is on the site, find them here and set their
        tier. Their assigned tier controls the prices they see and check out at. Homeowner is the default
        until you change it.
      </p>
    </div>
  );
}
