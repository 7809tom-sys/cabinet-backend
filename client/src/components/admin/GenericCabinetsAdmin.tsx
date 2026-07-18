/**
 * Generic Cabinets Admin
 *
 * Master catalog management screen:
 * - Card grid showing each cabinet's catalog illustration, master code, aliases,
 *   stain color, construction method, description, W×H×D, weight, category
 * - Inline editing for all fields
 * - Catalog photo upload
 * - Distributor coverage panel (which distributors carry it + their zip codes)
 * - Distributor warehouse zip manager
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pencil,
  Check,
  X,
  Upload,
  Search,
  MapPin,
  Package,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type CabinetRow = {
  id: number;
  masterCode: string;
  description: string;
  category: string;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  weight: string | null;
  catalogImageUrl: string | null;
  sku: string | null;
  vendorSku: string | null;
  altSku1: string | null;
  altSku2: string | null;
  altSku3: string | null;
  stainColor: string | null;
  constructionMethod: string | null;
  conflictStatus: string;
  showInDesigner: boolean;
  showInCatalog: boolean;
  isActive: boolean;
};

// ─── Inline editable field ────────────────────────────────────────────────────
function EditableField({
  value,
  onSave,
  placeholder,
  multiline = false,
  className,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    onSave(draft.trim() || null);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className={cn(
          "group flex items-start gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors",
          className
        )}
        onClick={() => setEditing(true)}
      >
        <span className={cn("flex-1 min-w-0", !value && "text-muted-foreground italic text-xs")}>
          {value || placeholder || "—"}
        </span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 mt-0.5 shrink-0" />
      </span>
    );
  }

  return (
    <span className="flex items-start gap-1">
      {multiline ? (
        <textarea
          autoFocus
          className="flex-1 text-sm border rounded px-2 py-1 resize-none min-h-[60px] w-full"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        />
      ) : (
        <input
          autoFocus
          className="flex-1 text-sm border rounded px-2 py-1 w-full"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
      )}
      <button onClick={commit} className="text-green-600 hover:text-green-700 mt-1">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={cancel} className="text-red-500 hover:text-red-600 mt-1">
        <X className="h-4 w-4" />
      </button>
    </span>
  );
}

// ─── Distributor Coverage Dialog ──────────────────────────────────────────────
function DistributorCoverageDialog({
  cabinet,
  onClose,
}: {
  cabinet: CabinetRow;
  onClose: () => void;
}) {
  const { data: coverage, isLoading } = trpc.genericCabinets.distributorCoverage.useQuery({
    cabinetId: cabinet.id,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {cabinet.masterCode} — Distributor Coverage
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !coverage?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No distributors carry this cabinet.
          </p>
        ) : (
          <div className="space-y-3">
            {coverage.map((d) => (
              <div key={d.distributorId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{d.name}</span>
                  <Badge variant="secondary">{d.skuCount} SKUs</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.warehouseZips.length > 0 ? (
                    d.warehouseZips.map((zip) => (
                      <span
                        key={zip}
                        className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5"
                      >
                        <MapPin className="h-3 w-3" />
                        {zip}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No zip codes set</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Distributor Zip Manager Dialog ───────────────────────────────────────────
function DistributorZipManagerDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: distributors, isLoading } = trpc.genericCabinets.distributorZips.useQuery();
  const updateZips = trpc.genericCabinets.updateDistributorZips.useMutation({
    onSuccess: () => {
      utils.genericCabinets.distributorZips.invalidate();
      toast.success("Zip codes updated");
    },
    onError: () => toast.error("Failed to update zip codes"),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftZips, setDraftZips] = useState<string[]>([]);
  const [newZip, setNewZip] = useState("");

  const startEdit = (id: number, zips: string[]) => {
    setEditingId(id);
    setDraftZips([...zips]);
    setNewZip("");
  };

  const addZip = () => {
    const z = newZip.trim();
    if (!z || draftZips.includes(z)) return;
    setDraftZips((prev) => [...prev, z]);
    setNewZip("");
  };

  const removeZip = (zip: string) => {
    setDraftZips((prev) => prev.filter((z) => z !== zip));
  };

  const saveZips = (distributorId: number) => {
    updateZips.mutate({ distributorId, warehouseZips: draftZips });
    setEditingId(null);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Distributor Warehouse Zip Codes
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4">
            {distributors?.map((d) => (
              <div key={d.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold">{d.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({d.code})</span>
                  </div>
                  {editingId !== d.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(d.id, d.warehouseZips)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>

                {editingId === d.id ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {draftZips.map((zip) => (
                        <span
                          key={zip}
                          className="inline-flex items-center gap-1 bg-muted rounded-full px-3 py-1 text-sm"
                        >
                          <MapPin className="h-3 w-3" />
                          {zip}
                          <button
                            onClick={() => removeZip(zip)}
                            className="text-muted-foreground hover:text-red-500 ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {draftZips.length === 0 && (
                        <span className="text-sm text-muted-foreground italic">No zip codes</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add zip code (e.g. 30301)"
                        value={newZip}
                        onChange={(e) => setNewZip(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addZip()}
                        className="max-w-[200px]"
                      />
                      <Button variant="outline" size="sm" onClick={addZip}>
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveZips(d.id)}
                        disabled={updateZips.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {d.warehouseZips.length > 0 ? (
                      d.warehouseZips.map((zip) => (
                        <span
                          key={zip}
                          className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5"
                        >
                          <MapPin className="h-3 w-3" />
                          {zip}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No zip codes — click Edit to add
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Cabinet Card ─────────────────────────────────────────────────────────────
function CabinetCard({ cabinet }: { cabinet: CabinetRow }) {
  const utils = trpc.useUtils();
  const updateMut = trpc.genericCabinets.update.useMutation({
    onSuccess: () => utils.genericCabinets.list.invalidate(),
    onError: () => toast.error("Failed to save"),
  });
  const uploadImageMut = trpc.genericCabinets.uploadCatalogImage.useMutation({
    onSuccess: () => utils.genericCabinets.list.invalidate(),
    onError: () => toast.error("Image upload failed"),
  });
  const [showCoverage, setShowCoverage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (fields: Partial<CabinetRow>) => {
    updateMut.mutate({ id: cabinet.id, ...fields } as Parameters<typeof updateMut.mutate>[0]);
  };

  const aliases = [
    cabinet.sku,
    cabinet.vendorSku,
    cabinet.altSku1,
    cabinet.altSku2,
    cabinet.altSku3,
  ].filter(Boolean) as string[];

  return (
    <>
      {showCoverage && (
        <DistributorCoverageDialog cabinet={cabinet} onClose={() => setShowCoverage(false)} />
      )}
      <div className="border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow">
        {/* Catalog illustration */}
        <div className="relative bg-muted/30 flex items-center justify-center h-44 border-b">
          {cabinet.catalogImageUrl ? (
            <img
              src={cabinet.catalogImageUrl}
              alt={cabinet.masterCode}
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Package className="h-10 w-10 opacity-30" />
              <span className="text-xs">No illustration</span>
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-2 right-2 bg-background/80 hover:bg-background border rounded-lg px-2 py-1 text-xs flex items-center gap-1 shadow-sm"
          >
            <Upload className="h-3 w-3" />
            Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const toastId = toast.loading("Uploading image…");
              try {
                const reader = new FileReader();
                reader.onload = async () => {
                  const base64 = (reader.result as string).split(",")[1];
                  await uploadImageMut.mutateAsync({
                    cabinetId: cabinet.id,
                    fileBase64: base64,
                    mimeType: file.type || "image/jpeg",
                  });
                  toast.success("Image updated", { id: toastId });
                };
                reader.onerror = () => toast.error("Upload failed", { id: toastId });
                reader.readAsDataURL(file);
              } catch {
                toast.error("Upload failed", { id: toastId });
              }
            }}
          />
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Master code + category */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-mono font-bold text-base">{cabinet.masterCode}</span>
              <div className="flex gap-1 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs">{cabinet.category}</Badge>
                {cabinet.subCategory && (
                  <Badge variant="secondary" className="text-xs">{cabinet.subCategory}</Badge>
                )}
                {!cabinet.isActive && (
                  <Badge variant="destructive" className="text-xs">Inactive</Badge>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowCoverage(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border rounded px-2 py-1 shrink-0"
              title="View distributor coverage"
            >
              <Building2 className="h-3 w-3" />
              Distributors
            </button>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Description
            </label>
            <div className="mt-0.5 text-sm">
              <EditableField
                value={cabinet.description}
                onSave={(v) => save({ description: v ?? "" })}
                placeholder="No description"
                multiline
              />
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-4 gap-2">
            {(["width", "height", "depth", "weight"] as const).map((dim) => (
              <div key={dim}>
                <label className="text-xs text-muted-foreground uppercase tracking-wide block">
                  {dim === "weight" ? "Wt (lb)" : dim.charAt(0).toUpperCase() + dim.slice(1) + '"'}
                </label>
                <EditableField
                  value={cabinet[dim]}
                  onSave={(v) => save({ [dim]: v })}
                  placeholder="—"
                  className="text-sm font-mono"
                />
              </div>
            ))}
          </div>

          {/* Stain color + construction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Stain Color (SW)
              </label>
              <EditableField
                value={cabinet.stainColor}
                onSave={(v) => save({ stainColor: v })}
                placeholder="e.g. SW 7015"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Construction
              </label>
              <EditableField
                value={cabinet.constructionMethod}
                onSave={(v) => save({ constructionMethod: v })}
                placeholder="e.g. Framed, plywood"
                className="text-sm"
              />
            </div>
          </div>

          {/* Aliases */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Aliases
            </label>
            <div className="mt-1 space-y-1">
              {(
                [
                  ["SKU", "sku"],
                  ["Vendor SKU", "vendorSku"],
                  ["Alt 1", "altSku1"],
                  ["Alt 2", "altSku2"],
                  ["Alt 3", "altSku3"],
                ] as [string, keyof CabinetRow][]
              ).map(([label, field]) => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
                  <EditableField
                    value={cabinet[field] as string | null}
                    onSave={(v) => save({ [field]: v } as Partial<CabinetRow>)}
                    placeholder="—"
                    className="text-xs font-mono flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GenericCabinetsAdmin() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [subCategory, setSubCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showZipManager, setShowZipManager] = useState(false);
  const PAGE_SIZE = 24;

  const { data, isLoading } = trpc.genericCabinets.list.useQuery(
    {
      search: search || undefined,
      category: category !== "all" ? category : undefined,
      subCategory: subCategory !== "all" ? subCategory : undefined,
      page,
      pageSize: PAGE_SIZE,
    },
  );

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {showZipManager && (
        <DistributorZipManagerDialog onClose={() => setShowZipManager(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Generic Cabinet Catalog</h2>
          <p className="text-sm text-muted-foreground">
            Master cabinet codes with aliases, dimensions, stain colors, and distributor coverage
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowZipManager(true)}>
          <MapPin className="h-4 w-4 mr-2" />
          Manage Distributor Zips
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code, description, or alias…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setSubCategory("all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {data?.categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={subCategory}
          onValueChange={(v) => {
            setSubCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All sub-categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sub-categories</SelectItem>
            {data?.subCategories.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-muted-foreground ml-auto">
            {data.total.toLocaleString()} cabinets
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.rows.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No cabinets found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.rows.map((cab) => (
            <CabinetCard key={cab.id} cabinet={cab} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
