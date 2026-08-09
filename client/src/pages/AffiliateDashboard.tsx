import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AffiliateDashboardLayout, type AffiliateSection } from "@/components/affiliate/AffiliateDashboardLayout";
import AffiliatePricingPanel from "@/components/affiliate/AffiliatePricingPanel";
import AffiliateCatalogPanel from "@/components/affiliate/AffiliateCatalogPanel";
import AffiliateAnalyticsPanel from "@/components/affiliate/AffiliateAnalyticsPanel";
import AffiliateMarketingHub from "@/components/affiliate/AffiliateMarketingHub";
import AffiliatePromotionsPanel from "@/components/affiliate/AffiliatePromotionsPanel";
import { AffiliateAppointmentsPanel } from "@/components/affiliate/AffiliateAppointmentsPanel";
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
  Wand2, Send, ChevronRight, ImageIcon, FileText, AlertCircle, Upload, Eye, EyeOff,
  ShoppingBag, BarChart2, BookOpen, Tag, Megaphone,
} from "lucide-react";
import { CrmBoard } from "@/components/crm/CrmBoard";
import {
  AFFILIATE_MEMBERSHIP,
  formatMembershipPrice,
} from "@shared/affiliate";
import { KITCHEN_SCENES } from "@/lib/doorFamilyPhotos";

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
  const { isAuthenticated, loading, user } = useAuth();
  const [section, setSection] = useState<AffiliateSection>("overview");

  // Admin "View as" support: ?viewAs=<affiliateId> lets admins see any affiliate's dashboard
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const viewAsId = params.get("viewAs");
  const isAdmin = user?.role === "admin";
  const isAdminViewAs = !!viewAsId && isAdmin;

  const myRef = trpc.affiliates.myReferrals.useQuery(undefined, {
    enabled: isAuthenticated && !isAdmin,
    retry: false,
  });

  const adminRef = trpc.affiliates.adminReferrals.useQuery(
    { affiliateId: Number(viewAsId) },
    { enabled: isAdminViewAs, retry: false }
  );

  // Admin without ?viewAs= param: load the full affiliate list and show the first one
  const adminList = trpc.affiliates.adminList.useQuery(undefined, {
    enabled: isAdmin && !isAdminViewAs,
    retry: false,
  });

  // For admin without viewAs, pick the first affiliate from the list
  const adminFirstAffiliate = trpc.affiliates.adminReferrals.useQuery(
    { affiliateId: (adminList.data as any)?.[0]?.id ?? 0 },
    { enabled: isAdmin && !isAdminViewAs && !!(adminList.data as any)?.[0]?.id, retry: false }
  );

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

  // Determine which query to use based on role and context
  let activeQuery: typeof myRef;
  if (isAdminViewAs) {
    activeQuery = adminRef;
  } else if (isAdmin) {
    activeQuery = adminFirstAffiliate;
  } else {
    activeQuery = myRef;
  }

  if (activeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!activeQuery.data) {
    // Admin should never see the landing page - show a message instead
    if (isAdmin) {
      return (
        <div className="container max-w-md py-20 text-center">
          <h1 className="font-serif text-2xl font-bold mb-3">No Affiliates Yet</h1>
          <p className="text-muted-foreground mb-6">Create your first affiliate from the Admin panel.</p>
          <a href="/admin">
            <Button className="bg-[var(--color-navy)] text-white">Go to Admin</Button>
          </a>
        </div>
      );
    }
    return <AffiliateLanding />;
  }

  const { affiliate, orders, summary, commissionRate } = activeQuery.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const storeUrl = `${origin}/store/${affiliate.slug}`;
  const refLink = `${origin}/order/new?ref=${affiliate.referralCode}`;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Could not copy")
    );
  }

  function renderSection() {
    switch (section) {
      case "overview":
        return (
          <div className="space-y-6 max-w-4xl">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-serif text-2xl font-bold">{affiliate.storeName}</h1>
                {statusBadge(affiliate.status)}
              </div>
              <p className="text-muted-foreground text-sm">
                {(commissionRate * 100).toFixed(1)}% commission on confirmed orders
              </p>
            </div>
            {/* KPI cards */}
            <div className="grid gap-4 sm:grid-cols-3">
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
            {/* Quick links */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
                  <a href={storeUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="icon"><ExternalLink className="h-4 w-4" /></Button>
                  </a>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Quick referral link (code: <span className="font-mono">{affiliate.referralCode}</span>)
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={refLink} className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copy(refLink, "Referral link")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            {/* Quick nav shortcuts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {([
                { label: "My CRM", section: "crm" as AffiliateSection, icon: ShoppingBag },
                { label: "Earnings", section: "earnings" as AffiliateSection, icon: DollarSign },
                { label: "Analytics", section: "analytics" as AffiliateSection, icon: BarChart2 },
                { label: "My Catalog", section: "catalog" as AffiliateSection, icon: BookOpen },
                { label: "Pricing", section: "pricing" as AffiliateSection, icon: Tag },
                { label: "Marketing Hub", section: "marketing" as AffiliateSection, icon: Megaphone },
              ] as const).map((item) => (
                <button
                  key={item.section}
                  onClick={() => setSection(item.section)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <item.icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case "crm":
        return (
          <div className="max-w-full">
            <h2 className="text-xl font-bold mb-4">My CRM</h2>
            <CrmBoard lang="en" affiliateId={affiliate.id} />
          </div>
        );
      case "orders":
        return (
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold mb-4">Referred Orders</h2>
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
          </div>
        );
      case "earnings":
        return <EarningsPanel />;
      case "analytics":
        return <AffiliateAnalyticsPanel />;
      case "catalog":
        return <AffiliateCatalogPanel />;
      case "pricing":
        return <AffiliatePricingPanel />;
      case "customize":
        return (
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold mb-4">Customize Store</h2>
            <CustomizeTab affiliate={affiliate} onSaved={() => myRef.refetch()} />
          </div>
        );
      case "promotions":
        return (
          <div className="max-w-4xl">
            <AffiliatePromotionsPanel />
          </div>
        );
      case "appointments":
        return (
          <div className="max-w-4xl">
            <AffiliateAppointmentsPanel />
          </div>
        );
      case "marketing":
        return <AffiliateMarketingHub />;
      case "tax":
        return (
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold mb-4">Tax Info (W-9)</h2>
            <W9Panel />
          </div>
        );
      case "team":
        return <AffiliateTeamPanel />;
      default:
        return null;
    }
  }

  return (
    <AffiliateDashboardLayout
      section={section}
      onSection={setSection}
      storeName={affiliate.storeName}
      storeSlug={affiliate.slug}
    >
      {renderSection()}
    </AffiliateDashboardLayout>
  );
}

// ─── Credentials Panel ─────────────────────────────────────────────────────────
type CredentialsPanelProps = {
  affiliate: {
    storeName: string;
    slug: string;
    referralCode: string;
    template: string | null;
    email?: string | null;
    contactName?: string | null;
  };
  storeUrl: string;
  refLink: string;
  onCopy: (text: string, label: string) => void;
};

function CredentialsPanel({ affiliate, storeUrl, refLink, onCopy }: CredentialsPanelProps) {
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/affiliate` : "/affiliate";
  const templateName = affiliate.template
    ? affiliate.template.charAt(0).toUpperCase() + affiliate.template.slice(1)
    : "Classic";
  const previewUrl = `/store-preview/${affiliate.template ?? "classic"}`;

  return (
    <div className="space-y-6">
      {/* Access credentials */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Your Access Credentials
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Affiliate Portal Login</Label>
            <div className="flex gap-2">
              <Input readOnly value={loginUrl} className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => onCopy(loginUrl, "Login URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Log in with your Manus account to access this dashboard.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Referral Code</Label>
            <div className="flex gap-2">
              <Input readOnly value={affiliate.referralCode} className="font-mono text-sm font-bold tracking-widest" />
              <Button variant="outline" size="icon" onClick={() => onCopy(affiliate.referralCode, "Referral code")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Embed this code in any link to tag orders to your account.</p>
          </div>
        </div>
      </div>

      {/* Storefront links */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" /> Your Storefront Links
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Branded Storefront URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={storeUrl} className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => onCopy(storeUrl, "Storefront URL")}>
                <Copy className="h-4 w-4" />
              </Button>
              <a href={storeUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" size="icon"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Share this link with customers — it's your fully branded cabinet store.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quick Referral Link (tags any order)</Label>
            <div className="flex gap-2">
              <Input readOnly value={refLink} className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => onCopy(refLink, "Referral link")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Use this on social media or email — any order placed through it earns you commission.</p>
          </div>
        </div>
      </div>

      {/* Template */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Storefront Template
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current:</span>
            <span className="font-semibold text-sm">{templateName}</span>
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </Button>
            </a>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          To change your template, go to the <strong>Customize</strong> tab. You can preview all four templates before choosing.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["classic", "showcase", "minimal", "craftsman"] as const).map((t) => (
            <a key={t} href={`/store-preview/${t}`} target="_blank" rel="noreferrer"
              className={`rounded-lg border p-3 text-center text-sm hover:border-primary transition-colors cursor-pointer ${
                (affiliate.template ?? "classic") === t ? "border-primary bg-primary/5 font-semibold" : "border-border"
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {(affiliate.template ?? "classic") === t && (
                <span className="ml-1 text-xs text-primary">(active)</span>
              )}
            </a>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <a href={storeUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2">
              <Store className="h-4 w-4" /> View My Storefront
            </Button>
          </a>
          <a href="/design">
            <Button variant="outline" className="gap-2">
              <PencilRuler className="h-4 w-4" /> Open Design Tool
            </Button>
          </a>
          <Button variant="outline" className="gap-2" onClick={() => {
            const text = `Your affiliate credentials:\n\nStorefront: ${storeUrl}\nReferral link: ${refLink}\nReferral code: ${affiliate.referralCode}\nLogin: ${loginUrl}`;
            onCopy(text, "All credentials");
          }}>
            <Copy className="h-4 w-4" /> Copy All Credentials
          </Button>
          <a href="/manus-storage/Cabinet-Dealz-Affiliate-Welcome-Guide_f17152cc.pdf" target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              <Send className="h-4 w-4" /> Download Welcome Guide
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Customize Tab ──────────────────────────────────────────────────────────────
// Combines the BrandingEditor (template, colors, logo, tagline, about, socials)
// with a Room Scene Picker and an AI Concierge upsell card.

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

type KitchenSceneKey = "shaker-white" | "shaker-gray" | "shaker-espresso" | "raised-cherry" | "slab-natural";

const SCENE_LABELS: Record<KitchenSceneKey, { name: string; desc: string }> = {
  "shaker-white": { name: "White Shaker", desc: "Bright, timeless, and universally loved." },
  "shaker-gray": { name: "Gray Shaker", desc: "Warm greige — modern farmhouse feel." },
  "shaker-espresso": { name: "Espresso", desc: "Rich, dramatic, and contemporary." },
  "raised-cherry": { name: "Cherry Raised Panel", desc: "Classic warm wood with traditional depth." },
  "slab-natural": { name: "Natural Wood Slab", desc: "Sleek European-modern with warmth." },
};

function CustomizeTab({ affiliate, onSaved }: { affiliate: AffiliateRow; onSaved: () => void }) {
  const [uploading, setUploading] = useState(false);
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

  const uploadHeroImage = trpc.affiliates.uploadHeroImage.useMutation({
    onSuccess: ({ url }) => {
      set("heroImageUrl", url);
      toast.success("Hero image uploaded — save to apply");
    },
    onError: (e) => toast.error("Upload failed", { description: e.message }),
  });

  async function handleHeroFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10 MB"); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) { toast.error("Could not read image"); setUploading(false); return; }
        uploadHeroImage.mutate({ imageBase64: match[2], contentType: match[1], fileName: file.name }, {
          onSettled: () => setUploading(false),
        });
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
    e.target.value = "";
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

  // Detect which scene key is currently active (if heroImageUrl matches one)
  const activeScene = (Object.keys(KITCHEN_SCENES) as KitchenSceneKey[]).find(
    (k) => KITCHEN_SCENES[k] === form.heroImageUrl
  ) ?? null;

  return (
    <div className="space-y-6">

      {/* ── Storefront on/off ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" /> Storefront Visibility
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <div className="font-medium text-sm">Storefront live</div>
            <div className="text-xs text-muted-foreground">Turn your public storefront on or off.</div>
          </div>
          <Switch checked={form.storefrontEnabled} onCheckedChange={(v) => set("storefrontEnabled", v)} />
        </div>
      </div>

      {/* ── Room Scene Picker ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> Hero Room Scene
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the kitchen scene displayed as your storefront hero image. This sets the visual mood for your brand.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(KITCHEN_SCENES) as KitchenSceneKey[]).map((key) => {
            const isActive = activeScene === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => set("heroImageUrl", KITCHEN_SCENES[key])}
                className={`relative rounded-xl overflow-hidden border-2 transition-all text-left group ${
                  isActive
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={KITCHEN_SCENES[key]}
                    alt={SCENE_LABELS[key].name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{SCENE_LABELS[key].name}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs px-2 py-0.5">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{SCENE_LABELS[key].desc}</p>
                </div>
              </button>
            );
          })}
          {/* Upload your own photo */}
          <div
            className={`rounded-xl border-2 p-3 transition-all ${
              !activeScene && form.heroImageUrl ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
            }`}
          >
            <div className="font-semibold text-sm mb-2 flex items-center gap-2">
              <ImageIcon className="h-3.5 w-3.5" /> Upload Your Own Photo
            </div>
            {/* Preview */}
            {!activeScene && form.heroImageUrl ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg mb-2">
                <img src={form.heroImageUrl} alt="Custom hero" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => set("heroImageUrl", "")}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
                  title="Remove"
                >×</button>
              </div>
            ) : null}
            <label className="flex items-center justify-center gap-2 cursor-pointer w-full rounded-lg border border-dashed border-border bg-muted/40 hover:bg-muted/70 transition-colors py-3 px-4 text-sm font-medium">
              {uploading || uploadHeroImage.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><ImageIcon className="h-4 w-4" /> {!activeScene && form.heroImageUrl ? "Replace photo" : "Choose photo"}</>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleHeroFileChange}
                disabled={uploading || uploadHeroImage.isPending}
              />
            </label>
            <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG, or WebP — max 10 MB. Appears only on your storefront.</p>
          </div>
        </div>
      </div>

      {/* ── Template picker ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" /> Layout Template
        </h2>
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
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">{tpl.name}</div>
                  {active && <Badge variant="default" className="text-xs px-2 py-0.5">Active</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</div>
                <a
                  href={`/store-preview/${tpl.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Brand identity ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" /> Brand Identity
        </h2>

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

        <div className="space-y-1.5">
          <Label htmlFor="logo">Logo URL</Label>
          <Input id="logo" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" className="font-mono text-sm" />
        </div>
      </div>

      {/* ── Storefront copy ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <PencilRuler className="h-4 w-4 text-primary" /> Storefront Copy
        </h2>

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
      </div>

      {/* ── Save button ───────────────────────────────────────────────────── */}
      <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save storefront
      </Button>

      {/* ── AI Concierge upsell card ──────────────────────────────────────── */}
      <AiConciergeCard />
    </div>
  );
}

// ─── AI Concierge Upsell Card ───────────────────────────────────────────────────
function AiConciergeCard() {
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const request = trpc.affiliates.requestAiConcierge.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setDescription("");
      toast.success("Request sent! Our design team will be in touch within 1 business day.");
    },
    onError: (e) => toast.error("Could not send request", { description: e.message }),
  });

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center space-y-3">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
        <div className="font-semibold text-lg">Request received!</div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Our design team will review your request and reach out within 1 business day to discuss your vision and confirm the scope.
        </p>
        <Button variant="outline" size="sm" onClick={() => setSubmitted(false)}>
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-gold)]/40 bg-gradient-to-br from-[var(--color-navy)]/5 to-[var(--color-gold)]/5 p-6 space-y-5">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-[var(--color-navy)] flex items-center justify-center shrink-0">
          <Wand2 className="h-6 w-6 text-[var(--color-gold)]" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-xl font-bold">AI Concierge Service</h3>
            <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">$100 / hour</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
            Want a truly custom storefront? Our design team will work with you one-on-one to craft your front page, 
            write compelling copy, select the perfect room scenes, and fine-tune every detail — all powered by AI and 
            reviewed by a human designer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Sparkles, title: "Custom copywriting", desc: "Headlines, taglines, and about text tailored to your brand voice" },
          { icon: ImageIcon, title: "Scene curation", desc: "Hand-picked room scenes and hero images that match your target market" },
          { icon: Palette, title: "Color & layout tuning", desc: "Brand colors, template selection, and layout optimized for conversions" },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-card p-3 flex gap-3">
            <item.icon className="h-4 w-4 text-[var(--color-gold)] shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">{item.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Label htmlFor="concierge-desc" className="font-medium">
          Describe what you'd like to achieve
        </Label>
        <Textarea
          id="concierge-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="E.g. I want my storefront to feel upscale and appeal to homeowners in the Sarasota area. I'd like a warm, modern look with cherry wood tones and Spanish language support…"
        />
        <p className="text-xs text-muted-foreground">
          Be as detailed as you like — the more context you give, the better we can tailor the work to your vision.
          We'll confirm the estimated hours and cost before starting.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => request.mutate({ description })}
          disabled={request.isPending || description.trim().length < 10}
          className="gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
        >
          {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Request
        </Button>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <ChevronRight className="h-3 w-3" /> We'll respond within 1 business day
        </span>
      </div>
    </div>
  );
}

// ─── Earnings Panel ─────────────────────────────────────────────────────────────

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

  // W-9 gate: if not started (pending) or submitted-but-awaiting-review, show a notice instead of payout details.
  // Schema: pending = not started, submitted = awaiting admin review, verified = approved
  if (data.w9Status === "pending" || data.w9Status === "submitted") {
    const isUnderReview = data.w9Status === "submitted";
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {isUnderReview ? "W-9 Under Review" : "W-9 Required Before Payouts"}
        </div>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {isUnderReview
            ? "Your W-9 tax form has been submitted and is currently under review. Payout details will be visible once it has been verified by our team."
            : "To receive commission payouts, you must first complete and submit your W-9 tax form. This is required by the IRS for all affiliate payments."}
        </p>
        <button
          onClick={() => {
            // Navigate to the Tax Info tab
            const el = document.querySelector('[data-tab="tax"]') as HTMLElement | null;
            el?.click();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
        >
          {isUnderReview ? "View W-9 Status" : "Complete W-9 Form"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

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

// ─── W-9 / Tax Compliance Panel ────────────────────────────────────────────────
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const ENTITY_LABELS: Record<string, string> = {
  individual: "Individual",
  sole_proprietor: "Sole Proprietor",
  llc_single: "LLC (Single-Member)",
  llc_partnership: "LLC (Partnership)",
  llc_corp: "LLC (C or S Corp)",
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  partnership: "Partnership",
  trust: "Trust / Estate",
  other: "Other",
};

function W9Panel() {
  const utils = trpc.useUtils();
  const { data: w9, isLoading } = trpc.affiliates.getW9Status.useQuery();

  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [entityType, setEntityType] = useState<string>("individual");
  const [taxIdType, setTaxIdType] = useState<"ssn" | "ein">("ssn");
  const [taxId, setTaxId] = useState("");
  const [showTaxId, setShowTaxId] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("FL");
  const [zip, setZip] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);

  // Pre-fill form from saved data
  useEffect(() => {
    if (!w9 || formReady) return;
    if (w9.w9LegalName) setLegalName(w9.w9LegalName);
    if (w9.w9BusinessName) setBusinessName(w9.w9BusinessName);
    if (w9.w9EntityType) setEntityType(w9.w9EntityType);
    if (w9.w9TaxIdType) setTaxIdType(w9.w9TaxIdType);
    if (w9.w9Address) setAddress(w9.w9Address);
    if (w9.w9City) setCity(w9.w9City);
    if (w9.w9State) setState(w9.w9State);
    if (w9.w9Zip) setZip(w9.w9Zip);
    setFormReady(true);
  }, [w9, formReady]);

  const saveInfo = trpc.affiliates.saveW9Info.useMutation({
    onSuccess: () => {
      toast.success("Tax information saved.");
      utils.affiliates.getW9Status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadId = trpc.affiliates.uploadIdDocument.useMutation({
    onSuccess: (data) => {
      toast.success("ID document uploaded.");
      setIdPreview(data.url);
      utils.affiliates.getW9Status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitW9 = trpc.affiliates.submitW9.useMutation({
    onSuccess: () => {
      toast.success("W-9 submitted for review. We'll verify within 1–2 business days.");
      utils.affiliates.getW9Status.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleIdUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setIdPreview(dataUrl);
      const base64 = dataUrl.split(",")[1] ?? "";
      uploadId.mutate({ fileBase64: base64, contentType: file.type, fileName: file.name });
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (!legalName || !taxId || !address || !city || !zip) {
      toast.error("Please fill in all required fields.");
      return;
    }
    saveInfo.mutate({
      legalName,
      businessName: businessName || undefined,
      entityType: entityType as Parameters<typeof saveInfo.mutate>[0]["entityType"],
      taxId,
      taxIdType,
      address,
      city,
      state,
      zip,
    });
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const isVerified = w9?.w9Status === "verified";
  const isSubmitted = w9?.w9Status === "submitted";
  const hasId = !!(w9?.w9IdDocumentUrl || idPreview);

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {isVerified && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">W-9 Verified</p>
            <p className="text-sm text-emerald-700">Your tax information has been verified. You are eligible for 1099 payouts.</p>
          </div>
        </div>
      )}
      {isSubmitted && !isVerified && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-5 py-4">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <p className="font-semibold text-blue-800">Under Review</p>
            <p className="text-sm text-blue-700">Your W-9 has been submitted and is being reviewed. We'll confirm within 1–2 business days.</p>
          </div>
        </div>
      )}
      {!isSubmitted && !isVerified && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Action Required — Complete Your W-9</p>
            <p className="text-sm text-amber-700">You must submit your tax information and a government-issued ID before commissions can be paid out. This is required by IRS regulations for 1099-NEC reporting.</p>
          </div>
        </div>
      )}

      {/* Legal information form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Legal &amp; Tax Information
        </h2>
        <p className="text-sm text-muted-foreground -mt-2">
          This information is used solely for IRS 1099-NEC reporting. Your tax ID is stored securely and never shared with third parties.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w9-legal-name">Legal name (as it appears on your tax return) <span className="text-destructive">*</span></Label>
            <Input
              id="w9-legal-name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="John Smith or ABC Cabinets LLC"
              disabled={isVerified}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w9-biz-name">Business name / DBA <span className="text-muted-foreground font-normal">(if different from above)</span></Label>
            <Input
              id="w9-biz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="ABC Cabinets (optional)"
              disabled={isVerified}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Federal tax classification <span className="text-destructive">*</span></Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              disabled={isVerified}
            >
              {Object.entries(ENTITY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tax ID type <span className="text-destructive">*</span></Label>
            <div className="flex gap-3 pt-1">
              {(["ssn", "ein"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taxIdType"
                    value={t}
                    checked={taxIdType === t}
                    onChange={() => setTaxIdType(t)}
                    disabled={isVerified}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">{t === "ssn" ? "SSN (Individual)" : "EIN (Business)"}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w9-tax-id">
              {taxIdType === "ssn" ? "Social Security Number (SSN)" : "Employer Identification Number (EIN)"}
              <span className="text-destructive"> *</span>
            </Label>
            <div className="relative">
              <Input
                id="w9-tax-id"
                type={showTaxId ? "text" : "password"}
                value={isVerified ? (w9?.w9TaxIdMasked ?? "***-**-****") : taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder={taxIdType === "ssn" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                disabled={isVerified}
                className="pr-10"
              />
              {!isVerified && (
                <button
                  type="button"
                  onClick={() => setShowTaxId(!showTaxId)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showTaxId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Your tax ID is encrypted and only used for 1099 reporting.</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-3">Mailing Address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="w9-address">Street address <span className="text-destructive">*</span></Label>
              <Input id="w9-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" disabled={isVerified} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w9-city">City <span className="text-destructive">*</span></Label>
              <Input id="w9-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sarasota" disabled={isVerified} />
            </div>
            <div className="space-y-1.5">
              <Label>State <span className="text-destructive">*</span></Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={isVerified}
              >
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w9-zip">ZIP code <span className="text-destructive">*</span></Label>
              <Input id="w9-zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="34230" disabled={isVerified} />
            </div>
          </div>
        </div>

        {!isVerified && (
          <Button onClick={handleSave} disabled={saveInfo.isPending} className="gap-2">
            {saveInfo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Tax Information
          </Button>
        )}
      </div>

      {/* Government ID upload */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Government-Issued ID
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload a clear photo or scan of a valid government-issued ID (driver's license, state ID, or passport). This is required to verify your identity before payouts are released.
        </p>

        {(w9?.w9IdDocumentUrl || idPreview) ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-800">ID document uploaded</span>
              {w9?.w9IdDocumentUrl && (
                <a href={w9.w9IdDocumentUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> View
                </a>
              )}
            </div>
            {!isVerified && (
              <label className="cursor-pointer">
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleIdUpload} className="hidden" />
                <Button variant="outline" size="sm" className="gap-2 pointer-events-none">
                  <Upload className="h-3.5 w-3.5" /> Replace ID Document
                </Button>
              </label>
            )}
          </div>
        ) : (
          <label className="cursor-pointer block">
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleIdUpload} className="hidden" disabled={isVerified} />
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Click to upload your ID</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, or PDF · Max 10MB</p>
              {uploadId.isPending && <Spinner className="mt-3" />}
            </div>
          </label>
        )}
      </div>

      {/* Submit for review */}
      {!isVerified && !isSubmitted && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Submit for Review</h2>
          <p className="text-sm text-muted-foreground">
            Once you have filled in all your legal information and uploaded your ID, click below to submit your W-9 for review. We will verify within 1–2 business days and notify you when payouts are enabled.
          </p>
          <Button
            onClick={() => submitW9.mutate()}
            disabled={submitW9.isPending || !w9?.w9LegalName || !hasId}
            className="gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
          >
            {submitW9.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit W-9 for Review
          </Button>
          {(!w9?.w9LegalName || !hasId) && (
            <p className="text-xs text-muted-foreground">
              {!w9?.w9LegalName && "Please save your tax information first. "}
              {!hasId && "Please upload your government ID first."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
import { AffiliateTeamPanel } from "@/components/affiliate/AffiliateTeamPanel";
