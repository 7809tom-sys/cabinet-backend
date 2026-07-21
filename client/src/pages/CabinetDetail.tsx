import { useState, useMemo, useEffect } from "react";
import { Link, useSearch } from "wouter";
import {
  ChevronLeft, Package, Palette, DollarSign,
  ShoppingCart, Info, Check, Lock,
  Pencil, X, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cabinetTypeLabel, resolveDoorDrawerCounts, cabinetDrawingType } from "@/lib/cabinetGraphics";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { doorFamilyPhoto, realImageUrl } from "@/lib/doorFamilyPhotos";
import { finishColors, finishColorsWithName } from "@/lib/design";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { buildProductJsonLd } from "@/lib/seo/jsonLd";
import { translateSpec } from "@/lib/i18n/specPhrases";

// ─── Cabinet category constants (must match CabinetConfigAdmin) ─────────────
const CABINET_CATEGORIES = [
  "Base", "Wall", "Tall", "Corner", "Drawer", "Specialty",
  "Vanity", "Pantry", "Island", "Filler", "Molding", "Accessory",
] as const;

const CABINET_SUB_CATEGORIES: Record<string, string[]> = {
  Base:      ["Standard Base","Sink Base","Blind Corner Base","Drawer Base","Lazy Susan","Appliance Garage","Pull-Out"],
  Wall:      ["Standard Wall","Blind Corner Wall","Corner Wall","Open Shelf","Microwave Wall","Glass Door"],
  Tall:      ["Pantry","Oven Tower","Utility","Linen"],
  Corner:    ["Lazy Susan","Blind Corner","Diagonal","Easy Reach"],
  Drawer:    ["Drawer Base","Peg Drawer","Utensil Drawer"],
  Specialty: ["Spice Pull-Out","Tray Divider","Waste Bin","Appliance Lift","Mixer Shelf"],
  Vanity:    ["Vanity Base","Vanity Drawer","Vanity Sink","Medicine Cabinet","Linen Tower"],
  Pantry:    ["Pantry Cabinet","Pantry Pull-Out"],
  Island:    ["Island Base","Island Drawer"],
  Filler:    ["Filler Panel","Side Panel","Scribe Moulding"],
  Molding:   ["Crown Moulding","Light Rail","Base Moulding","Valance"],
  Accessory: ["Hardware","Organizer","Shelf","Lazy Susan Insert","Drawer Insert"],
};

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
  // Owner-only true acquisition cost; only present when an admin is logged in.
  yourCost?: string | null;
  platformSku: string;
  leadTimeDays: number | null;
  distributorId: number | null;
  // Image assigned in the Product Images admin tab for this specific SKU/cabinet.
  skuImageUrl?: string | null;
  // Resolved shipping package dimensions (distributor override ?? master fallback)
  pkgLength?: string | null;
  pkgWidth?: string | null;
  pkgHeight?: string | null;
  pkgWeight?: string | null;
  // Line-specific image override (null = use master catalogImageUrl)
  distributorImageUrl?: string | null;
}

function priceNumberForTier(row: StyleRow, tier: PricingTier): number | null {
  return resolveTierPrice(tier, row);
}

