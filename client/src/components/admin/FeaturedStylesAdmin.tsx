import { useMemo, useState, useRef } from "react";
import {
  Star, Search, GripVertical, ArrowUp, ArrowDown, X,
  AlertTriangle, CheckCircle2, Pencil, RotateCcw, Upload, Loader2, ImageIcon, GitMerge,
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
  supplyLineName?: string | null;
  supplyLineNeutralName?: string | null;
  activeSkuCount?: number;
  inactiveSkuCount?: number;
  totalSkuCount?: number;
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
  const [mergingStyle, setMergingStyle] = useState<AdminStyle | null>(null);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.doorStyles.listForAdmin.useQuery();

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

  const mergeStyles = trpc.doorStyles.mergeStyles.useMutation({
    onSuccess: (res) => {
      toast.success(`Merged "${res.duplicateName}" into "${res.primaryName}" — ${res.skusMoved} SKUs moved.`);
      setMergingStyle(null);
      invalidateAll();
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
                    {s.supplyLineName && (
                      <span className="text-orange-500 font-semibold text-xs shrink-0">· {s.supplyLineName}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.distributorName || s.seriesName, s.doorStyle, s.color, s.finish].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs mt-0.5">
                    <span className="text-emerald-600 font-medium">{s.totalSkuCount ?? 0} total</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-emerald-600">{s.activeSkuCount ?? 0} active</span>
                    {(s.inactiveSkuCount ?? 0) > 0 && (
                      <><span className="text-muted-foreground"> · </span><span className="text-amber-600">{s.inactiveSkuCount} inactive</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
                    className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={() => setMergingStyle(s)}
                    aria-label="Merge with another style"
                    title="Mark as same style (merge)"
                  >
                    <GitMerge className="h-4 w-4" />
                  </Button>
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
                  <p className="font-medium text-sm truncate flex items-center gap-1.5">
                    <span className="truncate">{s.ourName}</span>
                    {s.supplyLineName && (
                      <span className="text-orange-500 font-semibold text-xs shrink-0">· {s.supplyLineName}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.distributorName || s.seriesName, s.doorStyle, s.color].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs mt-0.5">
                    <span className="text-emerald-600 font-medium">{s.totalSkuCount ?? 0} total</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-emerald-600">{s.activeSkuCount ?? 0} active</span>
                    {(s.inactiveSkuCount ?? 0) > 0 && (
                      <><span className="text-muted-foreground"> · </span><span className="text-amber-600">{s.inactiveSkuCount} inactive</span></>
                    )}
                  </p>
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
                    className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={() => setMergingStyle(s)}
                    aria-label="Merge with another style"
                    title="Mark as same style (merge)"
                  >
                    <GitMerge className="h-4 w-4" />
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

      {/* Merge dialog */}
      {mergingStyle && (
        <MergeStyleDialog
          duplicate={mergingStyle}
          allStyles={styles}
          open={!!mergingStyle}
          onClose={() => setMergingStyle(null)}
          onMerge={(primaryId, copyImages) =>
            mergeStyles.mutate({ primaryId, duplicateId: mergingStyle.id, copyMissingImages: copyImages })
          }
          isPending={mergeStyles.isPending}
        />
      )}
    </div>
  );
}

// ── Small image pair: door sample + room scene thumbnails ───────────────────

function StyleImagePreviews({ style }: { style: Pick<AdminStyle, "doorSampleImageUrl" | "roomSceneImageUrl"> }) {
  return (
    <div className="flex gap-1.5 shrink-0">
      {/* Door sample */}
      <div className="relative">
        <div className="h-16 w-16 rounded border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
          {style.doorSampleImageUrl ? (
            <img src={style.doorSampleImageUrl} alt="Door sample" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
          )}
        </div>
        <span className="absolute -bottom-4 left-0 right-0 text-center text-[9px] text-muted-foreground leading-tight">Door</span>
      </div>
      {/* Room scene */}
      <div className="relative">
        <div className="h-16 w-24 rounded border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
          {style.roomSceneImageUrl ? (
            <img src={style.roomSceneImageUrl} alt="Room scene" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
          )}
        </div>
        <span className="absolute -bottom-4 left-0 right-0 text-center text-[9px] text-muted-foreground leading-tight">Room scene</span>
      </div>
    </div>
  );
}

// ── Merge Style Dialog ────────────────────────────────────────────────────────

function MergeStyleDialog({
  duplicate,
  allStyles,
  open,
  onClose,
  onMerge,
  isPending,
}: {
  duplicate: AdminStyle;
  allStyles: AdminStyle[];
  open: boolean;
  onClose: () => void;
  onMerge: (primaryId: number, copyImages: boolean) => void;
  isPending: boolean;
}) {
  const [primaryId, setPrimaryId] = useState<string>("");
  const [copyImages, setCopyImages] = useState(true);

  const candidates = useMemo(
    () => allStyles.filter((s) => s.id !== duplicate.id).sort((a, b) => a.ourName.localeCompare(b.ourName)),
    [allStyles, duplicate.id],
  );

  const primary = candidates.find((s) => s.id === Number(primaryId));

  function handleMerge() {
    if (!primaryId) return;
    onMerge(Number(primaryId), copyImages);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-purple-600" />
            Mark as Same Style
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Duplicate card */}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium text-muted-foreground mb-2">Duplicate (will be deactivated)</p>
            <div className="flex gap-3">
              <StyleImagePreviews style={duplicate} />
              <div className="min-w-0">
                <p className="font-semibold">{duplicate.ourName}</p>
                {duplicate.supplyLineName && (
                  <p className="text-xs text-orange-600">{duplicate.supplyLineName}</p>
                )}
                <p className="text-xs text-muted-foreground">{[duplicate.doorStyle, duplicate.color].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Primary style (keep this one)</Label>
            <Select value={primaryId} onValueChange={setPrimaryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select the style to keep..." />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {candidates.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className="font-medium">{s.ourName}</span>
                    {s.supplyLineName && (
                      <span className="text-orange-500 text-xs ml-1">· {s.supplyLineName}</span>
                    )}
                    {s.color && <span className="text-muted-foreground text-xs ml-1">· {s.color}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Primary card — shown once a primary is selected */}
          {primary && (
            <div className="rounded-lg border bg-green-50 border-green-200 p-3 text-sm">
              <p className="font-medium text-green-700 mb-2">Primary (will receive all SKUs)</p>
              <div className="flex gap-3">
                <StyleImagePreviews style={primary} />
                <div className="min-w-0">
                  <p className="font-semibold">{primary.ourName}</p>
                  {primary.supplyLineName && (
                    <p className="text-xs text-orange-600">{primary.supplyLineName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{[primary.doorStyle, primary.color].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            </div>
          )}

          {/* After-merge preview — what the primary will look like */}
          {primary && copyImages && (duplicate.roomSceneImageUrl || (!primary.doorSampleImageUrl && duplicate.doorSampleImageUrl)) && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-sm">
              <p className="font-medium text-purple-700 mb-2">After merge — primary will have these photos</p>
              <div className="flex gap-3">
                <StyleImagePreviews
                  style={{
                    ...primary,
                    roomSceneImageUrl: duplicate.roomSceneImageUrl || primary.roomSceneImageUrl,
                    doorSampleImageUrl: primary.doorSampleImageUrl || duplicate.doorSampleImageUrl,
                  }}
                />
                <div className="min-w-0 text-xs text-muted-foreground space-y-0.5">
                  {duplicate.roomSceneImageUrl && (
                    <p className="text-purple-700">✓ Room scene copied from duplicate</p>
                  )}
                  {!primary.doorSampleImageUrl && duplicate.doorSampleImageUrl && (
                    <p className="text-purple-700">✓ Door sample copied from duplicate</p>
                  )}
                  {primary.doorSampleImageUrl && (
                    <p>— Door sample kept from primary</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="copyImages"
              checked={copyImages}
              onChange={(e) => setCopyImages(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="copyImages" className="text-sm font-normal cursor-pointer">
              Copy photos from duplicate to primary
              <span className="block text-xs text-muted-foreground mt-0.5">Room scene always copied · Door sample only if primary is missing one</span>
            </Label>
          </div>

          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
            <strong>What happens:</strong> All SKUs from <em>{duplicate.ourName}</em> will be moved to the primary style. The duplicate will be deactivated and hidden from the public catalog. This cannot be undone automatically.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={handleMerge}
            disabled={!primaryId || isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitMerge className="h-4 w-4 mr-2" />}
            Merge Styles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
