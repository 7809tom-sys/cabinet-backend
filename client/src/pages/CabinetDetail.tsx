import { useState, useMemo, useEffect } from "react";
import { Link, useSearch } from "wouter";
import {
  ChevronLeft, Package, Palette, DollarSign,
  ShoppingCart, Info, Check, Lock,
  Pencil, X, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  type PricingTier,
  resolveStorefrontTier,
  resolveTierPrice,
  compareAtPrice,
  tierLabel,
  ownerCostBreakdown,
} from "@shared/pricingTier";
import { CabinetImage } from "@/components/CabinetImage";
import { cabinetTypeLabel, resolveDoorDrawerCounts } from "@/lib/cabinetGraphics";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { doorFamilyPhoto, realImageUrl } from "@/lib/doorFamilyPhotos";
import { finishColors } from "@/lib/design";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { buildProductJsonLd } from "@/lib/seo/jsonLd";
import { translateSpec } from "@/lib/i18n/specPhrases";

// ─── Price tier display ───────────────────────────────────────────────────────
// Retail storefront: guests/homeowners see retail (homeowner) pricing with a
// "Compare at" strike-through. Logged-in pros see the tier the owner assigned
// to their account (contractor or wholesale).

const TIER_DESCRIPTION: Record<PricingTier, string> = {
  homeowner: "Retail price for homeowners",
  contractor: "For general contractors & remodelers",
  wholesale: "For licensed dealers & high-volume trade accounts",
};

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

// ─── Door-style pricing row (distributor identity never exposed) ───────────────

interface StyleRow {
  styleId: number;
  styleCode: string;
  name: string;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  thumbnailImageUrl: string | null;
  listPrice: string | null;
  adjustedListPrice: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  platformSku: string;
  leadTimeDays: number | null;
  distributorId: number | null;
}

function priceNumberForTier(row: StyleRow, tier: PricingTier): number | null {
  return resolveTierPrice(tier, row);
}

