import { useMemo, useState } from "react";
import { Star, Search, GripVertical, ArrowUp, ArrowDown, X, AlertTriangle, CheckCircle2, Pencil, Check, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import DoorPhotoCorrectButton from "./DoorPhotoCorrectButton";

const MAX_FEATURED = 30;

interface AdminStyle {
  id: number;
  ourName: string;
  featuredLabel: string | null;
  doorStyle: string | null;
  color: string | null;
  finish: string | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  doorSampleVerified: boolean;
  roomSceneImageUrl: string | null;
  isFeatured: boolean;
  featuredRank: number;
}

function thumb(s: AdminStyle): string | null {
  return s.thumbnailImageUrl || s.doorSampleImageUrl || s.roomSceneImageUrl || null;
}

/** Inline label editor for a single featured style row */
function LabelEditor({ style, onSaved }: { style: AdminStyle; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(style.featuredLabel ?? "");

  const setLabel = trpc.doorStyles.setFeaturedLabel.useMutation({
    onSuccess: () => {
      toast.success("Label updated");
      onSaved();
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function save() {
    setLabel.mutate({ id: style.id, label: draft.trim() || null });
  }

  function clear() {
    setLabel.mutate({ id: style.id, label: null });
    setDraft("");
  }

  const displayLabel = style.featuredLabel || style.ourName;
  const hasCustomLabel = !!style.featuredLabel;

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={style.ourName}
          className="h-7 text-xs py-0 px-2 w-36"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
          onClick={save}
          disabled={setLabel.isPending}
          aria-label="Save label"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-0.5">
      <span className={`text-xs truncate max-w-[120px] ${hasCustomLabel ? "text-primary font-medium" : "text-muted-foreground"}`}>
        {hasCustomLabel ? displayLabel : <span className="italic">{displayLabel}</span>}
      </span>
      <button
        onClick={() => { setDraft(style.featuredLabel ?? ""); setEditing(true); }}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Edit public label"
        aria-label="Edit public label"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {hasCustomLabel && (
        <button
          onClick={clear}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Reset to default name"
          aria-label="Reset label to default"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function FeaturedStylesAdmin() {
  const [search, setSearch] = useState("");
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
            Choose the door styles to push at the top of the Door Styles page. These are what
            shoppers and affiliates see first — your 80/20 winners. Drag the order with the arrows;
            top of the list shows first.
          </p>
          <p className="text-muted-foreground text-xs mt-1 max-w-2xl">
            Each style has a <span className="font-medium text-foreground">Public Label</span> — the
            name customers see. Click the <Pencil className="inline h-3 w-3" /> pencil to override
            it with a white-label name. Leave it blank to use the default internal name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          {unverifiedCount > 0 && (
            <Badge variant="outline" className="text-sm border-amber-500 text-amber-600 bg-amber-50">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              {unverifiedCount} need correct photo
            </Badge>
          )}
          <Badge
            variant={atCap ? "destructive" : "secondary"}
            className="text-sm"
          >
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
                  <p className="font-medium text-sm truncate flex items-center gap-1.5">
                    {s.ourName}
                    {s.doorSampleVerified ? (
                      <span
                        title="Sample photo verified"
                        aria-label="Sample photo verified"
                        className="inline-flex items-center text-emerald-600"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    ) : (
                      <span
                        title="Unverified door — confirm this is the correct door or upload the correct photo"
                        aria-label="Unverified door photo"
                        className="inline-flex items-center text-amber-600"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    )}
                  </p>
                  {/* Public label editor */}
                  <LabelEditor style={s} onSaved={invalidateAll} />
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[s.doorStyle, s.color].filter(Boolean).join(" · ")}
                    {!s.doorSampleVerified && (
                      <span className="ml-1 text-amber-600 font-medium">· Wrong door? Upload the correct photo</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
    </div>
  );
}
