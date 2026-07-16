import { useMemo, useState, useRef } from "react";
import {
  Star, Search, GripVertical, ArrowUp, ArrowDown, X,
  AlertTriangle, CheckCircle2, Pencil, RotateCcw, Upload, Loader2, ImageIcon,
  List, Save, Eye, EyeOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import DoorPhotoCorrectButton from "./DoorPhotoCorrectButton";

const MAX_FEATURED = 30;

interface AdminStyle {
  id: number;
  ourName: string;
  aliasName: string | null;
  featuredLabel: string | null;
  doorStyle: string | null;
  color: string | null;
  finish: string | null;
  woodSpecies: string | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  doorSampleVerified: boolean;
  isFeatured: boolean;
  featuredRank: number;
  distributorId: number;
  distributorName: string | null;
  seriesName: string | null;
  distributorSkuBreakdown?: { distributorName: string; skuCount: number }[];
}

function thumb(s: AdminStyle): string | null {
  return s.thumbnailImageUrl || s.doorSampleImageUrl || s.roomSceneImageUrl || null;
}

// ── Reusable image field: paste a URL OR upload from device, with live preview ──

function ImageField({
  label,
  hint,
  value,
  onChange,
  big,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  /** When true, render a larger preview (used for the room scene). */
  big?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = trpc.cabinets.adminUploadCatalogImage.useMutation();

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large (max 10MB).");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const { url } = await upload.mutateAsync({
        filename: file.name || "door-image.jpg",
        dataBase64: dataUrl,
        contentType: file.type || "image/jpeg",
      });
      onChange(url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={`flex ${big ? "flex-col sm:flex-row" : "flex-row"} gap-3`}>
        {/* Preview */}
        <div
          className={`shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40 flex items-center justify-center ${
            big ? "h-36 w-full sm:w-56" : "h-16 w-16"
          }`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
          )}
        </div>
        {/* Controls */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… or upload below"
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            )}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Quick-edit dialog ─────────────────────────────────────────────────────────

// ── Inline Editable Pricing Table (used inside EditDialog) ───────────────────
// Delegates to StylePricingInlineTable which is defined after SkuEditRow/SKU_PRICE_FIELDS
// to avoid referencing consts before their declaration.
function StylePricingSummary({ styleId }: { styleId: number }) {
  return <StylePricingInlineTable styleId={styleId} />;
}

