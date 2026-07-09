import { useState, useEffect } from "react";
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
  Store, Plus, ExternalLink, Copy, DollarSign, Package, Mail, Phone, MapPin, Eye, Send, FileText, CheckCircle2,
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

  // Auto-expand a specific affiliate when arriving from the storefront admin link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("affiliateId");
    if (id) {
      setExpandedId(Number(id));
      // Scroll to the affiliate card after data loads
      setTimeout(() => {
        const el = document.getElementById(`affiliate-row-${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
    }
  }, []);

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
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {affiliates?.length ?? 0} affiliate{(affiliates?.length ?? 0) === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          {/* Demo storefront — sales tool: opens the classic template as a live example */}
          <a href="/store-preview/classic" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Demo Storefront
            </Button>
          </a>
          <CreateAffiliateDialog onCreated={() => utils.affiliates.adminList.invalidate()} />
        </div>
      </div>

      {(!affiliates || affiliates.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No affiliates yet. Add your first partner store.
        </div>
      ) : (
        affiliates.map((a) => (
          <Card key={a.id} id={`affiliate-row-${a.id}`}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{a.storeName}</span>
                    <Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>
                    <Badge variant="outline" className="font-mono">{a.referralCode}</Badge>
                    <Badge variant="secondary">{(Number(a.commissionRate) * 100).toFixed(1)}%</Badge>
                    {a.w9Status === "verified" && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1">
                        <FileText className="h-3 w-3" /> W-9 Verified
                      </Badge>
                    )}
                    {a.w9Status === "submitted" && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1">
                        <FileText className="h-3 w-3" /> W-9 Pending Review
                      </Badge>
                    )}
                    {a.w9Status === "pending" && (
                      <Badge variant="outline" className="text-amber-700 border-amber-400 gap-1">
                        <FileText className="h-3 w-3" /> W-9 Not Submitted
                      </Badge>
                    )}
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
                  <a href={`${origin}/store/${a.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" /> View Store
                    </Button>
                  </a>
                  <a href={`/store-preview/${a.template ?? "classic"}`} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Preview Template
                    </Button>
                  </a>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  >
                    {expandedId === a.id ? "Hide" : "Details"}
                  </Button>
                </div>
              </div>

              {expandedId === a.id && <AffiliateDetailsPanel affiliate={a} origin={origin} />}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// Full details panel shown when an affiliate row is expanded
type AffiliateItem = {
  id: number;
  storeName: string;
  slug: string;
  referralCode: string;
  email: string;
  contactName: string | null;
  template: string | null;
  commissionRate: string | number;
  status: string;
  phone: string | null;
  location: string | null;
  website: string | null;
  notes: string | null;
  w9Status: string;
  w9LegalName: string | null;
  w9IdDocumentUrl: string | null;
  w9SubmittedAt: Date | null;
  w9VerifiedAt: Date | null;
  w9AdminNotes: string | null;
};

function AffiliateDetailsPanel({ affiliate: a, origin }: { affiliate: AffiliateItem; origin: string }) {
  const utils = trpc.useUtils();
  const storeUrl = `${origin}/store/${a.slug}`;
  const refLink = `${origin}/order/new?ref=${a.referralCode}`;
  const loginUrl = `${origin}/affiliate`;
  const [activeTab, setActiveTab] = useState<"credentials" | "template" | "referrals" | "w9">("credentials");

  const setTemplate = trpc.affiliates.adminUpdate.useMutation({
    onSuccess: () => {
      utils.affiliates.adminList.invalidate();
      toast.success("Template updated");
    },
    onError: (e) => toast.error(e.message),
  });

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Could not copy")
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex border-b border-border">
        {(["credentials", "template", "referrals", "w9"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              activeTab === t
                ? "border-b-2 border-primary text-primary bg-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === "credentials" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Affiliate Credentials</p>
            {[
              { label: "Storefront URL", value: storeUrl },
              { label: "Referral Link", value: refLink },
              { label: "Referral Code", value: a.referralCode },
              { label: "Login Portal", value: loginUrl },
              { label: "Email", value: a.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
                <code className="flex-1 text-xs bg-muted rounded px-2 py-1 truncate">{value}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyText(value, label)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {(label === "Storefront URL" || label === "Login Portal") && (
                  <a href={value} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            ))}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => {
                  const all = `Storefront: ${storeUrl}\nReferral link: ${refLink}\nReferral code: ${a.referralCode}\nLogin: ${loginUrl}\nEmail: ${a.email}`;
                  copyText(all, "All credentials");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy All
              </Button>
              <SendCredentialsButton affiliateId={a.id} />
            </div>
          </div>
        )}

        {activeTab === "template" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Storefront Template</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TEMPLATES.map((t) => {
                const active = (a.template ?? "classic") === t.id;
                return (
                  <div key={t.id} className={`rounded-lg border p-3 space-y-1.5 cursor-pointer transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                    onClick={() => !active && setTemplate.mutate({ id: a.id, template: t.id })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{t.name}</span>
                      {active && <span className="text-xs text-primary font-medium">Active</span>}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{t.desc}</p>
                    <a href={`/store-preview/${t.id}`} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "referrals" && <AffiliateReferrals affiliateId={a.id} />}
        {activeTab === "w9" && <AffiliateW9Review affiliate={a} />}
      </div>
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

// ─── Send Credentials Button ───────────────────────────────────────────────────
// Triggers adminSendCredentials which notifies the owner to forward credentials
// to the affiliate. Shows a confirmation dialog before sending.
function SendCredentialsButton({ affiliateId }: { affiliateId: number }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<{ email: string; welcomeGuideUrl?: string } | null>(null);
  const send = trpc.affiliates.adminSendCredentials.useMutation({
    onSuccess: (data) => {
      toast.success(`Credentials notification sent for ${data.email}`);
      setSent({ email: data.email, welcomeGuideUrl: data.welcomeGuideUrl });
    },
    onError: (err) => {
      toast.error(`Failed to send: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSent(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Send className="h-3.5 w-3.5" /> Send Credentials
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send Credentials</DialogTitle>
        </DialogHeader>
        {sent ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600 font-medium">✓ Notification sent for {sent.email}</p>
            <p className="text-sm text-muted-foreground">Include this Welcome Guide PDF when you email the affiliate their credentials:</p>
            {sent.welcomeGuideUrl && (
              <a
                href={sent.welcomeGuideUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm font-medium hover:bg-muted transition-colors"
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                Affiliate Welcome Guide (PDF)
              </a>
            )}
            <DialogFooter>
              <Button onClick={() => { setOpen(false); setSent(null); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This will notify the owner to send the affiliate's storefront URL, referral link, login portal, and Welcome Guide PDF to their email address.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => send.mutate({ id: affiliateId })}
                disabled={send.isPending}
              >
                {send.isPending ? "Sending…" : "Send Now"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Admin W-9 Review Panel ────────────────────────────────────────────────────
function AffiliateW9Review({ affiliate: a }: { affiliate: AffiliateItem }) {
  const utils = trpc.useUtils();
  const [adminNotes, setAdminNotes] = useState(a.w9AdminNotes ?? "");

  const verifyW9 = trpc.affiliates.adminVerifyW9.useMutation({
    onSuccess: () => {
      toast.success("W-9 status updated.");
      utils.affiliates.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (a.w9Status === "pending") {
    return (
      <div className="py-6 text-center space-y-2">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">This affiliate has not yet submitted their W-9 information.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        {a.w9Status === "verified" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" /> Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm font-medium">
            <FileText className="h-4 w-4" /> Submitted — Awaiting Review
          </span>
        )}
        {a.w9SubmittedAt && (
          <span className="text-xs text-muted-foreground">
            Submitted {new Date(a.w9SubmittedAt).toLocaleDateString()}
          </span>
        )}
        {a.w9VerifiedAt && (
          <span className="text-xs text-muted-foreground">
            Verified {new Date(a.w9VerifiedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="grid gap-2 text-sm">
        <div className="flex gap-2">
          <span className="text-muted-foreground w-32 shrink-0">Legal Name</span>
          <span className="font-medium">{a.w9LegalName ?? "—"}</span>
        </div>
      </div>

      {a.w9IdDocumentUrl && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Government ID</p>
          <a
            href={a.w9IdDocumentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View uploaded ID document
          </a>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`w9-notes-${a.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin Notes</Label>
        <textarea
          id={`w9-notes-${a.id}`}
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Internal notes on this W-9 (not visible to affiliate)"
        />
      </div>

      {a.w9Status !== "verified" && (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={() => verifyW9.mutate({ affiliateId: a.id, action: "verify", adminNotes })}
            disabled={verifyW9.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Verify W-9
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40 hover:bg-destructive/10 gap-1.5"
            onClick={() => verifyW9.mutate({ affiliateId: a.id, action: "reject", adminNotes })}
            disabled={verifyW9.isPending}
          >
            Reject &amp; Request Re-submission
          </Button>
        </div>
      )}
    </div>
  );
}
