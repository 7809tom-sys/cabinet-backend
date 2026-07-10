import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Star, StarOff, Upload, Eye, EyeOff, Pencil, Check, ImageIcon, Maximize2 } from "lucide-react";

type StyleRow = {
  id: number;
  ourName: string | null;
  styleCode: string | null;
  doorStyle: string | null;
  color: string | null;
  thumbnailImageUrl: string | null;
  roomSceneImageUrl?: string | null;
  doorSampleImageUrl?: string | null;
  override: {
    brandName: string | null;
    markupBps: number | null;
    featured: boolean;
    sortOrder: number;
    roomSceneUrl: string | null;
    hidden: boolean;
  } | null;
};

function bpsToPercent(bps: number | null | undefined) {
  if (bps == null) return "";
  return (bps / 100).toFixed(2);
}
function percentToBps(pct: string): number | null {
  const n = parseFloat(pct);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function StyleCard({ style, affiliateDefaultBps }: { style: StyleRow; affiliateDefaultBps: number }) {
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

  const toggleHidden = trpc.affiliates.toggleStyleHidden.useMutation({
    onSuccess: (res) => {
      utils.affiliates.myBranding.invalidate();
      toast.success(res.hidden ? "Style hidden from storefront" : "Style visible on storefront");
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
  const hidden = style.override?.hidden ?? false;
  const displayName = style.override?.brandName || style.ourName || style.styleCode || "Unnamed Style";
  const effectiveBps = style.override?.markupBps ?? affiliateDefaultBps;

  function toggleFeatured() {
    upsert.mutate({ styleId: style.id, featured: !featured });
  }

  function saveEdit() {
    const bps = markupPct === "" ? null : percentToBps(markupPct);
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

  const roomScene = style.override?.roomSceneUrl || style.roomSceneImageUrl || null;
  const doorSample = style.doorSampleImageUrl || style.thumbnailImageUrl || null;
  const [showDoor, setShowDoor] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [doorFailed, setDoorFailed] = useState(false);
  const heroSrc = showDoor
    ? (doorSample && !doorFailed ? doorSample : null)
    : (roomScene && !sceneFailed ? roomScene : null);

  return (
    <div className={`rounded-lg border transition-colors overflow-hidden ${
      hidden ? "border-border bg-muted/40 opacity-60" :
      featured ? "border-primary bg-primary/5" : "border-border bg-card"
    }`}>
      {/* Room scene hero — primary image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {heroSrc ? (
          <img
            src={heroSrc}
            alt={showDoor ? `${displayName} door` : `${displayName} kitchen`}
            className="w-full h-full object-cover"
            onError={() => showDoor ? setDoorFailed(true) : setSceneFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No room scene</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {/* Door toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowDoor((v) => !v); }}
          className={`absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-md transition-colors z-10 ${
            showDoor ? "border-white bg-white text-foreground" : "border-white/80 bg-black/40 text-white hover:bg-black/60"
          }`}
          title={showDoor ? "Show room scene" : "View door close-up"}
        >
          {showDoor ? <Maximize2 className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
        </button>
        <span className="absolute bottom-2 left-2 text-[9px] font-medium text-white/90 bg-black/50 px-1.5 py-0.5 rounded-full">
          {showDoor ? "Door" : "Room"}
        </span>
        {/* Status badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {hidden && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Hidden</Badge>}
          {featured && !hidden && <Badge className="text-[10px] py-0 px-1.5 bg-primary/90 text-primary-foreground">Featured</Badge>}
        </div>
      </div>
      {/* Info row */}
      <div className="flex gap-3 p-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm truncate">{displayName}</p>
              {style.override?.brandName && (
                <p className="text-xs text-muted-foreground truncate">Original: {style.ourName || style.styleCode}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleHidden.mutate({ styleId: style.id, hidden: !hidden })}
                className={`p-1 rounded transition-colors ${hidden ? "text-destructive hover:text-destructive/70" : "text-muted-foreground hover:text-foreground"}`}
                title={hidden ? "Show on storefront" : "Hide from storefront"}
                disabled={toggleHidden.isPending}
              >
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleFeatured}
                className={`p-1 rounded transition-colors ${featured && !hidden ? "text-primary hover:text-primary/70" : "text-muted-foreground hover:text-foreground"}`}
                title={featured ? "Remove from featured" : "Feature this style"}
                disabled={hidden}
              >
                {featured && !hidden ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!hidden && (
              <Badge variant="outline" className="text-xs">
                {style.override?.markupBps != null ? `${bpsToPercent(style.override.markupBps)}% markup` : `${bpsToPercent(affiliateDefaultBps)}% (default)`}
              </Badge>
            )}
            {style.color && <Badge variant="secondary" className="text-xs">{style.color}</Badge>}
          </div>
        </div>
      </div>

      {/* Room scene upload row — replace-only, no delete */}
      <div className="border-t border-border px-3 py-2 flex items-center gap-3">
        <span className="text-xs text-muted-foreground flex-1">
          {roomScene ? (style.override?.roomSceneUrl ? "Custom room scene active" : "Using master room scene") : "No room scene uploaded"}
        </span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button
          variant="outline" size="sm" className="gap-1 text-xs h-7"
          onClick={() => fileRef.current?.click()}
          disabled={uploadScene.isPending}
        >
          {uploadScene.isPending ? <Spinner className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
          {style.override?.roomSceneUrl ? "Replace Scene" : "Upload Scene"}
        </Button>
      </div>

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
                  className="h-8 text-sm"
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 h-7" onClick={saveEdit} disabled={upsert.isPending}>
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

export default function AffiliateCatalogPanel() {
  const { data, isLoading } = trpc.affiliates.myBranding.useQuery();
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
          Choose which door styles to feature on your storefront, rename them for your brand, set per-style markups, and upload your own room scene photos.
        </p>
      </div>

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
            <StyleCard key={s.id} style={s as StyleRow} affiliateDefaultBps={data.defaultMarkupBps} />
          ))}
        </div>
      )}
    </div>
  );
}
