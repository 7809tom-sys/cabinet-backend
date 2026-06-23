import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { CrmBoard } from "@/components/crm/CrmBoard";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Hammer,
  Layers,
  Search,
} from "lucide-react";
import AffiliatesAdmin from "@/components/admin/AffiliatesAdmin";
import DistributorImport from "@/components/admin/DistributorImport";
import CustomersAdmin from "@/components/admin/CustomersAdmin";
import SkuImageManager from "@/components/admin/SkuImageManager";
import FeaturedStylesAdmin from "@/components/admin/FeaturedStylesAdmin";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved" || status === "won") return "default";
  if (status === "rejected" || status === "lost") return "destructive";
  if (status === "quoted") return "secondary";
  return "outline";
}

function ProApplications() {
  const utils = trpc.useUtils();
  const { data: apps, isLoading, error, refetch } = trpc.pros.adminList.useQuery();
  const setStatus = trpc.pros.adminSetStatus.useMutation({
    onSuccess: () => {
      utils.pros.adminList.invalidate();
      toast.success("Application updated");
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
        <p className="text-destructive">Couldn't load applications: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!apps || apps.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No pro applications yet. Share the{" "}
        <a href="/pro-network" className="text-primary underline">
          Join Our Pro Network
        </a>{" "}
        page to start receiving applications.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {apps.map((a) => (
        <Card key={a.id}>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{a.companyName}</span>
                  <Badge variant={statusVariant(a.status)} className="capitalize">
                    {a.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>{a.contactName}</span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {a.email}
                  </span>
                  {a.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {a.phone}
                    </span>
                  )}
                  {a.baseZip && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {a.baseZip} ·{" "}
                      {a.serviceRadiusMiles}mi
                    </span>
                  )}
                  {a.insured && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <ShieldCheck className="h-3.5 w-3.5" /> Insured
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(a.trades ?? []).map((t) => (
                    <Badge key={t} variant="outline" className="gap-1">
                      {t === "installation" ? (
                        <Hammer className="h-3 w-3" />
                      ) : (
                        <Layers className="h-3 w-3" />
                      )}
                      {t === "installation" ? "Installation" : "Fabrication"}
                    </Badge>
                  ))}
                  {(a.materials ?? []).map((m) => (
                    <Badge key={m} variant="secondary">
                      {m}
                    </Badge>
                  ))}
                </div>
                {a.serviceZips && a.serviceZips.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    ZIPs: {a.serviceZips.join(", ")}
                  </div>
                )}
                {a.notes && <p className="text-sm text-muted-foreground pt-1">{a.notes}</p>}
              </div>

              <div className="flex md:flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  disabled={a.status === "approved" || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: a.id, status: "approved" })}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={a.status === "rejected" || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: a.id, status: "rejected" })}
                >
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CountertopQuotes() {
  const utils = trpc.useUtils();
  const { data: quotes, isLoading, error, refetch } = trpc.design.listCountertopQuotes.useQuery();
  const [matchZip, setMatchZip] = useState("");
  const [activeQuoteId, setActiveQuoteId] = useState<number | null>(null);

  const update = trpc.design.updateCountertopQuote.useMutation({
    onSuccess: () => {
      utils.design.listCountertopQuotes.invalidate();
      toast.success("Quote updated");
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
        <p className="text-destructive">Couldn't load quotes: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!quotes || quotes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No countertop quote requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quotes.map((q) => (
        <Card key={q.id}>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{q.contactEmail}</span>
                <Badge variant={statusVariant(q.status)} className="capitalize">
                  {q.status}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {Number(q.squareFeet).toFixed(1)} sq ft · {Number(q.linearFeet).toFixed(1)} lin ft
                {q.hasIsland ? " · island" : ""}
                {q.material ? ` · ${q.material}` : ""}
                {q.zip ? ` · ZIP ${q.zip}` : ""}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                placeholder="Quoted price"
                className="w-40"
                defaultValue={q.quotedPrice ? Number(q.quotedPrice) : undefined}
                id={`qp-${q.id}`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const el = document.getElementById(`qp-${q.id}`) as HTMLInputElement | null;
                  const price = el?.value ? Number(el.value) : undefined;
                  update.mutate({ id: q.id, status: "quoted", quotedPrice: price });
                }}
              >
                Save Quote
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: q.id, status: "won" })}>
                Mark Won
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: q.id, status: "lost" })}>
                Mark Lost
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={() => {
                  setActiveQuoteId(activeQuoteId === q.id ? null : q.id);
                  setMatchZip(q.zip ?? "");
                }}
              >
                <Search className="h-3.5 w-3.5 mr-1" /> Find Pros
              </Button>
            </div>

            {q.quotedPrice && (
              <div className="text-sm rounded-md bg-muted px-3 py-2">
                Quoted: <strong>${Number(q.quotedPrice).toLocaleString()}</strong> · Est. platform
                fee (15%):{" "}
                <strong>
                  ${(Number(q.quotedPrice) * 0.15).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </strong>
              </div>
            )}

            {activeQuoteId === q.id && (
              <ProMatcher zip={matchZip} onZipChange={setMatchZip} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProMatcher({ zip, onZipChange }: { zip: string; onZipChange: (z: string) => void }) {
  const [search, setSearch] = useState(zip);
  const { data: matches, isFetching } = trpc.pros.matchByArea.useQuery(
    { zip: search, trade: "countertop_fabrication" },
    { enabled: search.length >= 3 }
  );

  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onZipChange(e.target.value);
          }}
          placeholder="ZIP to match fabricators"
          className="w-48"
        />
        {isFetching && <Spinner className="h-4 w-4 text-primary" />}
      </div>
      {search.length >= 3 && matches && matches.length === 0 && (
        <p className="text-sm text-muted-foreground">No approved fabricators cover this ZIP yet.</p>
      )}
      {matches && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((p) => (
            <li key={p.id} className="text-sm flex items-center justify-between gap-2">
              <span>
                <strong>{p.companyName}</strong> — {p.contactName} · {p.email}
                {p.phone ? ` · ${p.phone}` : ""}
              </span>
              <Badge variant="outline">{p.baseZip ?? "—"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-md py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-3">Admin Sign In Required</h1>
        <p className="text-muted-foreground mb-6">Please sign in with an admin account.</p>
        <a href={getLoginUrl()}>
          <Button className="bg-[var(--color-navy)] text-white">Sign In</Button>
        </a>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="container max-w-md py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-3">Access Restricted</h1>
        <p className="text-muted-foreground">
          This area is for platform administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <h1 className="font-serif text-3xl font-bold mb-1">Admin</h1>
      <p className="text-muted-foreground mb-8">
        Manage affiliates, review Pro Network applications, and handle countertop quote requests.
      </p>

      <Tabs defaultValue="crm">
        <TabsList>
          <TabsTrigger value="crm">Sales CRM</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="affiliates">Affiliates</TabsTrigger>
          <TabsTrigger value="pros">Pro Applications</TabsTrigger>
          <TabsTrigger value="quotes">Countertop Quotes</TabsTrigger>
          <TabsTrigger value="featured">Featured Styles</TabsTrigger>
          <TabsTrigger value="distributors">Distributors</TabsTrigger>
          <TabsTrigger value="images">Product Images</TabsTrigger>
        </TabsList>
        <TabsContent value="crm" className="mt-6">
          <CrmBoard lang="en" />
        </TabsContent>
        <TabsContent value="customers" className="mt-6">
          <CustomersAdmin />
        </TabsContent>
        <TabsContent value="affiliates" className="mt-6">
          <AffiliatesAdmin />
        </TabsContent>
        <TabsContent value="pros" className="mt-6">
          <ProApplications />
        </TabsContent>
        <TabsContent value="quotes" className="mt-6">
          <CountertopQuotes />
        </TabsContent>
        <TabsContent value="featured" className="mt-6">
          <FeaturedStylesAdmin />
        </TabsContent>
        <TabsContent value="images" className="mt-6">
          <SkuImageManager />
        </TabsContent>
        <TabsContent value="distributors" className="mt-6">
          <DistributorImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
