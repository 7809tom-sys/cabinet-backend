import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Save, History, ShieldCheck, X, BadgeCheck, CircleAlert } from "lucide-react";

// Editable price-ladder fields, in display order.
const FIELDS = [
  { key: "yourCost", label: "Your Cost" },
  { key: "listPrice", label: "List Price" },
  { key: "wholesalePrice", label: "Wholesale" },
  { key: "contractorPrice", label: "Contractor" },
  { key: "homeownerPrice", label: "Homeowner" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

type Sku = {
  skuId: number;
  distributorId: number | null;
  styleId: number | null;
  platformSku: string;
  distributorSku: string;
  supplierCabinetName: string | null;
  isAvailable: boolean;
  isPublished: boolean;
  yourCost: string | null;
  listPrice: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  distributorName: string | null;
  distributorBrandName: string | null;
  styleOurName: string | null;
  styleCode: string | null;
  styleDistributorName: string | null;
};

function dollarsOrBlank(v: string | null): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

// One editable SKU row. Tracks its own dirty draft so each row saves
// independently and only changed fields are sent.
function SkuRow({ sku, onSaved }: { sku: Sku; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<FieldKey, string>>({
    yourCost: dollarsOrBlank(sku.yourCost),
    listPrice: dollarsOrBlank(sku.listPrice),
    wholesalePrice: dollarsOrBlank(sku.wholesalePrice),
    contractorPrice: dollarsOrBlank(sku.contractorPrice),
    homeownerPrice: dollarsOrBlank(sku.homeownerPrice),
  });

  const initial: Record<FieldKey, string> = {
    yourCost: dollarsOrBlank(sku.yourCost),
    listPrice: dollarsOrBlank(sku.listPrice),
    wholesalePrice: dollarsOrBlank(sku.wholesalePrice),
    contractorPrice: dollarsOrBlank(sku.contractorPrice),
    homeownerPrice: dollarsOrBlank(sku.homeownerPrice),
  };

  const dirty = FIELDS.some((f) => draft[f.key] !== initial[f.key]);

  const update = trpc.pricing.adminUpdateSkuCost.useMutation({
    onSuccess: (res) => {
      toast.success(res.changed > 0 ? `Saved ${res.changed} change${res.changed === 1 ? "" : "s"}` : "No changes to save");
      onSaved();
    },
    onError: (e) => toast.error(e.message || "Save failed"),
  });

  const handleSave = () => {
    const payload: Record<string, number | null> = { skuId: sku.skuId };
    for (const f of FIELDS) {
      if (draft[f.key] === initial[f.key]) continue;
      const trimmed = draft[f.key].trim();
      payload[f.key] = trimmed === "" ? null : Number(trimmed);
    }
    update.mutate(payload as Parameters<typeof update.mutate>[0]);
  };

  // White-label-safe supplier label: prefer neutral name, fall back to brand.
  const lineLabel = sku.distributorName || sku.distributorBrandName || `Line ${sku.distributorId ?? "?"}`;
  const styleLabel = sku.styleOurName || sku.styleCode || `Style ${sku.styleId ?? "?"}`;

  return (
    <TableRow className={dirty ? "bg-amber-50" : undefined}>
      <TableCell className="align-top">
        <div className="font-medium">{styleLabel}</div>
        <div className="text-xs text-muted-foreground">{lineLabel}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="outline" className="font-mono text-[10px]">{sku.platformSku}</Badge>
          {!sku.isPublished && <Badge variant="secondary" className="text-[10px]">unpublished</Badge>}
          {!sku.isAvailable && <Badge variant="destructive" className="text-[10px]">unavailable</Badge>}
        </div>
      </TableCell>
      {FIELDS.map((f) => (
        <TableCell key={f.key} className="align-top">
          <Input
            inputMode="decimal"
            value={draft[f.key]}
            placeholder="—"
            className={draft[f.key] !== initial[f.key] ? "border-amber-500" : ""}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </TableCell>
      ))}
      <TableCell className="align-top">
        <Button size="sm" disabled={!dirty || update.isPending} onClick={handleSave}>
          {update.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
          <span className="ml-1">Save</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}

// Audit-trail drawer for a single cabinet number.
function AuditTrail({ masterCode, onClose }: { masterCode: string; onClose: () => void }) {
  const { data, isLoading } = trpc.pricing.adminCostHistory.useQuery(
    { masterCode, limit: 100 },
    { enabled: !!masterCode },
  );
  return (
    <Card className="mt-4 border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> Change history — {masterCode}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="size-4" /></Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : !data || data.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old</TableHead>
                <TableHead>New</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{row.field}</TableCell>
                  <TableCell className="text-xs">{row.oldValue ?? "—"}</TableCell>
                  <TableCell className="text-xs font-medium">{row.newValue ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.changedByName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Per-cabinet "audited against my price list" control + badge.
function VerifyButton({
  cabinetId,
  verified,
  verifiedAt,
  verifiedByName,
  onChanged,
}: {
  cabinetId: number;
  verified: boolean;
  verifiedAt?: string | Date | null;
  verifiedByName?: string | null;
  onChanged: () => void;
}) {
  const setVerified = trpc.pricing.adminSetPriceVerified.useMutation({
    onSuccess: (res) => {
      toast.success(res.verified ? "Marked price verified" : "Cleared verification");
      onChanged();
    },
    onError: (e) => toast.error(e.message || "Update failed"),
  });

  if (verified) {
    const when = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge className="bg-emerald-600 hover:bg-emerald-600">
          <BadgeCheck className="mr-1 size-3.5" /> Price verified
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {verifiedByName ? `by ${verifiedByName}` : ""}{when ? ` · ${when}` : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          disabled={setVerified.isPending}
          onClick={() => setVerified.mutate({ cabinetId, verified: false })}
        >
          {setVerified.isPending ? <Spinner className="size-3" /> : "Clear"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant="outline" className="border-amber-500 text-amber-700">
        <CircleAlert className="mr-1 size-3.5" /> Not audited
      </Badge>
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700"
        disabled={setVerified.isPending}
        onClick={() => setVerified.mutate({ cabinetId, verified: true })}
      >
        {setVerified.isPending ? <Spinner className="size-4" /> : <BadgeCheck className="size-4" />}
        <span className="ml-1">Mark price verified</span>
      </Button>
    </div>
  );
}

export default function CostLookupAdmin() {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState<string>("");
  const [auditFor, setAuditFor] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, isFetching } = trpc.pricing.adminLookupCost.useQuery(
    { query: submitted },
    { enabled: submitted.length > 0 },
  );

  const doSearch = () => {
    const q = term.trim();
    if (!q) {
      toast.error("Enter a queue number or model code to search");
      return;
    }
    setSubmitted(q);
    setAuditFor(null);
  };

  const refetchAll = () => {
    utils.pricing.adminLookupCost.invalidate();
    if (auditFor) utils.pricing.adminCostHistory.invalidate();
  };

  type CabinetResult = {
    id: number;
    masterCode: string;
    description: string;
    category: string;
    subCategory: string | null;
    conflictStatus?: string;
    priceVerified?: boolean;
    priceVerifiedAt?: string | Date | null;
    priceVerifiedByName?: string | null;
    skus: Sku[];
  };
  const results = (data?.cabinets ?? []) as CabinetResult[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600" />
            Cost Lookup &amp; Price Audit
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Owner-only. Look up an item by its <strong>queue number</strong> (e.g.
            <code className="mx-1 rounded bg-muted px-1">#123</code>) or by its
            <strong> model / cabinet code</strong> to see every stored SKU across
            lines and door styles. Compare each price against your master price
            list, correct any field inline, then hit <strong>Mark price
            verified</strong>. Every change is logged.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Queue number (#123) or model code, e.g. B24, DB-24-3"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              />
            </div>
            <Button onClick={doSearch} disabled={isFetching}>
              {isFetching ? <Spinner className="size-4" /> : <Search className="size-4" />}
              <span className="ml-1">Search</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && submitted && (
        <div className="flex justify-center py-10"><Spinner /></div>
      )}

      {submitted && !isLoading && results.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No cabinet found matching “{submitted}”.
          </CardContent>
        </Card>
      )}

      {results.map((cab) => (
        <Card key={cab.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="font-mono">{cab.masterCode}</CardTitle>
              <p className="text-sm text-muted-foreground">{cab.description}</p>
              <p className="text-xs text-muted-foreground">
                {cab.category}{cab.subCategory ? ` · ${cab.subCategory}` : ""} · {cab.skus.length} SKU{cab.skus.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <VerifyButton
                cabinetId={cab.id}
                verified={!!cab.priceVerified}
                verifiedAt={cab.priceVerifiedAt}
                verifiedByName={cab.priceVerifiedByName}
                onChanged={refetchAll}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAuditFor(auditFor === cab.masterCode ? null : cab.masterCode)}
              >
                <History className="size-4" />
                <span className="ml-1">History</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {cab.skus.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No SKUs mapped for this cabinet yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Door style / line</TableHead>
                      {FIELDS.map((f) => (
                        <TableHead key={f.key} className="min-w-[110px]">{f.label}</TableHead>
                      ))}
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cab.skus.map((sku) => (
                      <SkuRow key={sku.skuId} sku={sku} onSaved={refetchAll} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {auditFor === cab.masterCode && (
              <AuditTrail masterCode={cab.masterCode} onClose={() => setAuditFor(null)} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
