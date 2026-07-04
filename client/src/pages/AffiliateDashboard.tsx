import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Copy, ExternalLink, DollarSign, Package, CheckCircle2, Store,
  LinkIcon, Save, Loader2, PencilRuler, Globe, Users,
  ArrowRight, Sparkles, Star, TrendingUp, Shield, Palette, Truck,
} from "lucide-react";
import { CrmBoard } from "@/components/crm/CrmBoard";
import {
  AFFILIATE_MEMBERSHIP,
  formatMembershipPrice,
} from "@shared/affiliate";

const MEMBERSHIP_BENEFIT_ICONS = [PencilRuler, Globe, Users];

// ─── Affiliate Landing Page (shown to non-members) ──────────────────────────
function AffiliateLanding() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-[var(--color-navy)] text-white">
        <div className="container py-16 md:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-[var(--color-gold)]" />
              Cabinet Dealz Affiliate Program
            </span>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold mt-6 leading-tight">
              Launch Your Own{" "}
              <span className="text-[var(--color-gold)]">Cabinet Business</span>{" "}
              — Without the Overhead
            </h1>
            <p className="text-white/80 text-lg md:text-xl mt-6 leading-relaxed">
              One annual membership gives you a fully branded storefront, the 2D kitchen design tool,
              access to thousands of cabinets and surfaces at trade pricing, and we handle all the fulfillment.
              A single completed kitchen order typically returns more than the membership costs.
            </p>
            <div className="mt-10 flex flex-wrap items-end gap-6">
              <div>
                <span className="font-serif text-5xl md:text-6xl font-bold text-[var(--color-gold)]">
                  {formatMembershipPrice()}
                </span>
                <span className="text-white/70 text-lg ml-2">
                  per {AFFILIATE_MEMBERSHIP.billingPeriod}
                </span>
              </div>
              <Link href="/pro-network">
                <Button size="lg" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-bold text-base px-8 gap-2">
                  Apply Now <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What You're Actually Buying */}
      <section className="container py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold">
            Not Just a Website — A Complete, Ready-to-Run Business
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Built independently, this is a multi-thousand-dollar project plus a developer on retainer.
            With Cabinet Dealz, you get it all for one annual fee.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Palette,
              title: "Fully Branded Storefront",
              desc: "Your logo, your colors, your own web address. Customers see YOUR brand — not ours.",
            },
            {
              icon: Package,
              title: "Entire Product Catalog",
              desc: "Thousands of cabinets across dozens of door styles, plus surfaces, faucets, and fixtures — kept current for you.",
            },
            {
              icon: PencilRuler,
              title: "2D Kitchen Design Tool",
              desc: "Lay out rooms, drop cabinets, price jobs instantly. Your customers design their dream kitchen right on your site.",
            },
            {
              icon: Globe,
              title: "Bilingual Experience",
              desc: "Full English + Spanish customer experience built in. Reach more customers without extra work.",
            },
            {
              icon: Shield,
              title: "Hosting, Updates & Support",
              desc: "We handle security, uptime, catalog updates, and technical support — every year, handled for you.",
            },
            {
              icon: Truck,
              title: "We Handle Fulfillment",
              desc: "You sell, we ship. Orders go directly to our supply network and ship to your customer. Zero inventory.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-lg bg-[var(--color-navy)]/10 flex items-center justify-center">
                <item.icon className="h-6 w-6 text-[var(--color-navy)]" />
              </div>
              <h3 className="font-serif text-lg font-bold mt-4">{item.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The Numbers */}
      <section className="bg-muted/40 py-16 md:py-20">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold">
              The Math Works in Your Favor
            </h2>
            <p className="text-muted-foreground text-lg mt-4">
              One kitchen order can return more than your annual membership. Every order after that is profit.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-navy)]">
                {formatMembershipPrice()}
              </div>
              <div className="text-sm text-muted-foreground mt-2">Annual membership</div>
            </div>
            <div className="text-center">
              <div className="font-serif text-4xl md:text-5xl font-bold text-emerald-600">
                $2,500+
              </div>
              <div className="text-sm text-muted-foreground mt-2">Average kitchen order margin</div>
            </div>
            <div className="text-center">
              <div className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-gold)]">
                $0
              </div>
              <div className="text-sm text-muted-foreground mt-2">Inventory or shipping costs</div>
            </div>
          </div>

          <div className="mt-12 max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="flex items-start gap-3">
                <Star className="h-6 w-6 text-[var(--color-gold)] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-lg">Trade Pricing Built In</div>
                  <p className="text-muted-foreground mt-1">
                    As a member, you order at buying-group pricing across our entire supply network.
                    Set your own markups on every door style. Your margin, your rules.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold">
            Up and Running in Days, Not Months
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {[
            { step: "1", title: "Apply", desc: "Fill out a quick application" },
            { step: "2", title: "Brand It", desc: "Upload your logo, pick colors" },
            { step: "3", title: "Set Pricing", desc: "Choose your markups" },
            { step: "4", title: "Start Selling", desc: "Share your link & earn" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="h-12 w-12 rounded-full bg-[var(--color-navy)] text-white font-bold text-lg flex items-center justify-center mx-auto">
                {s.step}
              </div>
              <div className="font-semibold mt-3">{s.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who It's For */}
      <section className="bg-[var(--color-navy)] text-white py-16 md:py-20">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold">
              Built for the Cabinet Trade
            </h2>
            <p className="text-white/70 text-lg mt-4">
              Whether you supply, sell, or refer — there's a membership workflow designed for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: TrendingUp,
                title: "Contractors & Remodelers",
                desc: "Offer cabinets to your clients without managing inventory. Design, quote, and order — all from one platform.",
              },
              {
                icon: Store,
                title: "Kitchen Dealers & Showrooms",
                desc: "Expand your catalog instantly. Access dozens of door styles and surfaces without stocking a single unit.",
              },
              {
                icon: Users,
                title: "Referral Partners",
                desc: "Share your link, earn on every order. No selling required — just connect people to great cabinets.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-6">
                <item.icon className="h-8 w-8 text-[var(--color-gold)]" />
                <h3 className="font-serif text-lg font-bold mt-4">{item.title}</h3>
                <p className="text-sm text-white/70 mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16 md:py-20">
        <div className="rounded-2xl border border-border bg-muted/30 p-8 md:p-12 text-center max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl md:text-4xl font-bold">
            Ready to Start Your Cabinet Business?
          </h2>
          <p className="text-muted-foreground text-lg mt-4 mb-8">
            Join the network. Get your storefront. Start earning.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/pro-network">
              <Button size="lg" className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 font-bold text-base px-8 gap-2">
                Apply to Join <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <a href={getLoginUrl()}>
              <Button size="lg" variant="outline" className="gap-2">
                Already a member? Sign in
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            {formatMembershipPrice()}/{AFFILIATE_MEMBERSHIP.billingPeriod} · Free to apply · No inventory required
          </p>
        </div>
      </section>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    confirmed: "border-emerald-400/60 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    submitted: "border-blue-400/60 text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    draft: "border-muted-foreground/40 text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {status}
    </Badge>
  );
}

export default function AffiliateDashboard() {
  const { isAuthenticated, loading } = useAuth();
  const myRef = trpc.affiliates.myReferrals.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AffiliateLanding />;
  }

  if (myRef.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!myRef.data) {
    return <AffiliateLanding />;
  }

  const { affiliate, orders, summary, commissionRate } = myRef.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const storeUrl = `${origin}/store/${affiliate.slug}`;
  const refLink = `${origin}/order/new?ref=${affiliate.referralCode}`;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Could not copy")
    );
  }

  return (
    <div className="container py-10 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-serif text-3xl font-bold">{affiliate.storeName}</h1>
            {statusBadge(affiliate.status)}
          </div>
          <p className="text-muted-foreground">
            Affiliate dashboard · {(commissionRate * 100).toFixed(1)}% commission on confirmed orders
          </p>
        </div>
        <a href={storeUrl} target="_blank" rel="noreferrer">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="h-4 w-4" /> View my storefront
          </Button>
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {[
          { icon: Package, label: "Referred orders", value: summary.referredCount },
          { icon: CheckCircle2, label: "Confirmed", value: summary.confirmedCount },
          { icon: DollarSign, label: "Commission earned", value: `$${summary.commission.toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1.5">
              <s.icon className="h-4 w-4" /> {s.label}
            </div>
            <div className="font-serif text-3xl font-bold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Links */}
      <div className="rounded-xl border border-border bg-card p-5 mb-8 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <LinkIcon className="h-4 w-4" /> Your links
        </h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Branded storefront</Label>
          <div className="flex gap-2">
            <Input readOnly value={storeUrl} className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => copy(storeUrl, "Storefront link")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Quick referral link (tags any order with your code <span className="font-mono">{affiliate.referralCode}</span>)
          </Label>
          <div className="flex gap-2">
            <Input readOnly value={refLink} className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => copy(refLink, "Referral link")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="crm">
        <TabsList>
          <TabsTrigger value="crm">My CRM</TabsTrigger>
          <TabsTrigger value="orders">Referred Orders</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="catalog">My Catalog &amp; Pricing</TabsTrigger>
          <TabsTrigger value="branding">Storefront Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="crm" className="mt-6">
          <CrmBoard lang="en" />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          {orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No referred orders yet. Share your storefront or referral link to start earning.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const total = o.totalAmount === null ? null : Number(o.totalAmount);
                    const commission =
                      o.status === "confirmed" && total != null
                        ? total * commissionRate
                        : null;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-sm">{o.requestNumber ?? `#${o.id}`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{o.originatorName || o.originatorEmail || "—"}</TableCell>
                        <TableCell>{statusBadge(o.status)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {total != null ? `$${total.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {commission != null ? `$${commission.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="earnings" className="mt-6">
          <EarningsPanel />
        </TabsContent>

        <TabsContent value="catalog" className="mt-6">
          <CatalogBrandingEditor />
        </TabsContent>

        <TabsContent value="branding" className="mt-6">
          <BrandingEditor
            affiliate={affiliate}
            onSaved={() => myRef.refetch()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Branding editor ────────────────────────────────────────────────────────────
// The affiliate row shape (subset of fields used by the editor).
type AffiliateRow = {
  tagline: string | null;
  taglineEs: string | null;
  aboutText: string | null;
  aboutTextEs: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  serviceArea: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  storefrontEnabled: boolean | null;
  template: "classic" | "showcase" | "minimal" | "craftsman" | null;
};

const TEMPLATES: { id: "classic" | "showcase" | "minimal" | "craftsman"; name: string; desc: string }[] = [
  { id: "classic", name: "Classic", desc: "Navy split hero with a lifestyle photo and serif headline." },
  { id: "showcase", name: "Showcase", desc: "Full-bleed kitchen photo with overlaid headline and CTAs." },
  { id: "minimal", name: "Minimal", desc: "Light, airy layout with thin rules and lots of whitespace." },
  { id: "craftsman", name: "Craftsman", desc: "Warm, bold type on an accent block — no photo required." },
];

function BrandingEditor({ affiliate, onSaved }: { affiliate: AffiliateRow; onSaved: () => void }) {
  const [form, setForm] = useState({
    tagline: affiliate.tagline ?? "",
    taglineEs: affiliate.taglineEs ?? "",
    aboutText: affiliate.aboutText ?? "",
    aboutTextEs: affiliate.aboutTextEs ?? "",
    primaryColor: affiliate.primaryColor ?? "",
    accentColor: affiliate.accentColor ?? "",
    logoUrl: affiliate.logoUrl ?? "",
    heroImageUrl: affiliate.heroImageUrl ?? "",
    serviceArea: affiliate.serviceArea ?? "",
    facebookUrl: affiliate.facebookUrl ?? "",
    instagramUrl: affiliate.instagramUrl ?? "",
    storefrontEnabled: affiliate.storefrontEnabled ?? true,
    template: (affiliate.template ?? "classic") as "classic" | "showcase" | "minimal" | "craftsman",
  });

  const utils = trpc.useUtils();
  const save = trpc.affiliates.updateMyStorefront.useMutation({
    onSuccess: () => {
      toast.success("Storefront updated");
      utils.affiliates.bySlug.invalidate();
      onSaved();
    },
    onError: (e) => toast.error("Could not save", { description: e.message }),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    save.mutate({
      tagline: form.tagline || null,
      taglineEs: form.taglineEs || null,
      aboutText: form.aboutText || null,
      aboutTextEs: form.aboutTextEs || null,
      primaryColor: form.primaryColor || null,
      accentColor: form.accentColor || null,
      logoUrl: form.logoUrl || null,
      heroImageUrl: form.heroImageUrl || null,
      serviceArea: form.serviceArea || null,
      facebookUrl: form.facebookUrl || null,
      instagramUrl: form.instagramUrl || null,
      storefrontEnabled: form.storefrontEnabled,
      template: form.template,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <div className="font-medium text-sm">Storefront live</div>
          <div className="text-xs text-muted-foreground">Turn your public storefront on or off.</div>
        </div>
        <Switch checked={form.storefrontEnabled} onCheckedChange={(v) => set("storefrontEnabled", v)} />
      </div>

      <div className="space-y-2">
        <Label>Storefront template</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => {
            const active = form.template === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => set("template", tpl.id)}
                aria-pressed={active}
                className={
                  "text-left rounded-lg border p-3 transition-colors " +
                  (active
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-border hover:bg-muted")
                }
              >
                <div className="font-semibold text-sm">{tpl.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tagline">Headline / tagline (English)</Label>
        <Input id="tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Beautiful Kitchens, Built Around You." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="taglineEs">Headline / tagline (Spanish, optional)</Label>
        <Input id="taglineEs" value={form.taglineEs} onChange={(e) => set("taglineEs", e.target.value)} placeholder="Hermosas cocinas, hechas para usted." />
        <p className="text-xs text-muted-foreground">Shown when a visitor switches your storefront to Spanish. Leave blank to reuse the English headline.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="about">About your store (English)</Label>
        <Textarea id="about" rows={3} value={form.aboutText} onChange={(e) => set("aboutText", e.target.value)} placeholder="Tell customers about your business…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="aboutEs">About your store (Spanish, optional)</Label>
        <Textarea id="aboutEs" rows={3} value={form.aboutTextEs} onChange={(e) => set("aboutTextEs", e.target.value)} placeholder="Cuéntele a los clientes sobre su negocio…" />
        <p className="text-xs text-muted-foreground">Optional Spanish version of your store blurb. Leave blank to reuse the English text.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="primary">Primary color (hex)</Label>
          <div className="flex gap-2 items-center">
            <Input id="primary" value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} placeholder="#1a2b4a" className="font-mono" />
            <span className="h-9 w-9 rounded border border-border shrink-0" style={{ backgroundColor: form.primaryColor || "#1a2b4a" }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accent">Accent color (hex)</Label>
          <div className="flex gap-2 items-center">
            <Input id="accent" value={form.accentColor} onChange={(e) => set("accentColor", e.target.value)} placeholder="#c9a227" className="font-mono" />
            <span className="h-9 w-9 rounded border border-border shrink-0" style={{ backgroundColor: form.accentColor || "#c9a227" }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="logo">Logo URL</Label>
          <Input id="logo" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" className="font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hero">Hero image URL</Label>
          <Input id="hero" value={form.heroImageUrl} onChange={(e) => set("heroImageUrl", e.target.value)} placeholder="https://…/kitchen.jpg" className="font-mono text-sm" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="area">Service area</Label>
          <Input id="area" value={form.serviceArea} onChange={(e) => set("serviceArea", e.target.value)} placeholder="Sarasota & Manatee County, FL" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fb">Facebook URL</Label>
          <Input id="fb" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} placeholder="https://facebook.com/…" className="font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ig">Instagram URL</Label>
          <Input id="ig" value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} placeholder="https://instagram.com/…" className="font-mono text-sm" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save storefront
      </Button>
    </div>
  );
}


// ─── My Catalog & Pricing: white-label door-style names + markup ──────────────
const CATEGORY_KEYS: { key: string; label: string }[] = [
  { key: "base", label: "Base cabinets" },
  { key: "wall", label: "Wall cabinets" },
  { key: "tall", label: "Tall / pantry" },
  { key: "vanity", label: "Vanity" },
];

function bpsToPct(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
}
function pctToBps(pct: string): number {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function CatalogBrandingEditor() {
  const { data, isLoading } = trpc.affiliates.myBranding.useQuery();
  const utils = trpc.useUtils();

  const [defaultPct, setDefaultPct] = useState<string | null>(null);
  const [catPct, setCatPct] = useState<Record<string, string>>({});

  const saveMarkup = trpc.affiliates.updateMyMarkup.useMutation({
    onSuccess: () => {
      toast.success("Pricing updated");
      utils.affiliates.myBranding.invalidate();
    },
    onError: (e) => toast.error("Could not save", { description: e.message }),
  });
  const saveStyle = trpc.affiliates.upsertStyleBranding.useMutation({
    onSuccess: () => {
      toast.success("Style saved");
      utils.affiliates.myBranding.invalidate();
    },
    onError: (e) => toast.error("Could not save", { description: e.message }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        No affiliate account linked to you yet.
      </div>
    );
  }

  const defaultBps = data.defaultMarkupBps;
  const effectiveDefaultPct = defaultPct ?? bpsToPct(defaultBps);

  function saveDefault() {
    const categoryMarkup: Record<string, number> = {};
    for (const c of CATEGORY_KEYS) {
      const raw = catPct[c.key];
      const existing = data!.categoryMarkup[c.key];
      if (raw !== undefined && raw !== "") categoryMarkup[c.key] = pctToBps(raw);
      else if (existing != null) categoryMarkup[c.key] = existing;
    }
    saveMarkup.mutate({
      defaultMarkupBps: pctToBps(effectiveDefaultPct),
      categoryMarkup,
    });
  }

  return (
    <div className="space-y-6">
      {/* Markup controls */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-lg">Your markup</h3>
          <p className="text-sm text-muted-foreground">
            Your retail prices are your affiliate cost plus this markup. Set a default for the whole
            catalog, then optionally override it per category or per door style below.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="defmarkup">Default markup %</Label>
            <div className="flex items-center gap-2">
              <Input
                id="defmarkup"
                type="number"
                min={0}
                step="0.5"
                value={effectiveDefaultPct}
                onChange={(e) => setDefaultPct(e.target.value)}
                className="max-w-[140px] tabular-nums"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Per-category overrides (optional)</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORY_KEYS.map((c) => {
              const current = catPct[c.key] ?? (data.categoryMarkup[c.key] != null ? bpsToPct(data.categoryMarkup[c.key]) : "");
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="text-sm w-32 shrink-0">{c.label}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder={`default (${effectiveDefaultPct}%)`}
                    value={current}
                    onChange={(e) => setCatPct((m) => ({ ...m, [c.key]: e.target.value }))}
                    className="max-w-[140px] tabular-nums"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              );
            })}
          </div>
        </div>

        <Button onClick={saveDefault} disabled={saveMarkup.isPending} className="gap-2">
          {saveMarkup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save pricing
        </Button>
      </div>

      {/* Per-style branding table */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-lg">Door-style brand names</h3>
          <p className="text-sm text-muted-foreground">
            Rename any door style for your storefront. Leave blank to use the catalog name.
            An optional per-style markup overrides everything above for that style.
          </p>
        </div>
        <StyleBrandingTable
          styles={data.styles}
          defaultBps={pctToBps(effectiveDefaultPct)}
          onSave={(styleId, brandName, markupBps) => saveStyle.mutate({ styleId, brandName, markupBps })}
          saving={saveStyle.isPending}
        />
      </div>
    </div>
  );
}

interface BrandingStyle {
  id: number;
  ourName: string | null;
  aliasName?: string | null;
  styleCode: string | null;
  doorStyle: string | null;
  color: string | null;
  thumbnailImageUrl: string | null;
  override: { brandName: string | null; markupBps: number | null } | null;
}

function StyleBrandingTable({
  styles,
  defaultBps,
  onSave,
  saving,
}: {
  styles: BrandingStyle[];
  defaultBps: number;
  onSave: (styleId: number, brandName: string | null, markupBps: number | null) => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Catalog name</TableHead>
            <TableHead>Your brand name</TableHead>
            <TableHead className="text-right">Markup % (optional)</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {styles.map((s) => (
            <StyleBrandingRow key={s.id} style={s} defaultBps={defaultBps} onSave={onSave} saving={saving} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StyleBrandingRow({
  style,
  defaultBps,
  onSave,
  saving,
}: {
  style: BrandingStyle;
  defaultBps: number;
  onSave: (styleId: number, brandName: string | null, markupBps: number | null) => void;
  saving: boolean;
}) {
  const [brand, setBrand] = useState(style.override?.brandName ?? "");
  const [markup, setMarkup] = useState(
    style.override?.markupBps != null ? bpsToPct(style.override.markupBps) : ""
  );
  const dirty =
    brand !== (style.override?.brandName ?? "") ||
    markup !== (style.override?.markupBps != null ? bpsToPct(style.override.markupBps) : "");

  const effectiveBps = markup !== "" ? pctToBps(markup) : defaultBps;

  return (
    <TableRow>
      <TableCell className="text-sm">
        <div className="font-medium">{style.aliasName || style.ourName}</div>
        {style.color && <div className="text-xs text-muted-foreground">{style.color}</div>}
      </TableCell>
      <TableCell>
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder={style.aliasName || style.ourName || ""}
          className="min-w-[160px]"
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            min={0}
            step="0.5"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            placeholder={bpsToPct(defaultBps)}
            className="max-w-[100px] tabular-nums text-right"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          effective {bpsToPct(effectiveBps)}%
        </div>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => onSave(style.id, brand.trim() || null, markup !== "" ? pctToBps(markup) : null)}
        >
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}


function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function EarningsPanel() {
  const { data, isLoading } = trpc.affiliates.myEarnings.useQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        No affiliate account is linked to you yet.
      </div>
    );
  }

  const statusClass: Record<string, string> = {
    pending: "border-amber-400/60 text-amber-700 bg-amber-50",
    issued: "border-blue-400/60 text-blue-700 bg-blue-50",
    paid: "border-emerald-400/60 text-emerald-700 bg-emerald-50",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" /> This week ({data.thisWeekKey})
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{money(data.thisWeekCents)}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" /> Pending (unpaid)
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{money(data.pendingCents)}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" /> Paid to date
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{money(data.paidCents)}</div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Commission is earned when a referred order is <strong>confirmed</strong>, calculated at{" "}
        {(data.commissionRate * 100).toFixed(1)}% and grouped by week (Mon–Sun). Payouts are
        issued weekly; status updates here once the team marks a week issued or paid.
      </p>

      {data.weeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No confirmed referred orders yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Payout status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.weeks.map((w) => {
                const status = w.payout?.status ?? "pending";
                return (
                  <TableRow key={w.weekKey}>
                    <TableCell className="font-mono text-xs">{w.weekKey}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.count}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {money(w.totalCommissionCents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[status]}>{status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