function priceForTier(row: StyleRow, tier: PricingTier): string {
  const n = priceNumberForTier(row, tier);
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

// ─── Price card (tier price + homeowner "Compare at" strike-through) ─────────

function PriceCard({
  row,
  tier,
  isOwner = false,
}: {
  row: StyleRow;
  tier: PricingTier;
  isOwner?: boolean;
}) {
  const price = priceNumberForTier(row, tier);
  const compareAt = compareAtPrice(tier, row);
  const owner = isOwner ? ownerCostBreakdown(row, tier) : null;
  const savePct =
    compareAt != null && price != null && compareAt > price
      ? Math.round(((compareAt - price) / compareAt) * 100)
      : null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-3xl font-bold text-foreground">
              {price == null ? "—" : `$${price.toFixed(2)}`}
            </div>
            {compareAt != null && (
              <div className="text-base text-muted-foreground line-through">
                ${compareAt.toFixed(2)}
              </div>
            )}
            {savePct != null && savePct > 0 && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                Save {savePct}%
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {TIER_DESCRIPTION[tier]}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          {tier !== "homeowner" && <div>MSRP: {fmt(row.listPrice)}</div>}
          {row.leadTimeDays != null && <div>Lead time: ~{row.leadTimeDays} days</div>}
        </div>
      </div>

      {owner && owner.myCost != null && (
        <div className="mt-3 pt-3 border-t border-dashed border-amber-500/60 rounded-md bg-amber-500/5 px-3 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
            <span>Owner view · not shown to customers</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">My Cost</div>
              <div className="font-semibold text-foreground">${owner.myCost.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Sells At ({tierLabel(tier)})</div>
              <div className="font-semibold text-foreground">
                {owner.sellPrice == null ? "—" : `$${owner.sellPrice.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Margin</div>
              <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                {owner.marginDollars == null
                  ? "—"
                  : `$${owner.marginDollars.toFixed(2)}${owner.marginPct != null ? ` (${owner.marginPct}%)` : ""}`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
        <span>{row.name}</span>
        {row.doorStyle && (
          <>
            <span className="mx-2">·</span>
            <span>{row.doorStyle}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

interface Props {
  masterCode: string;
}

export default function CabinetDetail({ masterCode }: Props) {
  const searchStr = useSearch();
  // When a shopper arrives from a door-style FAMILY page we pre-lock that style
  // (passed as ?style=<styleId>) so the cabinet shows in the family they picked.
  const styleParam = (() => {
    const v = new URLSearchParams(searchStr).get("style");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(styleParam);
  const { user } = useAuth();
  // The viewer's storefront tier: guests/homeowners see retail; logged-in pros
  // see their assigned tier. Pros may toggle to compare, but the default is
  // their own tier.
  const viewerTier = resolveStorefrontTier(user);
  const [tierOverride, setTierOverride] = useState<PricingTier | null>(null);
  const tier: PricingTier = tierOverride ?? viewerTier;
  const setTier = (t: PricingTier) => setTierOverride(t);
  // Pros (assigned a trade tier) may switch between homeowner/contractor/
  // wholesale to compare; pure homeowners/guests only ever see retail.
  const isPro = viewerTier !== "homeowner";
  // Owner/admin sees an extra "My Cost / Margin" row on the price card. This is
  // NEVER shown to affiliates or customers.
  const isOwner = user?.role === "admin";
  const visibleTiers: PricingTier[] = isPro || isOwner
    ? ["homeowner", "contractor", "wholesale"]
    : ["homeowner"];
  const [qty, setQty] = useState(1);
  const { t, lang } = useLanguage();

  const { data: cabinet, isLoading: cabinetLoading } = trpc.cabinets.byCode.useQuery({
    masterCode,
  });

  const seoName = cabinet?.description
    ? translateSpec(cabinet.description, lang)
    : masterCode;
  // Product structured data (no Offer — cabinet pricing is tier/member-gated
  // and must not be published in markup). Memoized so the JSON-LD <script>
  // isn't re-injected on every render.
  const cabinetJsonLd = useMemo(
    () =>
      cabinet
        ? buildProductJsonLd({
            name: seoName,
            description: translateSpec(cabinet.description ?? "", lang),
            sku: masterCode,
            image: cabinet.catalogImageUrl ?? undefined,
            url:
              typeof window !== "undefined"
                ? `${window.location.origin}/catalog/${masterCode}`
                : undefined,
            category: cabinet.category ?? undefined,
          })
        : undefined,
    [cabinet, seoName, masterCode, lang],
  );
  useSeo({
    title: t("seo_cabinet_t", { name: seoName }),
    description: t("seo_cabinet_d", { name: seoName }),
    type: "product",
    lang,
    ...(cabinetJsonLd ? { jsonLd: cabinetJsonLd } : {}),
  });

  const { data: styles, isLoading: pricingLoading } = trpc.pricing.stylesForCabinet.useQuery(
    { cabinetId: cabinet?.id ?? 0 },
    { enabled: !!cabinet?.id }
  );

  const styleRows = (styles ?? []) as StyleRow[];

  // Auto-select: the family passed in ?style= if it's available for this
  // cabinet, otherwise the explicit user choice, otherwise the first style.
  const styleParamAvailable =
    styleParam != null && styleRows.some((s) => s.styleId === styleParam);
  const activeStyle =
    selectedStyleId ??
    (styleParamAvailable ? styleParam : null) ??
    styleRows[0]?.styleId ??
    null;
  const selectedRow = styleRows.find((s) => s.styleId === activeStyle) ?? null;

  // Recolor the to-scale drawing to the selected door style's real finish.
  const finishFace = finishColors(
    selectedRow?.name,
    selectedRow?.color,
    selectedRow?.finish,
    selectedRow?.styleCode
  ).face;

  const { addItem, lockedDistributorId, lockedStyleLabel, clear } = useCart();

  // ── Admin inline edit ────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [editShowInCatalog, setEditShowInCatalog] = useState(true);
  const [editShowInDesigner, setEditShowInDesigner] = useState(true);
  const [editShowIn2020, setEditShowIn2020] = useState(true);

  // Pre-fill form when dialog opens
  useEffect(() => {
    if (editOpen && cabinet) {
      setEditDescription(cabinet.description ?? "");
      setEditCategory(cabinet.category ?? "");
      setEditSubCategory(cabinet.subCategory ?? "");
      setEditImageUrl(cabinet.catalogImageUrl ?? "");
      setEditShowInCatalog(cabinet.showInCatalog ?? true);
      setEditShowInDesigner(cabinet.showInDesigner ?? true);
      setEditShowIn2020(cabinet.showIn2020 ?? true);
    }
  }, [editOpen, cabinet]);

  const utils = trpc.useUtils();
  const updateCabinet = trpc.cabinets.adminUpdateCabinet.useMutation({
    onSuccess: () => {
      toast.success("Cabinet updated");
      utils.cabinets.byCode.invalidate({ masterCode });
      setEditOpen(false);
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });
  const uploadImage = trpc.cabinets.adminUploadCatalogImage.useMutation({
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
  });

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const result = await uploadImage.mutateAsync({
        filename: file.name,
        dataBase64: dataUrl,
        contentType: file.type || "image/jpeg",
      });
      setEditImageUrl(result.url);
      toast.success("Image uploaded — click Save to apply");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setImageUploading(false);
    }
  }

  function handleSaveEdit() {
    if (!cabinet?.id) return;
    updateCabinet.mutate({
      id: cabinet.id,
      description: editDescription.trim() || undefined,
      category: editCategory.trim() || undefined,
      subCategory: editSubCategory.trim() || null,
      catalogImageUrl: editImageUrl.trim() || null,
      showInCatalog: editShowInCatalog,
      showInDesigner: editShowInDesigner,
      showIn2020: editShowIn2020,
    });
  }

  // Add a specific style row to the cart (used directly and after an auto-switch).
  const addRow = (row: StyleRow) => {
    const unitPrice = priceNumberForTier(row, tier);
    const res = addItem({
      masterCode,
      name: cabinet?.description ?? row.name,
      styleId: row.styleId,
      styleLabel: row.name,
      distributorId: row.distributorId ?? null,
      tier,
      unitPrice: unitPrice != null && !isNaN(unitPrice) ? unitPrice : null,
      qty,
    });
    if (res.ok) {
      toast.success(`Added ${qty}\u00d7 ${masterCode} to cart`, {
        description: `${row.name} \u00b7 ${tierLabel(tier)} pricing`,
      });
    }
    return res;
  };

  const handleAddToCart = () => {
    if (!selectedRow) return;
    const res = addRow(selectedRow);
    if (res.ok) return;

    // Distributor-locked: the cart already holds items from a DIFFERENT supply
    // line. Colors/styles mix freely WITHIN a distributor, but cross-distributor
    // mixing breaks pricing/freight, so we cannot combine them. Recover
    // gracefully:
    //   1) If this cabinet is also offered by the locked distributor, offer to
    //      switch the selection to a row from that distributor and add it.
    //   2) Otherwise offer to clear the cart and start fresh with this item.
    const sameDistRow =
      styleRows.find((s) => (s.distributorId ?? null) === res.lockedDistributorId) ?? null;
    if (sameDistRow) {
      toast.warning(`Your cart is from another supplier`, {
        description: `Orders ship from one supplier. Add this cabinet in ${sameDistRow.name} (same supplier) instead?`,
        action: {
          label: `Add in ${sameDistRow.name}`,
          onClick: () => {
            setSelectedStyleId(sameDistRow.styleId);
            addRow(sameDistRow);
          },
        },
      });
    } else {
      toast.warning(`Your cart is from another supplier`, {
        description: `${masterCode} (${selectedRow.name}) is from a different supplier than what's in your cart. Clear the cart to start a new order with it?`,
        action: {
          label: "Clear cart & add",
          onClick: () => {
            clear();
            // Cart is async-cleared via state; add on next tick.
            setTimeout(() => addRow(selectedRow), 0);
          },
        },
      });
    }
  };

  if (cabinetLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-4 w-32 mb-6" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="h-64 rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!cabinet) {
    return (
      <div className="container py-16 text-center">
        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <h2 className="font-serif text-2xl font-bold mb-2">Cabinet Not Found</h2>
        <p className="text-muted-foreground mb-4">No cabinet with code "{masterCode}" exists.</p>
        <Link href="/catalog">
          <Button variant="outline">Back to Catalog</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/catalog" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          Catalog
        </Link>
        {cabinet.category && (
          <>
            <span>/</span>
            <Link href={`/catalog?category=${cabinet.category}`} className="hover:text-foreground">
              {cabinet.category}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground font-medium">{masterCode}</span>
      </nav>

      {/* Kitchen-scene lead-in: sell the finished kitchen first.
          STRICT one-family-one-color: use THIS style's own verified room scene
          when present; otherwise render a clean color-accurate band in the
          style's exact finish (NEVER a keyword-guessed stock kitchen that could
          show, e.g., a cherry room for a white finish). */}
      {(() => {
        const realScene = realImageUrl(selectedRow?.roomSceneImageUrl);
        const styleLabel = selectedRow?.name || selectedRow?.doorStyle || "your finish";
        return (
          <div className="relative overflow-hidden rounded-2xl border border-border mb-8">
            {realScene ? (
              <img
                src={realScene}
                alt={`${styleLabel} kitchen`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: finishFace }}
                aria-hidden
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy)]/90 via-[var(--color-navy)]/65 to-transparent" />
            <div className="relative px-6 py-7 md:px-10 md:py-9 max-w-2xl">
              <p className="text-[var(--color-gold,#c9a14a)] text-xs font-semibold uppercase tracking-wider mb-1">
                Build this look
              </p>
              <h2 className="font-serif text-xl md:text-2xl font-bold text-white">
                Design your kitchen in {styleLabel}
              </h2>
              <p className="text-white/85 text-sm mt-2">
                Shop this cabinet and the full matching line — base, wall, tall, vanity and trim — all in this one finish, with member trade pricing built in.
              </p>
            </div>
          </div>
        );
      })()}

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Image + specs */}
        <div>
          {/* Product image: an accurate, to-scale drawing of THIS exact item,
              recolored to the selected door-style finish. The drawing is driven
              by the cabinet's real type + dimensions + door/drawer counts, so it
              always matches the actual item (no generic/wrong renders). */}
          <div className="mb-2">
            <div className="rounded-xl border border-border bg-gradient-to-b from-white to-muted/30 h-64 flex items-center justify-center overflow-hidden p-4">
              <CabinetImage
                cabinet={cabinet}
                finishColor={finishFace}
                className="h-full w-auto max-w-full"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              {cabinet.catalogImageUrl
                ? "Catalog illustration — front elevation"
                : `Drawn to scale${selectedRow ? ` in ${selectedRow.name}` : ""} — front elevation`}
            </p>
          </div>
          {selectedRow ? (
            <div className="flex items-center gap-3 mb-6 rounded-lg border border-border p-2.5">
              {doorFamilyPhoto(selectedRow) ? (
                <div className="h-12 w-10 rounded bg-muted/40 shrink-0 overflow-hidden">
                  <img
                    src={doorFamilyPhoto(selectedRow)!}
                    alt={`${selectedRow.doorStyle || "Door"} panel profile`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="h-12 w-12 rounded bg-muted/40 shrink-0 flex items-center justify-center p-1 overflow-hidden">
                <DoorStyleSwatch style={selectedRow} className="h-full w-auto" />
              </div>
              <div className="text-xs text-muted-foreground leading-tight">
                <div className="font-medium text-foreground">{selectedRow.name}</div>
                <div>{selectedRow.doorStyle ? `${selectedRow.doorStyle} profile · true color` : "Selected door style"} · drawing to scale</div>
              </div>
            </div>
          ) : (
            <div className="mb-6" />
          )}

          {/* Blind corner details */}
          {(cabinet.openingWidth || cabinet.minPull || cabinet.maxPull) && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-5 mb-6">
              <h3 className="font-semibold text-sm text-foreground mb-1 flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-600" />
                Blind Corner Details
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                A blind corner cabinet hides part of its run behind the adjacent cabinets. Pull it away from the
                corner within the range below so the neighboring run&apos;s doors and drawers clear, then add a corner filler.
              </p>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {[
                  { label: "Opening Width", value: cabinet.openingWidth ? `${parseFloat(cabinet.openingWidth)}\"` : null },
                  { label: "Min Pull", value: cabinet.minPull ? `${parseFloat(cabinet.minPull)}\"` : null },
                  { label: "Max Pull", value: cabinet.maxPull ? `${parseFloat(cabinet.maxPull)}\"` : null },
                ]
                  .filter((item) => item.value)
                  .map((item) => (
                    <div key={item.label}>
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="font-semibold text-foreground">{item.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}

          {/* Specs */}
          <div className="rounded-xl border border-border p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Specifications
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                { label: "Type", value: cabinetTypeLabel(cabinet) },
                { label: "Width", value: cabinet.width ? `${cabinet.width}"` : null },
                { label: "Height", value: cabinet.height ? `${cabinet.height}"` : null },
                { label: "Depth", value: cabinet.depth ? `${cabinet.depth}"` : null },
                { label: "Doors", value: resolveDoorDrawerCounts(cabinet).doors ? String(resolveDoorDrawerCounts(cabinet).doors) : null },
                { label: "Drawers", value: resolveDoorDrawerCounts(cabinet).drawers ? String(resolveDoorDrawerCounts(cabinet).drawers) : null },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label}>
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium text-foreground">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>

        {/* Right: Pricing selector */}
        <div>
          <div className="mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {masterCode}
            </span>
            <Badge variant="secondary" className="ml-2 text-xs">{cabinetTypeLabel(cabinet)}</Badge>
          </div>
          <div className="flex items-start justify-between gap-2 mt-2 mb-1">
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
              {translateSpec(cabinet.description, lang)}
            </h1>
            {isOwner && (
              <button
                onClick={() => setEditOpen(true)}
                title="Edit cabinet (admin)"
                className="shrink-0 mt-1 p-1.5 rounded-lg border border-amber-400/60 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500/40 dark:hover:bg-amber-900/40"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Door style selector (price follows the chosen style) */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Select Door Style</span>
            </div>
            {pricingLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}
              </div>
            ) : styleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No door styles available for this item yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                {styleRows.map((s) => (
                  <button
                    key={s.styleId}
                    onClick={() => setSelectedStyleId(s.styleId)}
                    title={`${s.name}${s.doorStyle ? ` · ${s.doorStyle}` : ""}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                      activeStyle === s.styleId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground/70 hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <DoorStyleSwatch style={s} className="h-4 w-4 rounded shrink-0" />
                    {s.name}
                    {activeStyle === s.styleId && <Check className="h-3 w-3 ml-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pricing tier tabs + price display */}
          {selectedRow && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {isPro ? "Your Pricing" : "Price"}
                </span>
              </div>

              {isPro ? (
                <Tabs value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
                  <TabsList className="w-full">
                    {visibleTiers.map((t) => (
                      <TabsTrigger key={t} value={t} className="flex-1 text-xs">
                        {tierLabel(t)}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {visibleTiers.map((t) => (
                    <TabsContent key={t} value={t} className="mt-3">
                      <PriceCard row={selectedRow} tier={t} isOwner={isOwner} />
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <PriceCard row={selectedRow} tier="homeowner" isOwner={isOwner} />
              )}

              {/* Qty + Add to Cart */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-sm font-medium border-x border-border min-w-[3rem] text-center">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(qty + 1)}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    +
                  </button>
                </div>

                <Button
                  className="flex-1 gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </Button>
              </div>

              {/* Supplier-lock hint: colors & door styles mix freely within one
                  supplier (two-tone is welcome). We only warn when the selected
                  row is from a DIFFERENT supplier than the cart. */}
              {lockedDistributorId != null &&
                selectedRow &&
                (selectedRow.distributorId ?? null) !== lockedDistributorId && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                    <Lock className="h-3 w-3 shrink-0" />
                    Your cart is from another supplier. Adding this will offer to switch to
                    the same supplier or start a new cart. (You can freely mix colors within
                    one supplier.)
                  </p>
                )}
            </div>
          )}

          {/* No pricing available */}
          {!pricingLoading && styleRows.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pricing available for this item.</p>
            </div>
          )}
        </div>
      </div>

      {/* Admin inline edit dialog — only rendered for admins */}
      {isOwner && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-600" />
                Edit Cabinet
                <span className="font-mono text-xs font-normal text-muted-foreground ml-1">{masterCode}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Base Cabinet 12W x 34.5H x 24D"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-cat">Category</Label>
                <Input
                  id="edit-cat"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Base Cabinets"
                />
              </div>

              {/* Sub-category */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-sub">
                  Sub-Category{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-sub"
                  value={editSubCategory}
                  onChange={(e) => setEditSubCategory(e.target.value)}
                  placeholder="e.g. Drawer Base, Angle Base, Sink Base"
                />
              </div>

              {/* Visibility toggles */}
              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {/* Public Catalog */}
                  <label className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="text-sm font-medium">Public Catalog</p>
                      <p className="text-xs text-muted-foreground">Visible on the storefront catalog &amp; search</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={editShowInCatalog}
                      onChange={(e) => setEditShowInCatalog(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600"
                    />
                  </label>
                  {/* Kitchen Designer */}
                  <label className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="text-sm font-medium">Kitchen Designer</p>
                      <p className="text-xs text-muted-foreground">Appears in the drag-and-drop design tool palette</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={editShowInDesigner}
                      onChange={(e) => setEditShowInDesigner(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600"
                    />
                  </label>
                  {/* 2020 Export */}
                  <label className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="text-sm font-medium">2020 Export</p>
                      <p className="text-xs text-muted-foreground">Included when exporting catalog for 2020 Design software</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={editShowIn2020}
                      onChange={(e) => setEditShowIn2020(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600"
                    />
                  </label>
                </div>
              </div>

              {/* Catalog image */}
              <div className="space-y-1.5">
                <Label>Catalog Image</Label>
                {editImageUrl && (
                  <div className="relative w-24 h-24 rounded-lg border border-border overflow-hidden bg-muted/30 mb-2">
                    <img
                      src={editImageUrl}
                      alt="Catalog preview"
                      className="h-full w-full object-contain"
                    />
                    <button
                      onClick={() => setEditImageUrl("")}
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleImageFile}
                      disabled={imageUploading}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 pointer-events-none"
                      disabled={imageUploading}
                      asChild
                    >
                      <span>
                        {imageUploading ? (
                          <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {imageUploading ? "Uploading…" : "Upload image"}
                      </span>
                    </Button>
                  </label>
                  <span className="text-xs text-muted-foreground">or paste URL below</span>
                </div>
                <Input
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="/manus-storage/... or https://..."
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={updateCabinet.isPending || imageUploading}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {updateCabinet.isPending ? (
                  <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
