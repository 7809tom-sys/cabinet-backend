import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Star, StarOff, Upload, X, Pencil, Check, Store } from "lucide-react";

type StyleRow = {
  id: number;
  distributorId: number;
  ourName: string | null;
  styleCode: string | null;
  doorStyle: string | null;
  color: string | null;
  thumbnailImageUrl: string | null;
    override: {
      brandName: string | null;
      markupBps: number | null;
      featured: boolean;
      isEnabled: boolean;
      sortOrder: number;
      roomSceneUrl: string | null;
  } | null;
};

type DistributorSelectionRow = {
  id: number;
  name: string;
  displayMode: "neutral" | "branded" | "series";
  seriesName: string | null;
  selected: boolean;
  featured: boolean;
  sortOrder: number;
};

function bpsToPercent(bps: number | null | undefined) {
  if (bps == null) return "";
  return (bps / 100).toFixed(2);
}

function DistributorCurationPanel({
  distributors,
  affiliateId,
  isAdminView,
}: {
  distributors: DistributorSelectionRow[];
  affiliateId?: number;
  isAdminView: boolean;
}) {
  const utils = trpc.useUtils();
  const refresh = () => {
    if (isAdminView && affiliateId !== undefined) {
      void utils.affiliates.adminBranding.invalidate({ affiliateId });
    } else {
      void utils.affiliates.myBranding.invalidate();
    }
  };
  const ownSave = trpc.affiliates.updateMyStorefrontDistributors.useMutation({
    onSuccess: () => { refresh(); toast.success("Storefront cabinet lines updated"); },
    onError: (error) => toast.error(error.message),
  });
  const adminSave = trpc.affiliates.adminUpdateStorefrontDistributors.useMutation({
    onSuccess: () => { refresh(); toast.success("Selected affiliate storefront lines updated"); },
    onError: (error) => toast.error(error.message),
  });
  const selected = distributors.filter((distributor) => distributor.selected);
  const isSaving = ownSave.isPending || adminSave.isPending;

  const save = (next: DistributorSelectionRow[]) => {
    const selections = next.filter((distributor) => distributor.selected).map((distributor) => ({
      distributorId: distributor.id,
      featured: distributor.featured,
    }));
    if (isAdminView) {
      if (affiliateId === undefined) {
        toast.error("Select an affiliate before changing storefront cabinet lines.");
        return;
      }
      adminSave.mutate({ affiliateId, selections });
      return;
    }
    ownSave.mutate({ selections });
  };

  const toggleSelected = (id: number) => save(distributors.map((distributor) =>
    distributor.id === id
      ? { ...distributor, selected: !distributor.selected, featured: !distributor.selected ? false : distributor.featured }
      : distributor,
  ));
  const toggleFeatured = (id: number) => save(distributors.map((distributor) =>
    distributor.id === id ? { ...distributor, featured: !distributor.featured } : distributor,
  ));

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> Cabinet lines on my storefront</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the cabinet distributors you want customers to see. Star a selected distributor to place its cabinet lines first.
          </p>
        </div>
        <Badge variant={selected.length ? "default" : "secondary"}>
          {selected.length ? `${selected.length} selected` : "All active lines"}
        </Badge>
      </div>
      {selected.length === 0 && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          No curated supplier list is saved yet, so the storefront continues to show every active cabinet line. Select one or more below to curate it.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {distributors.map((distributor) => {
          const displayName = distributor.displayMode === "series" && distributor.seriesName?.trim()
            ? distributor.seriesName
            : distributor.name;
          return (
            <div key={distributor.id} className={`flex items-center gap-2 rounded-lg border p-3 ${distributor.selected ? "border-primary bg-primary/5" : "border-border"}`}>
              <Button
                type="button"
                variant={distributor.selected ? "default" : "outline"}
                size="sm"
                className="min-h-9 shrink-0"
                disabled={isSaving}
                aria-pressed={distributor.selected}
                onClick={() => toggleSelected(distributor.id)}
              >
                {distributor.selected ? "Included" : "Include"}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={displayName}>{displayName}</span>
              {distributor.selected && (
                <button
                  type="button"
                  className={`rounded p-1.5 ${distributor.featured ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label={distributor.featured ? `Remove ${displayName} from featured lines` : `Feature ${displayName} on storefront`}
                  title={distributor.featured ? "Featured first" : "Feature this distributor"}
                  disabled={isSaving}
                  onClick={() => toggleFeatured(distributor.id)}
                >
                  {distributor.featured ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selected.length > 0 && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={isSaving} onClick={() => save(distributors.map((distributor) => ({ ...distributor, selected: false, featured: false })))}>
          Show all active cabinet lines again
        </Button>
      )}
    </section>
  );
}

function percentToBps(pct: string): number | null {
  const n = parseFloat(pct);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** A blank style override inherits the affiliate/category setting; a sale can never be below cost. */
function styleMarkupInputError(pct: string): string | null {
  const normalized = pct.trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return "Enter a valid markup percentage.";
  if (value < 0) return "Minimum is 0% — a customer sale price cannot be below the protected cost floor.";
  return null;
}

function StyleCard({
  style,
  affiliateDefaultBps,
  affiliateId,
  isAdminView,
}: {
  style: StyleRow;
  affiliateDefaultBps: number;
  affiliateId?: number;
  isAdminView: boolean;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [brandName, setBrandName] = useState(style.override?.brandName ?? "");
  const [markupPct, setMarkupPct] = useState(bpsToPercent(style.override?.markupBps));
  const fileRef = useRef<HTMLInputElement>(null);

  const upsert = trpc.affiliates.upsertStyleBranding.useMutation({
    onSuccess: () => {
      utils.affiliates.myBranding.invalidate();
      setEditing(false);
      toast.success("Style updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const adminUpsert = trpc.affiliates.adminUpsertStyleBranding.useMutation({
    onSuccess: () => {
      if (affiliateId !== undefined) void utils.affiliates.adminBranding.invalidate({ affiliateId });
      setEditing(false);
      toast.success("Selected affiliate style updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadScene = trpc.affiliates.uploadStyleRoomScene.useMutation({
    onSuccess: () => {
      utils.affiliates.myBranding.invalidate();
      toast.success("Room scene uploaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const featured = style.override?.featured ?? false;
  const isEnabled = style.override?.isEnabled ?? true;
  const displayName = style.override?.brandName || style.ourName || style.styleCode || "Unnamed Style";
  const effectiveBps = style.override?.markupBps ?? affiliateDefaultBps;

  function toggleFeatured() {
    upsert.mutate({ styleId: style.id, featured: !featured });
  }

  function toggleEnabled() {
    upsert.mutate({ styleId: style.id, isEnabled: !isEnabled });
  }

  function saveEdit() {
    const markupError = styleMarkupInputError(markupPct);
    if (markupError) {
      toast.error(markupError);
      return;
    }
    const bps = markupPct === "" ? null : percentToBps(markupPct);
    if (isAdminView) {
      if (affiliateId === undefined) {
        toast.error("Select an affiliate before saving a style markup.");
        return;
      }
      adminUpsert.mutate({ affiliateId, styleId: style.id, brandName: brandName || null, markupBps: bps });
      return;
    }
    upsert.mutate({
      styleId: style.id,
      brandName: brandName || null,
      markupBps: bps,
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Image must be under 8 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadScene.mutate({ styleId: style.id, fileBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const roomScene = style.override?.roomSceneUrl;
  // Card thumbnail: custom affiliate room scene → global room scene → thumbnail
  const cardImg = roomScene || (style as StyleRow & { roomSceneImageUrl?: string | null }).roomSceneImageUrl || style.thumbnailImageUrl;

  return (
    <div className={`rounded-lg border transition-colors ${!isEnabled ? "opacity-60 bg-muted/40 border-dashed" : featured ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      {/* Thumbnail row */}
      <div className="flex gap-3 p-3">
        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0">
          {cardImg ? (
            <img src={cardImg} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No img</div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm truncate">{displayName}</p>
              {style.override?.brandName && (
                <p className="text-xs text-muted-foreground truncate">Original: {style.ourName || style.styleCode}</p>
              )}
            </div>
            {!isAdminView && (
              <button
                onClick={toggleFeatured}
                className={`shrink-0 p-1 rounded transition-colors ${featured ? "text-primary hover:text-primary/70" : "text-muted-foreground hover:text-foreground"}`}
                title={featured ? "Remove from featured" : "Feature this style"}
              >
                {featured ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {featured && <Badge className="text-xs bg-primary/10 text-primary border-primary/30">Featured</Badge>}
            {!isEnabled && <Badge variant="destructive" className="text-xs">Hidden / Disabled</Badge>}
            <Badge variant="outline" className="text-xs">
              {style.override?.markupBps != null ? `${bpsToPercent(style.override.markupBps)}% markup` : `${bpsToPercent(affiliateDefaultBps)}% (default)`}
            </Badge>
            {style.color && <Badge variant="secondary" className="text-xs">{style.color}</Badge>}
          </div>
        </div>
      </div>

      {/* These actions have a separate admin workflow; do not let a view-as
          session accidentally use owner-scoped mutations. */}
      {!isAdminView && (
        <div className="border-t border-border px-3 py-2 flex items-center justify-between bg-muted/20">
          <span className="text-xs font-medium text-foreground">
            {isEnabled ? "Line Active on Storefront" : "Line Hidden from Storefront"}
          </span>
          <Button
            variant={isEnabled ? "outline" : "default"}
            size="sm"
            className="h-7 text-xs"
            onClick={toggleEnabled}
          >
            {isEnabled ? "Turn Off Line" : "Turn On Line"}
          </Button>
        </div>
      )}

      {!isAdminView && (
        <div className="border-t border-border px-3 py-2 flex items-center gap-3">
          {roomScene ? (
            <>
              <img src={roomScene} alt="Room scene" className="w-12 h-8 rounded object-cover border border-border" />
              <span className="text-xs text-muted-foreground flex-1">Custom room scene uploaded</span>
              <button
                onClick={() => upsert.mutate({ styleId: style.id })}
                className="text-xs text-destructive hover:underline"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground flex-1">No custom room scene</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Button
            variant="outline" size="sm" className="gap-1 text-xs h-7"
            onClick={() => fileRef.current?.click()}
            disabled={uploadScene.isPending}
          >
            {uploadScene.isPending ? <Spinner className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
            {roomScene ? "Replace" : "Upload Photo"}
          </Button>
        </div>
      )}

      {/* Edit row */}
      {editing ? (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">White-label name (shown to customers)</Label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={style.ourName || style.styleCode || ""}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Markup % override (blank = use default)</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number" min="0" step="0.5"
                  value={markupPct}
                  onChange={(e) => setMarkupPct(e.target.value)}
                  placeholder={bpsToPercent(affiliateDefaultBps) || "0"}
                  aria-invalid={Boolean(styleMarkupInputError(markupPct))}
                  className={styleMarkupInputError(markupPct) ? "h-8 text-sm border-destructive focus-visible:ring-destructive" : "h-8 text-sm"}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              {styleMarkupInputError(markupPct) && (
                <p className="text-xs text-destructive">{styleMarkupInputError(markupPct)}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 h-7" onClick={saveEdit} disabled={upsert.isPending || adminUpsert.isPending}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" /> Edit name &amp; markup
          </button>
        </div>
      )}
    </div>
  );
}

type AffiliateCatalogPanelProps = {
  affiliateId?: number;
  isAdminView?: boolean;
};

export default function AffiliateCatalogPanel({ affiliateId, isAdminView = false }: AffiliateCatalogPanelProps) {
  const ownBranding = trpc.affiliates.myBranding.useQuery(undefined, { enabled: !isAdminView });
  const adminBranding = trpc.affiliates.adminBranding.useQuery(
    { affiliateId: affiliateId ?? 0 },
    { enabled: isAdminView && affiliateId !== undefined, retry: false },
  );
  const data = isAdminView ? adminBranding.data : ownBranding.data;
  const isLoading = isAdminView ? adminBranding.isLoading : ownBranding.isLoading;
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-primary" /></div>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground py-6">Could not load catalog data.</p>;
  }

  const filtered = data.styles.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.ourName?.toLowerCase().includes(q) ||
      s.styleCode?.toLowerCase().includes(q) ||
      s.override?.brandName?.toLowerCase().includes(q) ||
      s.color?.toLowerCase().includes(q)
    );
  });

  // Sort: featured first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const af = a.override?.featured ? 0 : 1;
    const bf = b.override?.featured ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.override?.sortOrder ?? 0) - (b.override?.sortOrder ?? 0) ||
      (a.ourName || "").localeCompare(b.ourName || "");
  });

  const featuredCount = data.styles.filter((s) => s.override?.featured).length;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold">My Catalog</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the distributors and cabinet lines for your storefront, feature what customers see first, rename lines for your brand, set per-style markups, and upload your own room scene photos.
        </p>
      </div>

      <DistributorCurationPanel
        distributors={data.distributorSelections as DistributorSelectionRow[]}
        affiliateId={affiliateId}
        isAdminView={isAdminView}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search styles…"
          className="max-w-xs"
        />
        <Badge variant="secondary">{featuredCount} featured</Badge>
        <Badge variant="outline">{data.styles.length} total styles</Badge>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">No styles match your search.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((s) => (
            <StyleCard
              key={s.id}
              style={s as StyleRow}
              affiliateDefaultBps={data.defaultMarkupBps}
              affiliateId={affiliateId}
              isAdminView={isAdminView}
            />
          ))}
        </div>
      )}
    </div>
  );
}