interface EditDialogProps {
  style: AdminStyle;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditDialog({ style, open, onClose, onSaved }: EditDialogProps) {
  const [featuredLabel, setFeaturedLabel] = useState(style.featuredLabel ?? "");
  const [aliasName, setAliasName] = useState(style.aliasName ?? "");
  const [ourName, setOurName] = useState(style.ourName);
  const [doorStyle, setDoorStyle] = useState(style.doorStyle ?? "");
  const [color, setColor] = useState(style.color ?? "");
  const [finish, setFinish] = useState(style.finish ?? "");
  const [woodSpecies, setWoodSpecies] = useState(style.woodSpecies ?? "");
  const [doorSampleImageUrl, setDoorSampleImageUrl] = useState(style.doorSampleImageUrl ?? "");
  const [roomSceneImageUrl, setRoomSceneImageUrl] = useState(style.roomSceneImageUrl ?? "");
  const [thumbnailImageUrl, setThumbnailImageUrl] = useState(style.thumbnailImageUrl ?? "");
  const [selectedDistributorId, setSelectedDistributorId] = useState(String(style.distributorId));
  const [editingSeriesName, setEditingSeriesName] = useState(false);
  const [seriesNameDraft, setSeriesNameDraft] = useState(style.seriesName ?? "");

  const { data: distributorList } = trpc.distributors.list.useQuery();

  // Reset state when dialog opens for a different style
  const resetToStyle = (s: AdminStyle) => {
    setFeaturedLabel(s.featuredLabel ?? "");
    setAliasName(s.aliasName ?? "");
    setOurName(s.ourName);
    setDoorStyle(s.doorStyle ?? "");
    setColor(s.color ?? "");
    setFinish(s.finish ?? "");
    setWoodSpecies(s.woodSpecies ?? "");
    setDoorSampleImageUrl(s.doorSampleImageUrl ?? "");
    setRoomSceneImageUrl(s.roomSceneImageUrl ?? "");
    setThumbnailImageUrl(s.thumbnailImageUrl ?? "");
    setSelectedDistributorId(String(s.distributorId));
    setSeriesNameDraft(s.seriesName ?? "");
    setEditingSeriesName(false);
  };

  const updateDistributor = trpc.doorStyles.adminUpdateDoorStyleDistributor.useMutation({
    onSuccess: () => { toast.success("Distributor updated"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const updateSeriesName = trpc.doorStyles.adminUpdateDistributorSeriesName.useMutation({
    onSuccess: () => { toast.success("Series name updated"); setEditingSeriesName(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.doorStyles.adminUpdateDoorStyle.useMutation({
    onSuccess: () => {
      toast.success("Style updated");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    if (!ourName.trim()) {
      toast.error("Internal name is required");
      return;
    }
    // Reassign distributor if changed
    const newDistId = Number(selectedDistributorId);
    if (newDistId && newDistId !== style.distributorId) {
      updateDistributor.mutate({ id: style.id, distributorId: newDistId });
    }
    update.mutate({
      id: style.id,
      featuredLabel: featuredLabel.trim() || null,
      aliasName: aliasName.trim() || null,
      ourName: ourName.trim(),
      doorStyle: doorStyle.trim() || null,
      color: color.trim() || null,
      finish: finish.trim() || null,
      woodSpecies: woodSpecies.trim() || null,
      doorSampleImageUrl: doorSampleImageUrl.trim() || null,
      roomSceneImageUrl: roomSceneImageUrl.trim() || null,
      thumbnailImageUrl: thumbnailImageUrl.trim() || null,
    });
  }

  // Sync fields when the style prop changes (e.g. list refreshes)
  const prevId = useMemo(() => style.id, [style.id]);
  if (open && style.id !== prevId) resetToStyle(style);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-amber-600" />
            Edit Door Style
            <span className="font-mono text-xs font-normal text-muted-foreground ml-1">{style.ourName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">

          {/* Alias Name (CD_STANDARDS white-label) */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 space-y-1.5">
            <Label htmlFor="ed-alias">
              Alias Name{" "}
              <span className="text-muted-foreground font-normal text-xs">(white-label public name — what customers see)</span>
            </Label>
            <Input
              id="ed-alias"
              value={aliasName}
              onChange={(e) => setAliasName(e.target.value)}
              placeholder={`e.g. ${style.ourName}`}
            />
            {aliasName.trim() && (
              <button
                type="button"
                onClick={() => setAliasName("")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Clear alias (show internal name)
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              This is the CD_STANDARDS white-label name shown in the catalog, designer, and door styles page.
              Leave blank to fall back to the internal name.
            </p>
          </div>

          {/* Legacy public label (kept for backward compat) */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 space-y-1.5">
            <Label htmlFor="ed-label">
              Featured Label{" "}
              <span className="text-muted-foreground font-normal text-xs">(legacy override)</span>
            </Label>
            <Input
              id="ed-label"
              value={featuredLabel}
              onChange={(e) => setFeaturedLabel(e.target.value)}
              placeholder={`Default: ${style.ourName}`}
            />
            {featuredLabel.trim() && (
              <button
                type="button"
                onClick={() => setFeaturedLabel("")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset to default
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              Legacy field. Use Alias Name above instead.
            </p>
          </div>

          {/* Distributor assignment */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-3 space-y-3">
            <Label className="text-sm font-medium text-blue-900">Distributor / Series</Label>
            <div className="space-y-1.5">
              <Label htmlFor="ed-dist" className="text-xs text-muted-foreground">Assign to Distributor</Label>
              <Select value={selectedDistributorId} onValueChange={setSelectedDistributorId}>
                <SelectTrigger id="ed-dist" className="h-9">
                  <SelectValue placeholder="Select distributor…" />
                </SelectTrigger>
                <SelectContent>
                  {(distributorList ?? []).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}{d.seriesName ? ` (${d.seriesName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Changing this reassigns the style to a different supply line.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Series Name (for this distributor)</Label>
              {editingSeriesName ? (
                <div className="flex gap-2">
                  <Input
                    value={seriesNameDraft}
                    onChange={(e) => setSeriesNameDraft(e.target.value)}
                    placeholder="e.g. Ashford"
                    className="h-9"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={updateSeriesName.isPending}
                    onClick={() => updateSeriesName.mutate({ distributorId: Number(selectedDistributorId), seriesName: seriesNameDraft.trim() || null })}
                  >
                    {updateSeriesName.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-9" onClick={() => { setEditingSeriesName(false); setSeriesNameDraft(style.seriesName ?? ""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{style.seriesName || <span className="text-muted-foreground italic">None set</span>}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingSeriesName(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">This is the series name shown after the style name, e.g. "Lumina White (Ashford)".</p>
            </div>
          </div>

          {/* Internal name */}
          <div className="space-y-1.5">
            <Label htmlFor="ed-name">
              Internal Name{" "}
              <span className="text-muted-foreground font-normal text-xs">(admin only)</span>
            </Label>
            <Input
              id="ed-name"
              value={ourName}
              onChange={(e) => setOurName(e.target.value)}
              placeholder="e.g. Lumina White"
            />
          </div>

          {/* Door style type + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-doorstyle">Door Style Type</Label>
              <Input
                id="ed-doorstyle"
                value={doorStyle}
                onChange={(e) => setDoorStyle(e.target.value)}
                placeholder="e.g. Shaker"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-color">Color</Label>
              <Input
                id="ed-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. White"
              />
            </div>
          </div>

          {/* Finish + Wood species */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-finish">Finish</Label>
              <Input
                id="ed-finish"
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
                placeholder="e.g. Painted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-wood">Wood Species</Label>
              <Input
                id="ed-wood"
                value={woodSpecies}
                onChange={(e) => setWoodSpecies(e.target.value)}
                placeholder="e.g. Maple"
              />
            </div>
          </div>

          {/* Pricing Summary */}
          <StylePricingSummary styleId={style.id} />

          {/* Images — upload from device or paste a URL; changes save site-wide */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Images</Label>
            <p className="text-xs text-muted-foreground -mt-2">
              Upload a photo from your device or paste an image URL. Saving applies the change
              everywhere this door style appears — catalog, door styles page, the kitchen designer,
              and the family/product page.
            </p>

            {/* Room scene gets the prominent, larger preview */}
            <ImageField
              label="Room Scene Photo"
              hint="The full kitchen scene shown on the family/product page and home showcase."
              value={roomSceneImageUrl}
              onChange={setRoomSceneImageUrl}
              big
            />
            <ImageField
              label="Door Sample Photo"
              hint="Close-up of the door, used as the main catalog/designer thumbnail."
              value={doorSampleImageUrl}
              onChange={setDoorSampleImageUrl}
            />
            <ImageField
              label="Thumbnail (optional override)"
              hint="Overrides the door sample as the small thumbnail when set."
              value={thumbnailImageUrl}
              onChange={setThumbnailImageUrl}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={update.isPending || !ourName.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add New Style form ───────────────────────────────────────────────────────

function AddNewStyleForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [distributorId, setDistributorId] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const [ourName, setOurName] = useState("");
  const [distributorName, setDistributorName] = useState("");
  const [doorStyle, setDoorStyle] = useState("");
  const [color, setColor] = useState("");

  const { data: distributorList } = trpc.distributors.list.useQuery();

  const create = trpc.doorStyles.adminCreateDoorStyle.useMutation({
    onSuccess: () => {
      toast.success("Door style created");
      setOpen(false);
      setDistributorId(""); setStyleCode(""); setOurName(""); setDistributorName(""); setDoorStyle(""); setColor("");
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 border-dashed"
        onClick={() => setOpen(true)}
      >
        <span className="mr-1.5 text-lg leading-none">+</span> Add New Door Style
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm text-blue-900">Add New Door Style</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Distributor *</Label>
          <Select value={distributorId} onValueChange={setDistributorId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select distributor…" />
            </SelectTrigger>
            <SelectContent>
              {(distributorList ?? []).map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}{d.seriesName ? ` (${d.seriesName})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Style Code * <span className="text-muted-foreground font-normal">(e.g. SW, AG)</span></Label>
          <Input value={styleCode} onChange={(e) => setStyleCode(e.target.value.toUpperCase())} placeholder="SW" className="h-9 font-mono" maxLength={32} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Our Name * <span className="text-muted-foreground font-normal">(white-label)</span></Label>
          <Input value={ourName} onChange={(e) => setOurName(e.target.value)} placeholder="e.g. Blanc Core" className="h-9" maxLength={128} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Distributor Name <span className="text-muted-foreground font-normal">(their name)</span></Label>
          <Input value={distributorName} onChange={(e) => setDistributorName(e.target.value)} placeholder="e.g. Shaker White" className="h-9" maxLength={128} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Door Style Type</Label>
          <Input value={doorStyle} onChange={(e) => setDoorStyle(e.target.value)} placeholder="e.g. Shaker" className="h-9" maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Color</Label>
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. White" className="h-9" maxLength={64} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={create.isPending || !distributorId || !styleCode.trim() || !ourName.trim()}
          onClick={() => create.mutate({
            distributorId: Number(distributorId),
            styleCode: styleCode.trim(),
            ourName: ourName.trim(),
            distributorName: distributorName.trim() || undefined,
            doorStyle: doorStyle.trim() || null,
            color: color.trim() || null,
          })}
        >
          {create.isPending ? "Creating…" : "Create Style"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FeaturedStylesAdmin() {
  const [search, setSearch] = useState("");
  const [distributorFilter, setDistributorFilter] = useState<string>("all");
  const [editingStyle, setEditingStyle] = useState<AdminStyle | null>(null);
  const [viewingStyle, setViewingStyle] = useState<AdminStyle | null>(null);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.doorStyles.listForAdminWithSkuCounts.useQuery();

  const styles = useMemo(() => (data ?? []) as unknown as AdminStyle[], [data]);

  const featured = useMemo(
    () =>
      styles
        .filter((s) => s.isFeatured)
        .sort((a, b) => a.featuredRank - b.featuredRank || a.ourName.localeCompare(b.ourName)),
    [styles],
  );

  // Distinct distributors present in the catalog, for the filter dropdown.
  const distributorOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of styles) {
      if (!map.has(s.distributorId)) {
        map.set(s.distributorId, s.distributorName?.trim() || `Distributor #${s.distributorId}`);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [styles]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const distId = distributorFilter === "all" ? null : Number(distributorFilter);
    return styles
      .filter((s) => !s.isFeatured)
      .filter((s) => (distId === null ? true : s.distributorId === distId))
      .filter((s) =>
        q
          ? `${s.ourName} ${s.doorStyle ?? ""} ${s.color ?? ""} ${s.finish ?? ""} ${s.distributorName ?? ""}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => a.ourName.localeCompare(b.ourName));
  }, [styles, search, distributorFilter]);

  const setFeatured = trpc.doorStyles.setFeatured.useMutation({
    onSuccess: () => {
      utils.doorStyles.listForAdmin.invalidate();
      utils.doorStyles.featured.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reorder = trpc.doorStyles.reorderFeatured.useMutation({
    onSuccess: () => {
      utils.doorStyles.listForAdmin.invalidate();
      utils.doorStyles.featured.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const atCap = featured.length >= MAX_FEATURED;
  const unverifiedCount = useMemo(
    () => featured.filter((s) => !s.doorSampleVerified).length,
    [featured],
  );

  function add(s: AdminStyle) {
    if (atCap) {
      toast.error(`You can feature up to ${MAX_FEATURED} door styles. Remove one first.`);
      return;
    }
    setFeatured.mutate({ id: s.id, featured: true });
  }
  function remove(s: AdminStyle) {
    setFeatured.mutate({ id: s.id, featured: false });
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...featured];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({ orderedIds: next.map((s) => s.id) });
  }

  function invalidateAll() {
    utils.doorStyles.listForAdmin.invalidate();
    utils.doorStyles.featured.invalidate();
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Intro + cap meter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Featured Door Styles
          </h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Choose the door styles to push at the top of the Door Styles page, and edit any door
            style here. Click the <Pencil className="inline h-3.5 w-3.5" /> pencil on any style
            (featured or not, in the list below) to change its name, color, finish, and its
            room-scene / door photos — uploads apply everywhere that style appears on the site.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          {unverifiedCount > 0 && (
            <Badge variant="outline" className="text-sm border-amber-500 text-amber-600 bg-amber-50">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              {unverifiedCount} need correct photo
            </Badge>
          )}
          <Badge variant={atCap ? "destructive" : "secondary"} className="text-sm">
            {featured.length} / {MAX_FEATURED} featured
          </Badge>
          <AddNewStyleForm onCreated={invalidateAll} />
        </div>
      </div>

      {/* Featured list */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Featured now ({featured.length})
        </h3>
        {featured.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No featured styles yet. Add some from the list below.
          </div>
        ) : (
          <ul className="space-y-2">
            {featured.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
              >
                <span className="flex items-center justify-center h-6 w-6 rounded bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                {thumb(s) ? (
                  <img
                    src={thumb(s)!}
                    alt={s.ourName}
                    className="h-12 w-12 rounded object-cover ring-1 ring-border shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {/* Public label (if set) vs internal name */}
                  <p className="font-medium text-sm truncate flex items-center gap-1.5">
                    {s.featuredLabel ? (
                      <>
                        <span className="text-primary">{s.featuredLabel}</span>
                        <span className="text-muted-foreground font-normal text-xs">({s.ourName})</span>
                      </>
                    ) : (
                      <>
                        {s.ourName}
                        {s.doorSampleVerified ? (
                          <span title="Sample photo verified" className="inline-flex items-center text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        ) : (
                          <span title="Unverified door photo" className="inline-flex items-center text-amber-600">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.doorStyle, s.color, s.finish].filter(Boolean).join(" · ")}
                  </p>
                  {(s.distributorName || s.seriesName) && (
                    <p className="text-xs truncate mt-0.5">
                      <span className="text-blue-600 font-medium">{s.seriesName || s.distributorName}</span>
                      {s.seriesName && s.distributorName && (
                        <span className="text-muted-foreground"> · {s.distributorName}</span>
                      )}
                    </p>
                  )}
                  {s.distributorSkuBreakdown && s.distributorSkuBreakdown.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.distributorSkuBreakdown.map((d) => (
                        <span
                          key={d.distributorName}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                        >
                          {d.distributorName}
                          <span className="bg-slate-200 text-slate-700 rounded-full px-1">{d.skuCount}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* List items button */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => setViewingStyle(s)}
                    aria-label="View & edit line items"
                    title="View & edit line items"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  {/* Quick-edit button */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => setEditingStyle(s)}
                    aria-label="Edit style"
                    title="Edit style"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DoorPhotoCorrectButton styleId={s.id} styleName={s.ourName} compact />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={i === featured.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={setFeatured.isPending}
                    onClick={() => remove(s)}
                    aria-label="Remove from featured"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* All other styles — edit any of them, or feature them */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            All door styles{" "}
            <span className="text-muted-foreground/60 normal-case font-normal">
              ({available.length})
            </span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Filter by distributor (supply line) */}
            <Select value={distributorFilter} onValueChange={setDistributorFilter}>
              <SelectTrigger className="h-9 w-full sm:w-56">
                <SelectValue placeholder="All distributors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All distributors</SelectItem>
                {distributorOptions.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search door styles…"
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching styles.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {available.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
              >
                <button
                  type="button"
                  onClick={() => setEditingStyle(s)}
                  title="Edit this door style"
                  className="shrink-0"
                >
                  {thumb(s) ? (
                    <img
                      src={thumb(s)!}
                      alt={s.ourName}
                      className="h-11 w-11 rounded object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStyle(s)}
                  className="min-w-0 flex-1 text-left"
                  title="Edit this door style"
                >
                  <p className="font-medium text-sm truncate">{s.ourName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.doorStyle, s.color].filter(Boolean).join(" · ")}
                  </p>
                  {(s.distributorName || s.seriesName) && (
                    <p className="text-xs truncate mt-0.5">
                      <span className="text-blue-600 font-medium">{s.seriesName || s.distributorName}</span>
                      {s.seriesName && s.distributorName && (
                        <span className="text-muted-foreground"> · {s.distributorName}</span>
                      )}
                    </p>
                  )}
                  {s.distributorSkuBreakdown && s.distributorSkuBreakdown.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.distributorSkuBreakdown.map((d) => (
                        <span
                          key={d.distributorName}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                        >
                          {d.distributorName}
                          <span className="bg-slate-200 text-slate-700 rounded-full px-1">{d.skuCount}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => setEditingStyle(s)}
                    aria-label="Edit style"
                    title="Edit style"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => add(s)}
                    disabled={atCap || setFeatured.isPending}
                    aria-label="Feature this style"
                    title={atCap ? `At ${MAX_FEATURED}-style limit` : "Add to featured"}
                  >
                    <Star className="h-4 w-4 text-muted-foreground/60" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {atCap && (
          <p className="text-xs text-destructive mt-3">
            You've reached the {MAX_FEATURED}-style limit. Remove one above to add another.
          </p>
        )}
      </div>

      {/* Quick-edit dialog */}
      {editingStyle && (
        <EditDialog
          style={editingStyle}
          open={!!editingStyle}
          onClose={() => setEditingStyle(null)}
          onSaved={invalidateAll}
        />
      )}
      {/* Line items dialog */}
      {viewingStyle && (
        <StyleSkuListDialog
          style={viewingStyle}
          open={!!viewingStyle}
          onClose={() => setViewingStyle(null)}
          onSaved={invalidateAll}
        />
      )}
    </div>
  );
}

// ── Price fields config ──────────────────────────────────────────────────────
const SKU_PRICE_FIELDS = [
  { key: "yourCost", label: "Your Cost" },
  { key: "listPrice", label: "List Price" },
  { key: "wholesalePrice", label: "Wholesale" },
  { key: "contractorPrice", label: "Contractor" },
  { key: "homeownerPrice", label: "Homeowner" },
] as const;
type SkuPriceKey = (typeof SKU_PRICE_FIELDS)[number]["key"];

interface SkuRow {
  id: number;
  platformSku: string | null;
  distributorSku: string | null;
  listPrice: string | null;
  yourCost: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  isAvailable: boolean;
  isPublished: boolean;
  cabinetId: number | null;
  masterCode: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  conflictStatus: string | null;
  conflictReason: string | null;
}

function dollarVal(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function SkuEditRow({ sku, onSaved }: { sku: SkuRow; onSaved: () => void }) {
  const initial: Record<SkuPriceKey, string> = {
    yourCost: dollarVal(sku.yourCost),
    listPrice: dollarVal(sku.listPrice),
    wholesalePrice: dollarVal(sku.wholesalePrice),
    contractorPrice: dollarVal(sku.contractorPrice),
    homeownerPrice: dollarVal(sku.homeownerPrice),
  };
  const [draft, setDraft] = useState<Record<SkuPriceKey, string>>(initial);
  const dirty = SKU_PRICE_FIELDS.some((f) => draft[f.key] !== initial[f.key]);

  const updateCost = trpc.pricing.adminUpdateSkuCost.useMutation({
    onSuccess: (res) => {
      toast.success(res.changed > 0 ? `Saved ${res.changed} change${res.changed === 1 ? "" : "s"}` : "No changes");
      onSaved();
    },
    onError: (e: { message: string }) => toast.error(e.message || "Save failed"),
  });
  const toggleAvail = trpc.pricing.adminUpdateSkuAvailability.useMutation({
    onSuccess: () => onSaved(),
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const togglePublished = trpc.doorStyles.adminToggleSkuPublished.useMutation({
    onSuccess: () => onSaved(),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSave = () => {
    // Always send all price fields — let the server decide what changed.
    const payload: Record<string, number | null> = { skuId: sku.id };
    for (const f of SKU_PRICE_FIELDS) {
      const trimmed = draft[f.key].trim();
      payload[f.key] = trimmed === "" ? null : Number(trimmed);
    }
    updateCost.mutate(payload as Parameters<typeof updateCost.mutate>[0]);
  };

  const isConflict = sku.conflictStatus === "conflict";

  return (
    <TableRow className={isConflict ? "bg-red-50/60" : dirty ? "bg-amber-50/40" : undefined}>
      {/* Cabinet info */}
      <TableCell className="align-top min-w-[160px]">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">{sku.masterCode ?? "—"}</span>
          {isConflict && (
            <Badge variant="destructive" className="text-[9px] px-1 py-0">Conflict</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">{sku.description ?? ""}</div>
        {sku.category && (
          <Badge variant="outline" className="text-[10px] mt-1">
            {sku.category}{sku.subCategory ? ` / ${sku.subCategory}` : ""}
          </Badge>
        )}
        {isConflict && sku.conflictReason && (
          <p className="text-[10px] text-red-600 mt-0.5 leading-tight">{sku.conflictReason}</p>
        )}
      </TableCell>
      {/* SKU codes */}
      <TableCell className="align-top min-w-[120px]">
        <div className="font-mono text-xs">{sku.platformSku}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{sku.distributorSku}</div>
      </TableCell>
      {/* Price fields */}
      {SKU_PRICE_FIELDS.map((f) => (
        <TableCell key={f.key} className="align-top p-1.5 min-w-[80px]">
          <Input
            inputMode="decimal"
            value={draft[f.key]}
            placeholder="—"
            className={`h-7 text-xs px-2 ${draft[f.key] !== initial[f.key] ? "border-amber-500" : ""}`}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </TableCell>
      ))}
      {/* Availability & Published toggles */}
      <TableCell className="align-top min-w-[90px]">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch
              checked={sku.isAvailable}
              onCheckedChange={(v) => toggleAvail.mutate({ skuId: sku.id, isAvailable: v })}
              className="scale-75"
            />
            <span className={`text-[10px] ${sku.isAvailable ? "text-emerald-600" : "text-muted-foreground"}`}>
              {sku.isAvailable ? "Avail" : "N/A"}
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch
              checked={sku.isPublished}
              onCheckedChange={(v) => togglePublished.mutate({ skuId: sku.id, isPublished: v })}
              className="scale-75"
            />
            <span className={`text-[10px] ${sku.isPublished ? "text-emerald-600" : "text-muted-foreground"}`}>
              {sku.isPublished ? "Pub" : "Hidden"}
            </span>
          </label>
        </div>
      </TableCell>
      {/* Save */}
      <TableCell className="align-top">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!dirty || updateCost.isPending}
          onClick={handleSave}
        >
          {updateCost.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── StylePricingInlineTable — full inline editable SKU table for EditDialog ──
// Defined here (after SKU_PRICE_FIELDS and SkuEditRow) to avoid forward-reference errors.
function StylePricingInlineTable({ styleId }: { styleId: number }) {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = trpc.doorStyles.adminListSkusForStyle.useQuery(
    { styleId },
    { refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading pricing data…
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as SkuRow[];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
        <p className="text-xs text-muted-foreground">No SKU pricing data uploaded for this style yet.</p>
      </div>
    );
  }

  const activeCount = rows.filter((r) => r.isAvailable && r.isPublished).length;
  const conflictCount = rows.filter((r) => r.conflictStatus === "conflict").length;
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    q
      ? `${r.masterCode ?? ""} ${r.description ?? ""} ${r.platformSku ?? ""} ${r.distributorSku ?? ""}`
          .toLowerCase()
          .includes(q)
      : true
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">SKU Pricing</Label>
        <div className="flex items-center gap-2">
          {conflictCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {activeCount} / {rows.length} active
          </Badge>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search code, SKU…"
          className="pl-8 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded border">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0">
            <TableRow>
              <TableHead className="text-xs py-1.5">Code / Description</TableHead>
              <TableHead className="text-xs py-1.5">SKU</TableHead>
              {SKU_PRICE_FIELDS.map((f) => (
                <TableHead key={f.key} className="text-xs py-1.5 text-right whitespace-nowrap">{f.label}</TableHead>
              ))}
              <TableHead className="text-xs py-1.5 text-center">Avail</TableHead>
              <TableHead className="text-xs py-1.5 text-center">Live</TableHead>
              <TableHead className="text-xs py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((sku) => (
              <SkuEditRow key={sku.id} sku={sku} onSaved={refetch} />
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No matching SKUs</div>
        )}
      </div>
    </div>
  );
}

function StyleSkuListDialog({
  style,
  open,
  onClose,
  onSaved,
}: {
  style: AdminStyle;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { data, isLoading, refetch } = trpc.doorStyles.adminListSkusForStyle.useQuery(
    { styleId: style.id },
    { enabled: open }
  );
  const toggleAll = trpc.doorStyles.adminToggleAllSkusPublished.useMutation({
    onSuccess: () => { refetch(); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = (data ?? []) as SkuRow[];
    const q = search.trim().toLowerCase();
    const filtered = all
      .filter((r) => categoryFilter === "all" || r.category === categoryFilter)
      .filter((r) =>
        q
          ? `${r.masterCode ?? ""} ${r.description ?? ""} ${r.platformSku ?? ""} ${r.distributorSku ?? ""}`
              .toLowerCase()
              .includes(q)
          : true
      );
    return filtered;
  }, [data, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const r of (data ?? []) as SkuRow[]) {
      if (r.category) cats.add(r.category);
    }
    return Array.from(cats).sort();
  }, [data]);

  const conflictCount = useMemo(
    () => ((data ?? []) as SkuRow[]).filter((r) => r.conflictStatus === "conflict").length,
    [data]
  );
  const activeCount = useMemo(
    () => ((data ?? []) as SkuRow[]).filter((r) => r.isAvailable && r.isPublished).length,
    [data]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <List className="h-4 w-4" />
            Line Items — {style.ourName}
            {style.aliasName && (
              <span className="text-muted-foreground font-normal text-sm">({style.aliasName})</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {conflictCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {activeCount} active / {(data ?? []).length} total
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>
        {/* Toolbar */}
        <div className="px-4 py-2 border-b shrink-0 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search code, description, SKU…"
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={() => toggleAll.mutate({ styleId: style.id, isPublished: true })}
            disabled={toggleAll.isPending}
          >
            <Eye className="h-3.5 w-3.5" /> Publish all
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={() => toggleAll.mutate({ styleId: style.id, isPublished: false })}
            disabled={toggleAll.isPending}
          >
            <EyeOff className="h-3.5 w-3.5" /> Unpublish all
          </Button>
        </div>
        {/* Table */}
        <ScrollArea className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <List className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No line items found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="min-w-[160px]">Cabinet</TableHead>
                  <TableHead className="min-w-[120px]">SKU</TableHead>
                  {SKU_PRICE_FIELDS.map((f) => (
                    <TableHead key={f.key} className="min-w-[80px]">{f.label}</TableHead>
                  ))}
                  <TableHead className="min-w-[90px]">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sku) => (
                  <SkuEditRow key={sku.id} sku={sku as SkuRow} onSaved={() => { refetch(); onSaved(); }} />
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
        <div className="px-6 py-3 border-t shrink-0 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {rows.length} row{rows.length !== 1 ? "s" : ""} shown
            {conflictCount > 0 && (
              <span className="text-red-600 ml-2">
                · {conflictCount} conflict item{conflictCount !== 1 ? "s" : ""} shown at top
              </span>
            )}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
