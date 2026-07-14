import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Palette, ArrowRight, ChevronLeft, ChevronRight, ImageIcon, Maximize2,
  Pencil, Star, StarOff, Save, X, Upload as UploadIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/_core/hooks/useAuth";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import DoorPhotoMatchWidget from "@/components/DoorPhotoMatchWidget";
import { styleDisplayName } from "@/lib/styleDisplayName";
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// ─── Style card ───────────────────────────────────────────────────────────────
interface DoorStyle {
  id: number;
  styleCode: string;
  ourName: string | null;
  aliasName?: string | null;
  featuredLabel?: string | null;
  featuredRank?: number | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  color: string | null;
  finish: string | null;
  hardware?: string | null;
  isBuilderGrade?: boolean | null;
  thumbnailImageUrl: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
}

/** Returns the public-facing display name */
function displayName(style: DoorStyle): string {
  return styleDisplayName(style) || style.styleCode;
}

// ─── Admin inline edit panel (shown inside the detail dialog) ─────────────────
function AdminEditPanel({ style, onSaved }: { style: DoorStyle; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [ourName, setOurName] = useState(style.ourName ?? "");
  const [aliasName, setAliasName] = useState(style.aliasName ?? "");
  const [featuredLabel, setFeaturedLabel] = useState(style.featuredLabel ?? "");
  const [doorStyle, setDoorStyle] = useState(style.doorStyle ?? "");
  const [finish, setFinish] = useState(style.finish ?? "");
  const [woodSpecies, setWoodSpecies] = useState(style.woodSpecies ?? "");
  const [color, setColor] = useState(style.color ?? "");
  const [hardware, setHardware] = useState(style.hardware ?? "");

  // Image upload state
  const roomSceneRef = useRef<HTMLInputElement>(null);
  const doorSampleRef = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const uploadMut = trpc.doorStyles.adminUploadDoorStyleImage.useMutation();
  const updateMut = trpc.doorStyles.adminUpdateDoorStyle.useMutation({
    onSuccess: () => {
      toast.success("Door style updated.");
      utils.doorStyles.list.invalidate();
      utils.doorStyles.featured.invalidate();
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  // Featured toggle (star/unstar)
  const isFeatured = Boolean(style.featuredRank && style.featuredRank > 0);
  const featureMut = trpc.doorStyles.setFeatured.useMutation({
    onSuccess: () => {
      utils.doorStyles.list.invalidate();
      utils.doorStyles.featured.invalidate();
      toast.success(isFeatured ? "Removed from featured." : "Added to featured.");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  async function uploadImage(
    file: File,
    field: "roomSceneImageUrl" | "doorSampleImageUrl" | "thumbnailImageUrl"
  ) {
    setUploadingField(field);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = () => res(String(reader.result));
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadMut.mutateAsync({
        filename: file.name,
        dataBase64: dataUrl,
        contentType: file.type || "image/jpeg",
      });
      await updateMut.mutateAsync({ id: style.id, [field]: url });
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  function handleSave() {
    updateMut.mutate({
      id: style.id,
      ourName: ourName.trim() || style.ourName || style.styleCode,
      aliasName: aliasName.trim() || null,
      featuredLabel: featuredLabel.trim() || null,
      doorStyle: doorStyle.trim() || null,
      finish: finish.trim() || null,
      woodSpecies: woodSpecies.trim() || null,
      color: color.trim() || null,
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 pt-1 border-t border-border mt-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit style
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs ${isFeatured ? "text-amber-600 border-amber-300" : ""}`}
          disabled={featureMut.isPending}
          onClick={() =>
            featureMut.mutate({ id: style.id, featured: !isFeatured })
          }
        >
          {featureMut.isPending ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : isFeatured ? (
            <StarOff className="h-3.5 w-3.5" />
          ) : (
            <Star className="h-3.5 w-3.5" />
          )}
          {isFeatured ? "Remove from featured" : "Add to featured"}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-border mt-2 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Admin — Edit door style
        </p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <Label className="text-xs">Display name</Label>
          <Input value={ourName} onChange={(e) => setOurName(e.target.value)} className="h-7 text-xs mt-0.5" />
        </div>
        <div>
          <Label className="text-xs">Alias / white-label name</Label>
          <Input value={aliasName} onChange={(e) => setAliasName(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="Optional override" />
        </div>
        <div>
          <Label className="text-xs">Featured label</Label>
          <Input value={featuredLabel} onChange={(e) => setFeaturedLabel(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. Best Seller" />
        </div>
        <div>
          <Label className="text-xs">Door style type</Label>
          <Input value={doorStyle} onChange={(e) => setDoorStyle(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. Shaker" />
        </div>
        <div>
          <Label className="text-xs">Finish</Label>
          <Input value={finish} onChange={(e) => setFinish(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. Painted White" />
        </div>
        <div>
          <Label className="text-xs">Wood species</Label>
          <Input value={woodSpecies} onChange={(e) => setWoodSpecies(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. Maple" />
        </div>
        <div>
          <Label className="text-xs">Color</Label>
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. White" />
        </div>
        <div>
          <Label className="text-xs">Hardware</Label>
          <Input value={hardware} onChange={(e) => setHardware(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="e.g. Soft-close" />
        </div>
      </div>

      {/* Image upload buttons */}
      <div className="flex flex-wrap gap-2">
        <input ref={roomSceneRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "roomSceneImageUrl"); e.target.value = ""; }} />
        <input ref={doorSampleRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "doorSampleImageUrl"); e.target.value = ""; }} />
        <input ref={thumbnailRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "thumbnailImageUrl"); e.target.value = ""; }} />

        {(["roomSceneImageUrl", "doorSampleImageUrl", "thumbnailImageUrl"] as const).map((field) => {
          const labels: Record<string, string> = {
            roomSceneImageUrl: "Room scene",
            doorSampleImageUrl: "Door sample",
            thumbnailImageUrl: "Thumbnail",
          };
          const refs = { roomSceneImageUrl: roomSceneRef, doorSampleImageUrl: doorSampleRef, thumbnailImageUrl: thumbnailRef };
          return (
            <Button
              key={field}
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1"
              disabled={uploadingField !== null}
              onClick={() => refs[field].current?.click()}
            >
              {uploadingField === field ? <Spinner className="h-3 w-3" /> : <UploadIcon className="h-3 w-3" />}
              {labels[field]}
            </Button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="text-xs h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={updateMut.isPending}
          onClick={handleSave}
        >
          {updateMut.isPending ? <Spinner className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          Save changes
        </Button>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Style card ───────────────────────────────────────────────────────────────
function StyleCard({ style, isAdmin }: { style: DoorStyle; isAdmin: boolean }) {
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  const [showDoor, setShowDoor] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [doorFailed, setDoorFailed] = useState(false);
  const [localStyle, setLocalStyle] = useState(style);
  const isFeatCard = Boolean(localStyle.featuredRank && localStyle.featuredRank > 0);
  const featureCardMut = trpc.doorStyles.setFeatured.useMutation({
    onSuccess: () => {
      // Optimistically flip the local featured state; list invalidation will sync
      setLocalStyle((prev) => ({ ...prev, featuredRank: isFeatCard ? null : 9999 }));
      utils.doorStyles.list.invalidate();
      utils.doorStyles.featured.invalidate();
      toast.success(isFeatCard ? "Removed from featured" : "Added to featured");
    },
    onError: (e) => toast.error(e.message),
  });
  const roomScene = localStyle.roomSceneImageUrl;
  const doorSample = localStyle.doorSampleImageUrl;
  const heroSrc = showDoor
    ? (doorSample && !doorFailed ? doorSample : null)
    : (roomScene && !sceneFailed ? roomScene : null);

  // Sync if parent data refreshes
  useEffect(() => { setLocalStyle(style); }, [style]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
          className="cabinet-card group relative rounded-xl border border-border bg-card text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          <div className="h-28 flex items-center justify-center border-b border-border overflow-hidden relative bg-gradient-to-b from-muted/40 to-muted/70">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={showDoor ? `${localStyle.ourName || localStyle.styleCode} door sample` : `${localStyle.ourName || localStyle.styleCode} kitchen`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={() => showDoor ? setDoorFailed(true) : setSceneFailed(true)}
              />
            ) : (
              <DoorStyleSwatch
                style={localStyle}
                className="relative h-32 w-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDoor((v) => !v); }}
              className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-md transition-colors z-10 ${
                showDoor ? "border-white bg-white text-foreground" : "border-white/80 bg-black/40 text-white hover:bg-black/60"
              }`}
              title={showDoor ? "Show room scene" : "View door close-up"}
            >
              {showDoor ? <Maximize2 className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            </button>
            <span className="absolute bottom-2 left-2 text-[10px] font-medium text-white/90 bg-black/50 px-1.5 py-0.5 rounded-full">
              {showDoor ? "Door" : "Room"}
            </span>
            {/* Admin quick-feature button — one-click star/unstar */}
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  featureCardMut.mutate({ id: localStyle.id, featured: !isFeatCard });
                }}
                disabled={featureCardMut.isPending}
                title={isFeatCard ? "Remove from featured" : "Feature this style"}
                className={`absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-colors ${
                  isFeatCard
                    ? "bg-amber-400/90 hover:bg-amber-500/90"
                    : "bg-black/40 hover:bg-black/60"
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${
                  isFeatCard ? "text-white fill-white" : "text-amber-300"
                }`} />
              </button>
            )}
          </div>

          {localStyle.isBuilderGrade && (
            <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wide text-amber-950 bg-amber-300/95 px-2 py-0.5 rounded-full shadow-sm">
              {t("ds_builder_grade")}
            </span>
          )}

          <div className="p-2">
            <div className="flex items-start justify-between gap-1 mb-0.5">
              <p className="font-semibold text-xs text-foreground leading-snug">
                {displayName(localStyle)}
              </p>
              {localStyle.doorStyle && (
                <Badge variant="outline" className="text-xs shrink-0">{localStyle.doorStyle}</Badge>
              )}
            </div>
            <div className="mt-0 space-y-0">
              {localStyle.color && (
                <p className="text-[10px] text-muted-foreground truncate">{localStyle.color}</p>
              )}
            </div>
          </div>

          {(localStyle.woodSpecies || localStyle.finish) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 ease-out z-20 bg-popover/95 backdrop-blur-sm border-t border-border px-2.5 py-2 rounded-b-xl">
              <div className="space-y-0.5">
                {localStyle.woodSpecies && (
                  <p className="text-[10px] text-popover-foreground">
                    <span className="text-muted-foreground">Wood:</span> {localStyle.woodSpecies}
                  </p>
                )}
                {localStyle.finish && (
                  <p className="text-[10px] text-popover-foreground">
                    <span className="text-muted-foreground">Finish:</span> {localStyle.finish}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {displayName(localStyle)}
            {localStyle.doorStyle && (
              <Badge variant="outline" className="text-xs">{localStyle.doorStyle}</Badge>
            )}
            {localStyle.isBuilderGrade && (
              <Badge className="text-xs bg-amber-300 text-amber-950 hover:bg-amber-300">{t("ds_builder_grade")}</Badge>
            )}
            {localStyle.featuredLabel && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{localStyle.featuredLabel}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg overflow-hidden border border-border bg-gradient-to-b from-muted/40 to-muted/70 flex items-center justify-center" style={{ height: '200px', minHeight: '120px', maxHeight: '200px' }}>
          {doorSample && !doorFailed ? (
            <img
              src={doorSample}
              alt={`${localStyle.ourName || localStyle.styleCode} door sample`}
              className="max-w-full object-contain block"
              style={{ maxHeight: '200px', width: 'auto', height: '100%' }}
              onError={() => setDoorFailed(true)}
            />
          ) : (
            <DoorStyleSwatch style={localStyle} className="h-40 w-auto" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <DoorStyleSwatch style={localStyle} className="h-12 w-auto" />
            <div className="text-xs text-muted-foreground">{t("ds_true_color")}</div>
          </div>
          <div className="space-y-0.5">
            {localStyle.doorStyle && <p className="text-xs"><span className="text-muted-foreground">{t("ds_style")}:</span> {localStyle.doorStyle}</p>}
            {localStyle.woodSpecies && <p className="text-xs"><span className="text-muted-foreground">{t("ds_wood")}:</span> {localStyle.woodSpecies}</p>}
            {localStyle.finish && <p className="text-xs"><span className="text-muted-foreground">{t("ds_finish")}:</span> {localStyle.finish}</p>}
            {localStyle.color && <p className="text-xs"><span className="text-muted-foreground">{t("ds_color")}:</span> {localStyle.color}</p>}
            {localStyle.hardware && <p className="text-xs"><span className="text-muted-foreground">{t("ds_hardware")}:</span> {localStyle.hardware}</p>}
          </div>
        </div>

        {localStyle.isBuilderGrade && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("ds_builder_grade_note")}
          </div>
        )}

        <Link href={`/family/${encodeURIComponent(localStyle.styleCode)}`}>
          <Button className="w-full mt-1" size="lg">
            {t("ds_shop_collection", { name: displayName(localStyle) })}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>

        {/* Admin inline edit panel — only visible to admins */}
        {isAdmin && (
          <AdminEditPanel
            style={localStyle}
            onSaved={() => {
              // The mutations already invalidate the list query; local state
              // will update on the next render via the useEffect above.
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Door Styles page ────────────────────────────────────────────────────
export default function DoorStyles() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_styles_t"), description: t("seo_styles_d"), lang });
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const initialType = (() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("door");
    return p && p.trim() ? p.trim() : null;
  })();
  const [selectedType, setSelectedType] = useState<string | null>(initialType);
  const isMobile = useIsMobile();
  const PER_PAGE = 16;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [selectedType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedType) url.searchParams.set("door", selectedType);
    else url.searchParams.delete("door");
    window.history.replaceState({}, "", url.toString());
  }, [selectedType]);

  const { data: styles, isLoading } = trpc.doorStyles.list.useQuery();
  const { data: featuredData } = trpc.doorStyles.featured.useQuery();

  const uniqueStyles = useMemo(() => {
    const map = new Map<string, DoorStyle>();
    for (const s of (styles ?? []) as DoorStyle[]) {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.ourName || "").localeCompare(b.ourName || "")
    );
  }, [styles]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of uniqueStyles) if (s.doorStyle) set.add(s.doorStyle);
    return Array.from(set).sort();
  }, [uniqueStyles]);

  const featuredNames = useMemo(() => {
    const names = new Map<string, number>();
    ((featuredData ?? []) as DoorStyle[]).forEach((s, i) => {
      const key = (s.ourName || s.styleCode || String(s.id)).toLowerCase();
      if (!names.has(key)) names.set(key, i);
    });
    return names;
  }, [featuredData]);

  const isFeatured = (s: DoorStyle) =>
    featuredNames.has((s.ourName || s.styleCode || String(s.id)).toLowerCase());

  const featured = useMemo(
    () =>
      uniqueStyles
        .filter(isFeatured)
        .sort(
          (a, b) =>
            (featuredNames.get((a.ourName || a.styleCode || String(a.id)).toLowerCase()) ?? 0) -
            (featuredNames.get((b.ourName || b.styleCode || String(b.id)).toLowerCase()) ?? 0)
        )
        .slice(0, 30),
    [uniqueStyles, featuredNames]
  );

  const visible = selectedType
    ? uniqueStyles.filter((s) => s.doorStyle === selectedType)
    : uniqueStyles;

  const showFeatured = !selectedType && featured.length > 0;
  const gridStyles = showFeatured
    ? visible.filter((s) => !isFeatured(s))
    : visible;

  const paginate = !isMobile;
  const pageCount = paginate ? Math.max(1, Math.ceil(gridStyles.length / PER_PAGE)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pagedStyles = paginate
    ? gridStyles.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)
    : gridStyles;

  return (
    <div className="container py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="font-serif text-xl font-bold text-foreground leading-tight">
            {t("ds_title")}
          </h1>
          <p className="text-xs text-muted-foreground">{t("ds_sub")}</p>
        </div>
        <div className="shrink-0">
          <DoorPhotoMatchWidget compact />
        </div>
      </div>

      {/* Admin mode indicator */}
      {isAdmin && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Admin mode:</strong> Click any style card to open its detail view, then use the{" "}
            <strong>Edit style</strong> button to change name, images, finish, wood species, and more.
            Use the <strong>star button</strong> to feature or unfeature a style.
          </span>
        </div>
      )}

      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedType === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("ds_all_styles")}
          </button>
          {types.map((doorType) => (
            <button
              key={doorType}
              onClick={() => setSelectedType(doorType)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedType === doorType
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {doorType}
            </button>
          ))}
        </div>
      )}

      {!isLoading && showFeatured && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-serif text-sm font-bold text-foreground">{t("ds_featured")}</h2>
            <Badge className="bg-primary text-primary-foreground text-[10px] py-0">{t("ds_editors_picks")}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {featured.map((style) => (
              <StyleCard key={style.id} style={style} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && showFeatured && gridStyles.length > 0 && (
        <h2 className="font-serif text-sm font-bold text-foreground mb-2">{t("ds_all_door_styles")}</h2>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-28 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Palette className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("ds_none")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {pagedStyles.map((style) => (
              <StyleCard key={style.id} style={style} isAdmin={isAdmin} />
            ))}
          </div>

          {paginate && pageCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("ds_prev")}
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("ds_page_of", { page: String(safePage + 1), total: String(pageCount) })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => {
                  setPage((p) => Math.min(pageCount - 1, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {t("ds_next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
