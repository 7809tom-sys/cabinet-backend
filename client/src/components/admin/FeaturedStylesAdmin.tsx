import { useMemo, useState } from "react";
import {
  Star, Search, GripVertical, ArrowUp, ArrowDown, X,
  AlertTriangle, CheckCircle2, Pencil, RotateCcw,
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
}

function thumb(s: AdminStyle): string | null {
  return s.thumbnailImageUrl || s.doorSampleImageUrl || s.roomSceneImageUrl || null;
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
  };

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

          {/* Image URLs */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Image URLs</Label>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="ed-door-img" className="text-xs text-muted-foreground">Door Sample Image</Label>
                <Input
                  id="ed-door-img"
                  value={doorSampleImageUrl}
                  onChange={(e) => setDoorSampleImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed-thumb-img" className="text-xs text-muted-foreground">Thumbnail Image</Label>
                <Input
                  id="ed-thumb-img"
                  value={thumbnailImageUrl}
                  onChange={(e) => setThumbnailImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed-room-img" className="text-xs text-muted-foreground">Room Scene Image</Label>
                <Input
                  id="ed-room-img"
                  value={roomSceneImageUrl}
                  onChange={(e) => setRoomSceneImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {(doorSampleImageUrl || thumbnailImageUrl) && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <img
                src={doorSampleImageUrl || thumbnailImageUrl}
                alt="Preview"
                className="h-28 w-auto rounded-lg object-cover border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function FeaturedStylesAdmin() {
  const [search, setSearch] = useState("");
  const [editingStyle, setEditingStyle] = useState<AdminStyle | null>(null);
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

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return styles
      .filter((s) => !s.isFeatured)
      .filter((s) =>
        q
          ? `${s.ourName} ${s.doorStyle ?? ""} ${s.color ?? ""} ${s.finish ?? ""}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => a.ourName.localeCompare(b.ourName));
  }, [styles, search]);

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
            Choose the door styles to push at the top of the Door Styles page. Click the{" "}
            <Pencil className="inline h-3.5 w-3.5" /> pencil on any featured style to edit its
            public label, color, finish, images, and more.
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

      {/* Available list */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add a style
          </h3>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search door styles…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching styles.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {available.map((s) => (
              <button
                key={s.id}
                onClick={() => add(s)}
                disabled={atCap || setFeatured.isPending}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-left hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {thumb(s) ? (
                  <img
                    src={thumb(s)!}
                    alt={s.ourName}
                    className="h-11 w-11 rounded object-cover ring-1 ring-border shrink-0"
                  />
                ) : (
                  <div className="h-11 w-11 rounded bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.ourName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.doorStyle, s.color].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Star className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>
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
    </div>
  );
}
