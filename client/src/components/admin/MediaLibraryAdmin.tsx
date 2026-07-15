/**
 * MediaLibraryAdmin
 * Shows all image slots across the site (door samples, room scenes, SKU images, etc.)
 * Lets admin browse, search, upload, and re-assign images to missing/broken slots.
 */
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageOff,
  Upload,
  Link2,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type MediaItem = inferRouterOutputs<AppRouter>["mediaLibrary"]["list"]["items"][number];

type SourceType = "all" | "door_sample" | "room_scene" | "sku_image" | "affiliate_gallery" | "corrections";

const SOURCE_LABELS: Record<string, string> = {
  all: "All Photos",
  door_sample: "Door Samples",
  room_scene: "Room Scenes",
  sku_image: "SKU Images",
  affiliate_gallery: "Affiliate Gallery",
  corrections: "Style Corrections",
};

export default function MediaLibraryAdmin() {
  const [sourceType, setSourceType] = useState<SourceType>("all");
  const [search, setSearch] = useState("");
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  // Dialog state for assigning a URL
  const [assignDialog, setAssignDialog] = useState<{ item: MediaItem; mode: "url" | "upload" } | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.mediaLibrary.list.useQuery(
    { sourceType },
    { staleTime: 30_000 }
  );

  const assignMut = trpc.mediaLibrary.assignUrl.useMutation({
    onSuccess: () => {
      toast.success("Image assigned successfully");
      setAssignDialog(null);
      setUrlInput("");
      utils.mediaLibrary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadMut = trpc.mediaLibrary.uploadAndAssign.useMutation({
    onSuccess: (res) => {
      toast.success("Image uploaded and assigned");
      setAssignDialog(null);
      setUploadFile(null);
      setUploadPreview(null);
      utils.mediaLibrary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAssignUrl = () => {
    if (!assignDialog || !urlInput.trim()) return;
    assignMut.mutate({ itemId: assignDialog.item.id, url: urlInput.trim() });
  };

  const handleUpload = useCallback(async () => {
    if (!assignDialog || !uploadFile) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      uploadMut.mutate({
        fileBase64: base64,
        filename: uploadFile.name,
        itemId: assignDialog.item.id,
      });
    };
    reader.readAsDataURL(uploadFile);
  }, [assignDialog, uploadFile, uploadMut]);

  // Filter items
  const items = (data?.items ?? []).filter((item) => {
    if (showMissingOnly && !item.isMissing) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.rowLabel.toLowerCase().includes(q) ||
        item.sourceLabel.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const missingCount = data?.missing ?? 0;
  const totalCount = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Media Library</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${totalCount} image slots — `}
            {!isLoading && missingCount > 0 && (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {missingCount} missing
              </span>
            )}
            {!isLoading && missingCount === 0 && (
              <span className="text-green-600 dark:text-green-400 font-medium">all filled</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(SOURCE_LABELS) as [SourceType, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Button
          variant={showMissingOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowMissingOnly((v) => !v)}
          className="gap-1.5 h-8"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Missing only
          {missingCount > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
              {missingCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No images found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onAssign={(mode) => {
                setAssignDialog({ item, mode });
                setUrlInput(item.url || "");
                setUploadFile(null);
                setUploadPreview(null);
              }}
            />
          ))}
        </div>
      )}

      {/* Assign Dialog */}
      {assignDialog && (
        <Dialog open onOpenChange={() => setAssignDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {assignDialog.item.isMissing ? "Add Missing Photo" : "Replace Photo"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Context info */}
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                <p className="font-medium">{assignDialog.item.rowLabel}</p>
                <p className="text-muted-foreground text-xs">{assignDialog.item.sourceLabel}</p>
              </div>

              {/* Current image preview if exists */}
              {assignDialog.item.url && (
                <div className="rounded-md overflow-hidden border aspect-video bg-muted flex items-center justify-center">
                  <img
                    src={assignDialog.item.url}
                    alt="Current"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* Mode tabs */}
              <div className="flex gap-2">
                <Button
                  variant={assignDialog.mode === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAssignDialog({ ...assignDialog, mode: "url" })}
                  className="gap-1.5"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Paste URL
                </Button>
                <Button
                  variant={assignDialog.mode === "upload" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAssignDialog({ ...assignDialog, mode: "upload" })}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload file
                </Button>
              </div>

              {assignDialog.mode === "url" ? (
                <div className="space-y-2">
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                  {urlInput && (
                    <div className="rounded-md overflow-hidden border aspect-video bg-muted flex items-center justify-center">
                      <img
                        src={urlInput}
                        alt="Preview"
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {uploadPreview ? (
                    <div className="relative rounded-md overflow-hidden border aspect-video bg-muted flex items-center justify-center">
                      <img
                        src={uploadPreview}
                        alt="Upload preview"
                        className="max-h-full max-w-full object-contain"
                      />
                      <button
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        onClick={() => { setUploadFile(null); setUploadPreview(null); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full border-2 border-dashed rounded-md py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6" />
                      <span className="text-sm">Click to choose a file</span>
                      <span className="text-xs">JPG, PNG, or WebP</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialog(null)}>
                Cancel
              </Button>
              {assignDialog.mode === "url" ? (
                <Button
                  onClick={handleAssignUrl}
                  disabled={!urlInput.trim() || assignMut.isPending}
                >
                  {assignMut.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Save
                </Button>
              ) : (
                <Button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploadMut.isPending}
                >
                  {uploadMut.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Upload & Save
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Individual card ────────────────────────────────────────────────────────────

function MediaCard({
  item,
  onAssign,
}: {
  item: MediaItem;
  onAssign: (mode: "url" | "upload") => void;
}) {
  const [imgError, setImgError] = useState(false);
  const isBroken = item.url && imgError;
  const isEmpty = !item.url;

  return (
    <div
      className={`group relative rounded-lg border overflow-hidden flex flex-col bg-card transition-shadow hover:shadow-md cursor-pointer ${
        isEmpty || isBroken
          ? "border-orange-300 dark:border-orange-700"
          : "border-border"
      }`}
      onClick={() => onAssign(isEmpty ? "upload" : "url")}
      title={item.rowLabel}
    >
      {/* Image area */}
      <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
        {isEmpty || isBroken ? (
          <div className="flex flex-col items-center gap-1.5 text-orange-500 dark:text-orange-400 p-2 text-center">
            <ImageOff className="h-7 w-7" />
            <span className="text-[10px] font-medium leading-tight">
              {isEmpty ? "Missing photo" : "Broken link"}
            </span>
          </div>
        ) : (
          <img
            src={item.url}
            alt={item.rowLabel}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex gap-1.5">
            <button
              className="rounded-full bg-white/90 p-1.5 text-gray-800 hover:bg-white shadow"
              onClick={(e) => { e.stopPropagation(); onAssign("upload"); }}
              title="Upload new photo"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              className="rounded-full bg-white/90 p-1.5 text-gray-800 hover:bg-white shadow"
              onClick={(e) => { e.stopPropagation(); onAssign("url"); }}
              title="Paste URL"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            {item.url && !isBroken && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/90 p-1.5 text-gray-800 hover:bg-white shadow"
                onClick={(e) => e.stopPropagation()}
                title="Open full size"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="px-2 py-1.5 space-y-0.5 flex-1">
        <p className="text-[11px] font-medium leading-tight line-clamp-2">{item.rowLabel}</p>
        <p className="text-[10px] text-muted-foreground">{item.sourceLabel}</p>
      </div>

      {/* Status badge */}
      {(isEmpty || isBroken) && (
        <div className="absolute top-1 right-1">
          <span className="rounded-full bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5">
            {isEmpty ? "MISSING" : "BROKEN"}
          </span>
        </div>
      )}
    </div>
  );
}
