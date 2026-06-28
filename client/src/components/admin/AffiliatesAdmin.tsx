import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Store, Plus, ExternalLink, Copy, DollarSign, Package, Mail, Phone, MapPin,
} from "lucide-react";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "inactive") return "destructive";
  return "secondary"; // paused
}

export default function AffiliatesAdmin() {
  const utils = trpc.useUtils();
  const { data: affiliates, isLoading, error, refetch } = trpc.affiliates.adminList.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const setStatus = trpc.affiliates.adminUpdate.useMutation({
    onSuccess: () => {
      utils.affiliates.adminList.invalidate();
      toast.success("Affiliate updated");
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
        <p className="text-destructive">Couldn't load affiliates: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {affiliates?.length ?? 0} affiliate{(affiliates?.length ?? 0) === 1 ? "" : "s"}
        </p>
        <CreateAffiliateDialog onCreated={() => utils.affiliates.adminList.invalidate()} />
      </div>

      {(!affiliates || affiliates.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No affiliates yet. Add your first partner store.
        </div>
      ) : (
        affiliates.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{a.storeName}</span>
                    <Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>
                    <Badge variant="outline" className="font-mono">{a.referralCode}</Badge>
                    <Badge variant="secondary">{(Number(a.commissionRate) * 100).toFixed(1)}%</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {a.contactName && <span>{a.contactName}</span>}
                    {a.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {a.email}</span>}
                    {a.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {a.phone}</span>}
                    {a.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {a.location}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <a href={`${origin}/store/${a.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> /store/{a.slug}
                    </a>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/store/${a.slug}`);
                        toast.success("Storefront link copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex md:flex-col gap-2 shrink-0">
                  <Select
                    value={a.status}
                    onValueChange={(v) => setStatus.mutate({ id: a.id, status: v as "active" | "paused" | "inactive" })}
                  >
                    <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  >
                    {expandedId === a.id ? "Hide" : "Referrals"}
                  </Button>
                </div>
              </div>

              {expandedId === a.id && <AffiliateReferrals affiliateId={a.id} />}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function AffiliateReferrals({ affiliateId }: { affiliateId: number }) {
  const { data, isLoading } = trpc.affiliates.adminReferrals.useQuery({ affiliateId }, { retry: false });
  if (isLoading) return <div className="py-4 flex justify-center"><Spinner className="h-5 w-5" /></div>;
  if (!data) return <p className="text-sm text-muted-foreground py-3">No data.</p>;

  const { orders, summary } = data;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4" /> {summary.referredCount} referred</span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600">{summary.confirmedCount} confirmed</span>
        <span className="inline-flex items-center gap-1.5 font-medium"><DollarSign className="h-4 w-4" /> ${summary.commission.toFixed(2)} commission</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No referred orders yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-1.5">
              <span className="font-mono">{o.requestNumber ?? `#${o.id}`}</span>
              <span className="text-muted-foreground">{o.originatorEmail}</span>
              <Badge variant="outline" className="capitalize">{o.status}</Badge>
              <span className="tabular-nums">{o.totalAmount != null ? `$${Number(o.totalAmount).toFixed(2)}` : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TEMPLATES = [
  {
    id: "classic" as const,
    name: "Classic",
    desc: "Navy split hero with lifestyle photo and serif headline.",
    badge: "Most popular",
  },
  {
    id: "showcase" as const,
    name: "Showcase",
    desc: "Full-bleed kitchen photo with overlaid headline and CTAs.",
    badge: "Bold",
  },
  {
    id: "minimal" as const,
    name: "Minimal",
    desc: "Light, airy layout with thin rules and lots of whitespace.",
    badge: "Clean",
  },
  {
    id: "craftsman" as const,
    name: "Craftsman",
    desc: "Warm, bold type on an accent block — no photo required.",
    badge: "Warm",
  },
];

function CreateAffiliateDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"template" | "details">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<"classic" | "showcase" | "minimal" | "craftsman">("classic");
  const [form, setForm] = useState({
    storeName: "", contactName: "", email: "", phone: "", website: "",
    location: "", slug: "", referralCode: "", commissionPct: "5",
  });

  const create = trpc.affiliates.adminCreate.useMutation({
    onSuccess: () => {
      toast.success("Affiliate created");
      setOpen(false);
      setStep("template");
      setSelectedTemplate("classic");
      setForm({ storeName: "", contactName: "", email: "", phone: "", website: "", location: "", slug: "", referralCode: "", commissionPct: "5" });
      onCreated();
    },
    onError: (e) => toast.error("Could not create", { description: e.message }),
  });

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    if (!form.storeName.trim()) { toast.error("Store name is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Valid email required"); return; }
    const pct = Number(form.commissionPct);
    create.mutate({
      storeName: form.storeName.trim(),
      contactName: form.contactName || undefined,
      email: form.email.trim(),
      phone: form.phone || undefined,
      website: form.website || undefined,
      location: form.location || undefined,
      slug: form.slug || undefined,
      referralCode: form.referralCode || undefined,
      commissionRate: isNaN(pct) ? 0.05 : pct / 100,
      status: "active",
      template: selectedTemplate,
    });
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) { setStep("template"); setSelectedTemplate("classic"); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Affiliate</Button>
      </DialogTrigger>

      {/* ── Step 1: Template picker ── */}
      {step === "template" && (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a Storefront Template</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Pick the layout that best fits this affiliate’s brand. They can change it later from their dashboard.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {TEMPLATES.map((tpl) => {
              const active = selectedTemplate === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id)}
                  className={
                    "relative cursor-pointer rounded-xl border-2 p-4 transition-all " +
                    (active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/50")
                  }
                >
                  {active && (
                    <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="font-semibold text-sm">{tpl.name}</div>
                    <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">{tpl.badge}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tpl.desc}</p>
                  <a
                    href={`/store-preview/${tpl.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Live preview
                  </a>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => setStep("details")}>
              Continue with {TEMPLATES.find((t) => t.id === selectedTemplate)?.name} →
            </Button>
          </DialogFooter>
        </DialogContent>
      )}

      {/* ── Step 2: Details form ── */}
      {step === "details" && (
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Affiliate</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Template: <span className="font-medium text-foreground">{TEMPLATES.find((t) => t.id === selectedTemplate)?.name}</span>
              {" — "}
              <button onClick={() => setStep("template")} className="text-primary hover:underline text-sm">Change</button>
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Store name *</Label>
              <Input value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} placeholder="First Class Flooring & Cabinet Design" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact name</Label>
                <Input value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="store@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Osprey, FL" />
              </div>
              <div className="space-y-1.5">
                <Label>Commission %</Label>
                <Input type="number" value={form.commissionPct} onChange={(e) => setField("commissionPct", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Storefront slug</Label>
                <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="auto from name" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Referral code</Label>
                <Input value={form.referralCode} onChange={(e) => setField("referralCode", e.target.value)} placeholder="auto from name" className="font-mono text-sm" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The affiliate signs in with this email to access their dashboard. Slug and referral code are
              generated from the store name if left blank.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("template")}>← Back</Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create affiliate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