function priceForTier(row: StyleRow, tier: PricingTier): string {
  const n = priceNumberForTier(row, tier);
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

// ─── Promo helpers ──────────────────────────────────────────────────────────
type ActivePromo = {
  id: number;
  distributorId: number;
  name: string;
  skuIds: unknown;
  styleId: number | null;
  category: string | null;
  discountType: "percent" | "fixed_price";
  discountValue: string;
};

function findMatchingPromo(
  promos: ActivePromo[],
  row: StyleRow,
  cabinetCategory?: string | null
): ActivePromo | null {
  if (!promos.length) return null;
  for (const p of promos) {
    if (row.distributorId != null && p.distributorId !== row.distributorId) continue;
    // Check targeting: skuIds, styleId, or category
    const matchesSku = p.skuIds && Array.isArray(p.skuIds) && (p.skuIds as number[]).includes(row.styleId);
    const matchesStyle = p.styleId != null && p.styleId === row.styleId;
    const matchesCategory = p.category != null && cabinetCategory != null && p.category === cabinetCategory;
    const isUntargeted = !p.skuIds && p.styleId == null && !p.category;
    if (matchesSku || matchesStyle || matchesCategory || isUntargeted) return p;
  }
  return null;
}

function applyPromoToPrice(promo: ActivePromo, originalPrice: number): number {
  const val = Number(promo.discountValue);
  if (promo.discountType === "percent") {
    return originalPrice * (1 - val / 100);
  }
  // fixed_price = the promo IS the new price
  return val;
}

// ─── Price card (tier price + homeowner "Compare at" strike-through) ─────────

function PriceCard({
  row,
  tier,
  isOwner = false,
  promo = null,
}: {
  row: StyleRow;
  tier: PricingTier;
  isOwner?: boolean;
  promo?: ActivePromo | null;
}) {
  let price = priceNumberForTier(row, tier);
  const compareAt = compareAtPrice(tier, row);
  const owner = isOwner ? ownerCostBreakdown(row, tier) : null;

  // Apply promo discount if active
  let promoActive = false;
  let originalPrice = price;
  if (promo && price != null) {
    originalPrice = price;
    price = applyPromoToPrice(promo, price);
    promoActive = true;
  }

  const savePct =
    promoActive && originalPrice != null && price != null && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : compareAt != null && price != null && compareAt > price
        ? Math.round(((compareAt - price) / compareAt) * 100)
        : null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {promoActive && (
            <div className="mb-1">
              <Badge className="bg-red-600 text-white hover:bg-red-600 text-[10px] uppercase tracking-wider">
                Sale — {promo!.name}
              </Badge>
            </div>
          )}
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-3xl font-bold text-foreground">
              {price == null ? "—" : `$${price.toFixed(2)}`}
            </div>
            {promoActive && originalPrice != null && (
              <div className="text-base text-muted-foreground line-through">
                ${originalPrice.toFixed(2)}
              </div>
            )}
            {!promoActive && compareAt != null && (
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

  // Fetch active promotions for storefront display
  const { data: activePromos } = trpc.promotions.activeForStorefront.useQuery();
  const activePromo = useMemo(() => {
    if (!selectedRow || !activePromos?.length) return null;
    return findMatchingPromo(activePromos as ActivePromo[], selectedRow, cabinet?.category);
  }, [selectedRow, activePromos, cabinet?.category]);

  // Recolor the to-scale drawing to the selected door style's real finish.
  const finishResult = finishColorsWithName(
    selectedRow?.name,
    selectedRow?.color,
    selectedRow?.finish,
    selectedRow?.styleCode
  );
  const finishFace = finishResult.face;
  const swColorName = finishResult.swName ?? null; // e.g. "Alabaster SW 7008"

  const { addItem, lockedDistributorId, lockedStyleLabel, clear } = useCart();

  // ── Pricing visibility gate ──────────────────────────────────────────────────
  const { data: siteSettingsData } = trpc.siteSettings.getPublicSettings.useQuery();
  const pricingVisibility = siteSettingsData?.pricingVisibility ?? "public";
  const canSeePricing = (() => {
    if (isOwner) return true; // admin always sees pricing
    if (pricingVisibility === "hidden") return false;
    if (pricingVisibility === "public") return true;
    if (pricingVisibility === "logged_in") return !!user;
    if (pricingVisibility === "dealer") {
      const tradeRoles = ["admin", "dealer", "distributor", "partner"];
      const tradeTiers = ["contractor", "wholesale"];
      return !!user && (tradeRoles.includes(user.role ?? "") || tradeTiers.includes(user.pricingTier ?? ""));
    }
    if (pricingVisibility === "admin") return false; // only admin (handled above)
    return true;
  })();

  // ── Admin inline edit ────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [overrideDistId, setOverrideDistId] = useState<number | null>(null);
  const [overrideFields, setOverrideFields] = useState<Record<string, string>>({});
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [editShowInCatalog, setEditShowInCatalog] = useState(true);
  const [editShowInDesigner, setEditShowInDesigner] = useState(true);
  const [editShowIn2020, setEditShowIn2020] = useState(true);
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editDepth, setEditDepth] = useState("__custom__");
  const [editPhysicalWidth, setEditPhysicalWidth] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editPkgLength, setEditPkgLength] = useState("");
  const [editPkgWidth, setEditPkgWidth] = useState("");
  const [editPkgHeight, setEditPkgHeight] = useState("");
  const [editPkgWeight, setEditPkgWeight] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  // Scoped image upload
  const [scopedImageOpen, setScopedImageOpen] = useState(false);
  const [scopedImageUploading, setScopedImageUploading] = useState(false);
  const [scopedImageScope, setScopedImageScope] = useState<"line" | "global">("line");
  const [editNumDoors, setEditNumDoors] = useState<string>("0");
  const [editNumDrawers, setEditNumDrawers] = useState<string>("0");
  const [editNumFixedShelves, setEditNumFixedShelves] = useState<string>("0");
  const [editNumAdjShelves, setEditNumAdjShelves] = useState<string>("0");

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
      setEditWidth(cabinet.width ?? "");
      setEditHeight(cabinet.height ?? "");
      setEditDepth(cabinet.depth ?? "__custom__");
      setEditPhysicalWidth(String((cabinet as Record<string, unknown>).physicalWidth ?? ""));
      setEditWeight(cabinet.weight ?? "");
      setEditPkgLength(String((cabinet as Record<string, unknown>).pkgLength ?? ""));
      setEditPkgWidth(String((cabinet as Record<string, unknown>).pkgWidth ?? ""));
      setEditPkgHeight(String((cabinet as Record<string, unknown>).pkgHeight ?? ""));
      setEditPkgWeight(String((cabinet as Record<string, unknown>).pkgWeight ?? ""));
      setEditIsActive(cabinet.isActive ?? true);
      const cab = cabinet as Record<string, unknown>;
      setEditNumDoors(String(cab.numberOfDoors ?? 0));
      setEditNumDrawers(String(cab.numberOfDrawers ?? 0));
      setEditNumFixedShelves(String(cab.numberOfFixedShelves ?? 0));
      setEditNumAdjShelves(String(cab.numberOfAdjShelves ?? 0));
    }
  }, [editOpen, cabinet]);

  // Distributor coverage + existing overrides for this cabinet (admin only)
  const { data: distCoverage } = trpc.genericCabinets.distributorCoverage.useQuery(
    { cabinetId: cabinet?.id ?? 0 },
    { enabled: !!cabinet?.id && isOwner }
  );
  const { data: existingOverrides, refetch: refetchOverrides } = trpc.cabinetOverrides.forCabinet.useQuery(
    { cabinetId: cabinet?.id ?? 0 },
    { enabled: !!cabinet?.id && isOwner }
  );
  const upsertOverride = trpc.cabinetOverrides.set.useMutation({
    onSuccess: () => {
      toast.success("Override saved");
      void refetchOverrides();
      setOverrideDistId(null);
      setOverrideFields({});
    },
    onError: (err: { message: string }) => toast.error(`Override failed: ${err.message}`),
  });
  const deleteOverride = trpc.cabinetOverrides.delete.useMutation({
    onSuccess: () => {
      toast.success("Override removed");
      void refetchOverrides();
    },
    onError: (err: { message: string }) => toast.error(`Delete failed: ${err.message}`),
  });

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
  const setLineImage = trpc.cabinetOverrides.setImage.useMutation({
    onSuccess: (res) => {
      toast.success(res.scope === "global" ? "Image updated for all lines" : "Image updated for this line only");
      utils.cabinets.byCode.invalidate({ masterCode });
      utils.pricing.stylesForCabinet.invalidate();
      setScopedImageOpen(false);
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });
  async function handleScopedImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !cabinet?.id) return;
    setScopedImageUploading(true);
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
        slot: "thumbnail",
      });
      // Now save at the chosen scope
      const distId = selectedRow?.distributorId ?? 0;
      await setLineImage.mutateAsync({
        cabinetId: cabinet.id,
        distributorId: distId,
        imageUrl: result.url,
        scope: scopedImageScope,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setScopedImageUploading(false);
    }
  }

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
      width: editWidth.trim() || null,
      height: editHeight.trim() || null,
      depth: (editDepth === "__custom__" || !editDepth.trim()) ? null : editDepth.trim(),
      physicalWidth: editPhysicalWidth.trim() || null,
      weight: editWeight.trim() || null,
      pkgLength: editPkgLength.trim() || null,
      pkgWidth: editPkgWidth.trim() || null,
      pkgHeight: editPkgHeight.trim() || null,
      pkgWeight: editPkgWeight.trim() || null,
      numberOfDoors: parseInt(editNumDoors) || 0,
      numberOfDrawers: parseInt(editNumDrawers) || 0,
      numberOfFixedShelves: parseInt(editNumFixedShelves) || 0,
      numberOfAdjShelves: parseInt(editNumAdjShelves) || 0,
      isActive: editIsActive,
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
      {/* Breadcrumb + floating style pill on the same row */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
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
        {/* Floating style selector pill — shows the active door style with a
            thumbnail swatch. Tapping it scrolls to the style picker in the
            pricing section so the user can switch styles without scrolling. */}
        {styleRows.length > 0 && (
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm hover:border-primary/50 hover:bg-muted/40 transition-colors group shrink-0"
            title="Change door style"
          >
            <div className="h-7 w-7 rounded-full overflow-hidden border border-border shrink-0">
              {selectedRow ? (
                <DoorStyleSwatch style={selectedRow} className="h-full w-full" />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
            </div>
            <span className="text-xs font-semibold text-foreground">
              {selectedRow?.name ?? (pricingLoading ? "Loading…" : "Select style")}
            </span>
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180 group-hover:text-primary transition-colors" />
          </a>
        )}
      </div>

      {/* ── Hero block: room-scene photo (primary) + door thumbnail strip (secondary) ──
          Layout:
          1. Full-width lifestyle room-scene photo — tall, immersive, promoted first.
             When no photo exists: SW-accurate color wash + door photo on the right.
          2. Compact door-photo thumbnail strip below the hero — real photo of the
             door panel (not a drawing), tappable to jump to the pricing/specs section. */}
      {(() => {
        const realScene = realImageUrl(selectedRow?.roomSceneImageUrl);
        const doorPhoto = doorFamilyPhoto(selectedRow ?? {});
        const styleLabel = selectedRow?.name || selectedRow?.doorStyle || "your finish";
        const hasScene = !!realScene;
        return (
          <>
            {/* ── 1. Hero image ────────────────────────────────────────── */}
            <div
              className="relative overflow-hidden rounded-2xl border border-border mb-4"
              style={{ minHeight: hasScene ? 360 : 200 }}
            >
              {/* Background: room scene photo OR finish color swatch */}
              {hasScene ? (
                <img
                  src={realScene!}
                  alt={`${styleLabel} kitchen`}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: "center 30%" }}
                />
              ) : (
                <>
                  {/* Solid SW-accurate color fills the left 60% */}
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: finishFace }}
                    aria-hidden
                  />
                  {/* Door photo floated to the right when available */}
                  {doorPhoto && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2/5 overflow-hidden"
                      style={{ maskImage: "linear-gradient(to right, transparent 0%, black 30%)" }}
                    >
                      <img
                        src={doorPhoto}
                        alt={`${styleLabel} door panel`}
                        className="h-full w-full object-cover"
                        style={{ objectPosition: "center" }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Gradient overlay — text legibility */}
              <div
                className="absolute inset-0"
                style={{
                  background: hasScene
                    ? "linear-gradient(to right, rgba(13,27,55,0.82) 0%, rgba(13,27,55,0.45) 55%, transparent 100%)"
                    : "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 60%, transparent 100%)",
                }}
              />

              {/* Text overlay */}
              <div className="relative px-6 py-8 md:px-10 md:py-12 max-w-2xl">
                <p className="text-[var(--color-gold,#c9a14a)] text-xs font-semibold uppercase tracking-wider mb-1">
                  Build this look
                </p>
                <h2 className="font-serif text-xl md:text-3xl font-bold text-white leading-tight">
                  Design your kitchen in {styleLabel}
                </h2>
                <p className="text-white/85 text-sm mt-2 max-w-lg">
                  Shop this cabinet and the full matching line — base, wall, tall, vanity and trim — all in this one finish, with member trade pricing built in.
                </p>
                {/* SW color attribution when no room scene */}
                {!hasScene && swColorName && (
                  <p className="text-white/60 text-xs mt-3">
                    Finish color: <span className="font-medium text-white/80">{swColorName}</span>
                  </p>
                )}
                {!hasScene && !swColorName && (
                  <p className="text-white/50 text-xs mt-3 italic">
                    Room scene photo coming soon for this finish.
                  </p>
                )}
              </div>
            </div>

            {/* ── 2. Door photo thumbnail strip ─────────────────────────── */}
            {doorPhoto && (
              <a
                href="#pricing"
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 mb-6 hover:border-primary/50 hover:bg-muted/40 transition-colors group"
                title="View pricing & specs"
              >
                {/* Real door photo */}
                <div className="h-16 w-14 rounded-lg overflow-hidden shrink-0 border border-border shadow-sm">
                  <img
                    src={doorPhoto}
                    alt={`${styleLabel} door`}
                    className="h-full w-full object-cover"
                  />
                </div>
                {/* Color swatch */}
                <div
                  className="h-16 w-6 rounded shrink-0 border border-border/60"
                  style={{ backgroundColor: finishFace }}
                  title={swColorName ?? styleLabel}
                />
                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{styleLabel}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {selectedRow?.doorStyle ? `${selectedRow.doorStyle} profile` : "Door style"}
                    {swColorName ? ` · ${swColorName}` : " · true color"}
                  </div>
                  <div className="text-xs text-primary/80 mt-1 group-hover:text-primary transition-colors">
                    Tap to view specs &amp; pricing →
                  </div>
                </div>
              </a>
            )}
          </>
        );
      })()}

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Image + specs */}
        <div>
          {/* Product image: an accurate, to-scale drawing of THIS exact item,
              recolored to the selected door-style finish. The drawing is driven
              by the cabinet's real type + dimensions + door/drawer counts, so it
              always matches the actual item (no generic/wrong renders).
              Once generic catalog images are uploaded via the Generic Catalog admin
              tab, catalogImageUrl will be populated and CabinetImage will show it. */}
          <div className="mb-2">
            <div className="rounded-xl border border-border bg-gradient-to-b from-white to-muted/30 h-64 flex items-center justify-center overflow-hidden p-4">
              <CabinetImage
                cabinet={cabinet}
                finishColor={finishFace}
                className="h-full w-auto max-w-full"
                overrideImageUrl={selectedRow?.distributorImageUrl ?? null}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              {(selectedRow?.distributorImageUrl || cabinet.catalogImageUrl)
                ? "Catalog illustration — front elevation"
                : `Drawn to scale${selectedRow ? ` in ${selectedRow.name}` : ""} — front elevation`}
            </p>
            {/* Admin: scoped image replace button */}
            {isOwner && (
              <div className="flex justify-center mt-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-6 px-2 gap-1"
                  onClick={() => setScopedImageOpen(true)}
                >
                  <Upload className="h-3 w-3" />
                  Replace image
                </Button>
              </div>
            )}
          </div>

          {/* Scoped image upload dialog */}
          {isOwner && (
            <Dialog open={scopedImageOpen} onOpenChange={setScopedImageOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Replace Cabinet Image</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Choose where to apply the new image:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setScopedImageScope("line")}
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${
                        scopedImageScope === "line"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="font-semibold text-sm mb-0.5">This line only</div>
                      <div className="text-xs text-muted-foreground">
                        {selectedRow ? `${selectedRow.name} (${selectedRow.distributorId ? "this distributor" : "no distributor"})` : "Current distributor line"}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScopedImageScope("global")}
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${
                        scopedImageScope === "global"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="font-semibold text-sm mb-0.5">All lines</div>
                      <div className="text-xs text-muted-foreground">Replaces the master image across every distributor</div>
                    </button>
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Upload new image</Label>
                    <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 cursor-pointer hover:border-primary/60 transition-colors ${
                      scopedImageUploading ? "opacity-50 pointer-events-none" : ""
                    }`}>
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {scopedImageUploading ? "Uploading…" : "Click to choose image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleScopedImageFile}
                        disabled={scopedImageUploading}
                      />
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setScopedImageOpen(false)} disabled={scopedImageUploading}>
                    Cancel
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {/* Door style swatch (compact, below drawing) */}
          {selectedRow && (
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded border border-border shrink-0 overflow-hidden">
                <DoorStyleSwatch style={selectedRow} className="h-full w-auto" />
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selectedRow.name}</span>
                {selectedRow.doorStyle ? ` · ${selectedRow.doorStyle}` : ""}
                {swColorName ? ` · ${swColorName}` : " · true color"}
              </div>
            </div>
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
              {(() => {
                const drawingType = cabinetDrawingType(cabinet as Parameters<typeof cabinetDrawingType>[0]);
                const isTrim = drawingType === "accessory-strip";
                const { doors, drawers } = resolveDoorDrawerCounts(cabinet);
                const rows: { label: string; value: string | null }[] = [
                  { label: "Type", value: cabinetTypeLabel(cabinet) },
                  { label: "Width", value: cabinet.width ? `${cabinet.width}"` : null },
                  { label: "Height", value: cabinet.height ? `${cabinet.height}"` : null },
                  { label: "Depth", value: cabinet.depth ? `${cabinet.depth}"` : null },
                ];
                if (!isTrim) {
                  if (doors) rows.push({ label: "Doors", value: String(doors) });
                  if (drawers) rows.push({ label: "Drawers", value: String(drawers) });
                  const fixedShelves = (cabinet as Record<string, unknown>).numberOfFixedShelves;
                  const adjShelves = (cabinet as Record<string, unknown>).numberOfAdjShelves;
                  if (fixedShelves != null && Number(fixedShelves) > 0)
                    rows.push({ label: "Fixed Shelves", value: String(fixedShelves) });
                  if (adjShelves != null && Number(adjShelves) > 0)
                    rows.push({ label: "Adj. Shelves", value: String(adjShelves) });
                }
                return rows
                  .filter((item) => item.value)
                  .map((item) => (
                    <div key={item.label}>
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="font-medium text-foreground">{item.value}</dd>
                    </div>
                  ));
              })()}
            </dl>
          </div>

          {/* Shipping info is internal/freight-only — not shown to members */}
        </div>

        {/* Right: Pricing selector */}
        <div id="pricing">
          <div className="mb-1">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {masterCode}
            </span>
            <Badge variant="secondary" className="ml-2 text-xs">{cabinetTypeLabel(cabinet)}</Badge>
            {isOwner && cabinet.isActive === false && (
              <Badge variant="destructive" className="ml-2 text-xs">Inactive</Badge>
            )}
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

          {/* Door style selector — hidden for non-cabinet items (trim, accessories, corbels) */}
          {!cabinet?.isNotCabinet && (
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
          )}

          {/* Pricing tier tabs + price display */}
          {selectedRow && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {isPro ? "Your Pricing" : "Price"}
                </span>
              </div>

              {canSeePricing ? (
                isPro ? (
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
                        <PriceCard row={selectedRow} tier={t} isOwner={isOwner} promo={activePromo} />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <PriceCard row={selectedRow} tier="homeowner" isOwner={isOwner} promo={activePromo} />
                )
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
                  {pricingVisibility === "hidden" ? (
                    <>
                      <p className="font-medium text-foreground">Request a Quote</p>
                      <p>Pricing is available upon request. Contact us for a custom quote on this item.</p>
                    </>
                  ) : pricingVisibility === "logged_in" ? (
                    <>
                      <p className="font-medium text-foreground">Sign in to view pricing</p>
                      <p>Create a free account or sign in to see pricing for this product.</p>
                    </>
                  ) : pricingVisibility === "dealer" ? (
                    <>
                      <p className="font-medium text-foreground">Trade pricing available</p>
                      <p>Pricing is available to approved dealers and trade professionals. Contact us to request trade access.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">Contact us for pricing</p>
                      <p>Please reach out to get pricing information for this product.</p>
                    </>
                  )}
                </div>
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
          <DialogContent className="max-w-lg flex flex-col max-h-[90dvh]">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-600" />
                Edit Cabinet
                <span className="font-mono text-xs font-normal text-muted-foreground ml-1">{masterCode}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cat">Category</Label>
                  <Select
                    value={editCategory || "__none__"}
                    onValueChange={(v) => {
                      const cat = v === "__none__" ? "" : v;
                      setEditCategory(cat);
                      setEditSubCategory(""); // reset sub-category when category changes
                    }}
                  >
                    <SelectTrigger id="edit-cat" className="w-full">
                      <SelectValue placeholder="— not set —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not set —</SelectItem>
                      {CABINET_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sub-category */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sub">
                    Sub-Category{" "}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </Label>
                  <Select
                    value={editSubCategory || "__none__"}
                    onValueChange={(v) => setEditSubCategory(v === "__none__" ? "" : v)}
                    disabled={!editCategory}
                  >
                    <SelectTrigger id="edit-sub" className="w-full">
                      <SelectValue placeholder="— not set —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not set —</SelectItem>
                      {(editCategory && CABINET_SUB_CATEGORIES[editCategory] ? CABINET_SUB_CATEGORIES[editCategory] : []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active / Inactive toggle */}
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">Inactive cabinets are hidden from the public catalog and designer</p>
                  </div>
                  <Switch
                    checked={editIsActive}
                    onCheckedChange={setEditIsActive}
                    aria-label="Active status"
                  />
                </div>
                {!editIsActive && (
                  <p className="mt-2 text-xs text-destructive font-medium">⚠ This cabinet will be hidden from all public views</p>
                )}
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

              {/* Dimensions & Weight */}
              <div className="space-y-2">
                <Label>Dimensions &amp; Weight</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-width" className="text-xs text-muted-foreground">Width (in)</Label>
                    <Input
                      id="edit-width"
                      value={editWidth}
                      onChange={(e) => setEditWidth(e.target.value)}
                      placeholder="e.g. 12"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-height" className="text-xs text-muted-foreground">Height (in)</Label>
                    <Input
                      id="edit-height"
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      placeholder="e.g. 34.5"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-depth" className="text-xs text-muted-foreground">Depth (in)</Label>
                    <Select value={editDepth} onValueChange={setEditDepth}>
                      <SelectTrigger id="edit-depth" className="h-8 text-sm"><SelectValue placeholder="Select depth" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__custom__">— custom —</SelectItem>
                        {["9","12","15","18","21","24","27","30","33","36"].map(d => (
                          <SelectItem key={d} value={d}>{d}"</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editDepth && !["9","12","15","18","21","24","27","30","33","36","","__custom__"].includes(editDepth) && (
                      <p className="text-[10px] text-amber-600">Custom: {editDepth}" — not a standard depth</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-physical-width" className="text-xs text-muted-foreground">Physical Width (in)</Label>
                    <Input
                      id="edit-physical-width"
                      value={editPhysicalWidth}
                      onChange={(e) => setEditPhysicalWidth(e.target.value)}
                      placeholder="e.g. 11.5"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-weight" className="text-xs text-muted-foreground">Weight (lbs)</Label>
                    <Input
                      id="edit-weight"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      placeholder="e.g. 45.5"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Enter numeric values in inches / pounds. Leave blank to keep current value.</p>
              </div>

              {/* Package Dimensions */}
              <div className="space-y-2">
                <Label>Package Dimensions</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-pkg-length" className="text-xs text-muted-foreground">Pkg Length (in)</Label>
                    <Input
                      id="edit-pkg-length"
                      value={editPkgLength}
                      onChange={(e) => setEditPkgLength(e.target.value)}
                      placeholder="e.g. 30"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-pkg-width" className="text-xs text-muted-foreground">Pkg Width (in)</Label>
                    <Input
                      id="edit-pkg-width"
                      value={editPkgWidth}
                      onChange={(e) => setEditPkgWidth(e.target.value)}
                      placeholder="e.g. 15"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-pkg-height" className="text-xs text-muted-foreground">Pkg Height (in)</Label>
                    <Input
                      id="edit-pkg-height"
                      value={editPkgHeight}
                      onChange={(e) => setEditPkgHeight(e.target.value)}
                      placeholder="e.g. 20"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-pkg-weight" className="text-xs text-muted-foreground">Pkg Weight (lbs)</Label>
                    <Input
                      id="edit-pkg-weight"
                      value={editPkgWeight}
                      onChange={(e) => setEditPkgWeight(e.target.value)}
                      placeholder="e.g. 50"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Shipping box dimensions. Leave blank to keep current value.</p>
              </div>

              {/* Doors / Drawers / Shelves */}
              <div className="space-y-2">
                <Label>Interior Configuration</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Doors</Label>
                    <Select value={editNumDoors} onValueChange={setEditNumDoors}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0,1,2].map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Drawers</Label>
                    <Select value={editNumDrawers} onValueChange={setEditNumDrawers}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0,1,2,3,4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fixed Shelves</Label>
                    <Select value={editNumFixedShelves} onValueChange={setEditNumFixedShelves}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0,1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Adjustable Shelves</Label>
                    <Select value={editNumAdjShelves} onValueChange={setEditNumAdjShelves}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0,1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Interior configuration for this cabinet. Used in specs and future catalog illustrations.</p>
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

            {/* ── Distributor-specific dimension overrides (admin only) ── */}
            {isOwner && cabinet?.id && (
              <div className="space-y-3 border-t border-dashed border-amber-500/40 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-amber-700 dark:text-amber-400">Distributor Dimension Overrides</Label>
                  <span className="text-[11px] text-muted-foreground">Per-supplier corrections (override master dims)</span>
                </div>
                {/* Existing overrides list */}
                {(existingOverrides ?? []).length > 0 && (
                  <div className="space-y-1.5">
                    {(existingOverrides ?? []).map((ov) => (
                      <div key={ov.id} className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{ov.distributorName || `Dist #${ov.distributorId}`}</span>
                          <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                            {ov.width && <span>W: {ov.width}&quot;</span>}
                            {ov.height && <span>H: {ov.height}&quot;</span>}
                            {ov.depth && <span>D: {ov.depth}&quot;</span>}
                            {ov.physicalWidth && <span>PhysW: {ov.physicalWidth}&quot;</span>}
                            {ov.weight && <span>Wt: {ov.weight} lbs</span>}
                            {ov.pkgLength && <span>PkgL: {ov.pkgLength}&quot;</span>}
                            {ov.pkgWidth && <span>PkgW: {ov.pkgWidth}&quot;</span>}
                            {ov.pkgHeight && <span>PkgH: {ov.pkgHeight}&quot;</span>}
                            {ov.pkgWeight && <span>PkgWt: {ov.pkgWeight} lbs</span>}
                            {ov.note && <span className="italic">{ov.note}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setOverrideDistId(ov.distributorId);
                              setOverrideFields({
                                width: ov.width ?? "",
                                height: ov.height ?? "",
                                depth: ov.depth ?? "",
                                physicalWidth: ov.physicalWidth ?? "",
                                weight: ov.weight ?? "",
                                pkgLength: ov.pkgLength ?? "",
                                pkgWidth: ov.pkgWidth ?? "",
                                pkgHeight: ov.pkgHeight ?? "",
                                pkgWeight: ov.pkgWeight ?? "",
                                note: ov.note ?? "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={deleteOverride.isPending}
                            onClick={() => deleteOverride.mutate({ distributorId: ov.distributorId, cabinetId: cabinet.id })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add / edit override form */}
                {overrideDistId !== null ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Override for: {(distCoverage ?? []).find((d) => d.distributorId === overrideDistId)?.name ?? `Dist #${overrideDistId}`}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["width","height","depth","physicalWidth","weight","pkgLength","pkgWidth","pkgHeight","pkgWeight"] as const).map((field) => (
                        <div key={field} className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                          <Input
                            value={overrideFields[field] ?? ""}
                            onChange={(e) => setOverrideFields((prev) => ({ ...prev, [field]: e.target.value }))}
                            placeholder="leave blank = use master"
                            className="h-7 text-xs"
                          />
                        </div>
                      ))}
                      <div className="col-span-2 space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Note</Label>
                        <Input
                          value={overrideFields.note ?? ""}
                          onChange={(e) => setOverrideFields((prev) => ({ ...prev, note: e.target.value }))}
                          placeholder="optional note"
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOverrideDistId(null); setOverrideFields({}); }}>Cancel</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={upsertOverride.isPending}
                        onClick={() => {
                          if (!cabinet?.id) return;
                          const toVal = (v: string) => v.trim() || null;
                          upsertOverride.mutate({
                            distributorId: overrideDistId,
                            cabinetId: cabinet.id,
                            width: toVal(overrideFields.width ?? ""),
                            height: toVal(overrideFields.height ?? ""),
                            depth: toVal(overrideFields.depth ?? ""),
                            physicalWidth: toVal(overrideFields.physicalWidth ?? ""),
                            weight: toVal(overrideFields.weight ?? ""),
                            pkgLength: toVal(overrideFields.pkgLength ?? ""),
                            pkgWidth: toVal(overrideFields.pkgWidth ?? ""),
                            pkgHeight: toVal(overrideFields.pkgHeight ?? ""),
                            pkgWeight: toVal(overrideFields.pkgWeight ?? ""),
                            note: toVal(overrideFields.note ?? ""),
                          });
                        }}
                      >
                        {upsertOverride.isPending ? "Saving…" : "Save Override"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(distCoverage ?? []).map((d) => (
                      <Button
                        key={d.distributorId}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const existing = (existingOverrides ?? []).find((ov) => ov.distributorId === d.distributorId);
                          setOverrideDistId(d.distributorId);
                          setOverrideFields(existing ? {
                            width: existing.width ?? "",
                            height: existing.height ?? "",
                            depth: existing.depth ?? "",
                            physicalWidth: existing.physicalWidth ?? "",
                            weight: existing.weight ?? "",
                            pkgLength: existing.pkgLength ?? "",
                            pkgWidth: existing.pkgWidth ?? "",
                            pkgHeight: existing.pkgHeight ?? "",
                            pkgWeight: existing.pkgWeight ?? "",
                            note: existing.note ?? "",
                          } : {});
                        }}
                      >
                        + {d.name}
                      </Button>
                    ))}
                    {(distCoverage ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No distributors carry this cabinet yet.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 shrink-0 border-t border-border pt-4">
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
