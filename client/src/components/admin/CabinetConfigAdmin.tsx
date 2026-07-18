import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, ChevronLeft, ChevronRight, Settings2, CheckCircle2, Upload, ImageIcon, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────
const STANDARD_DEPTHS = ["9", "12", "15", "18", "21", "24", "27", "30", "33", "36"];
const DOOR_OPTIONS = [null, 0, 1, 2] as const;
const DRAWER_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const SHELF_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6] as const;
const PAGE_SIZE = 50;

type CabinetRow = {
  id: number;
  masterCode: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  numberOfFixedShelves: number | null;
  numberOfAdjShelves: number | null;
  catalogImageUrl: string | null;
};

// ─── Inline cell editors ──────────────────────────────────────────────────────
function DepthCell({ row, onSave }: { row: CabinetRow; onSave: (id: number, depth: string | null) => void }) {
  const current = row.depth ? String(parseFloat(row.depth)) : "";
  const isStandard = STANDARD_DEPTHS.includes(current);
  return (
    <Select
      value={current || "__none__"}
      onValueChange={(v) => onSave(row.id, v === "__none__" ? null : v)}
    >
      <SelectTrigger className={cn("h-7 text-xs w-20", !current && "text-muted-foreground")}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {STANDARD_DEPTHS.map((d) => (
          <SelectItem key={d} value={d}>{d}"</SelectItem>
        ))}
        {current && !isStandard && (
          <SelectItem value={current}>{current}" (custom)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function CountCell({
  value,
  options,
  onSave,
}: {
  value: number | null;
  options: readonly (number | null)[];
  onSave: (v: number | null) => void;
  label: string;
}) {
  return (
    <Select
      value={value === null ? "__none__" : String(value)}
      onValueChange={(v) => onSave(v === "__none__" ? null : parseInt(v))}
    >
      <SelectTrigger className={cn("h-7 text-xs w-16", value === null && "text-muted-foreground")}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {options
          .filter((o): o is number => o !== null)
          .map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n === 0 ? "None" : n}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

// ─── Image upload cell ────────────────────────────────────────────────────────
function ImageCell({
  row,
  onUploaded,
  onGenerated,
}: {
  row: CabinetRow;
  onUploaded: (id: number, url: string | null) => void;
  onGenerated: (id: number, url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.cabinets.adminUploadCatalogImage.useMutation({
    onSuccess: (data) => {
      onUploaded(row.id, data.url);
      setUploading(false);
      toast.success("Image uploaded");
    },
    onError: (e) => {
      setUploading(false);
      toast.error(`Upload failed: ${e.message}`);
    },
  });

  const generateMutation = trpc.cabinets.adminGenerateCatalogImage.useMutation({
    onSuccess: (data) => {
      onGenerated(row.id, data.url);
      setGenerating(false);
      toast.success("AI image generated and saved");
    },
    onError: (e) => {
      setGenerating(false);
      toast.error(`Generation failed: ${e.message}`);
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = reader.result as string;
      uploadMutation.mutate({
        filename: file.name,
        dataBase64,
        contentType: file.type || "image/jpeg",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleGenerate = () => {
    setGenerating(true);
    generateMutation.mutate({ id: row.id, viewMode });
  };

  const busy = uploading || generating;
  const imageUrl = row.catalogImageUrl;

  return (
    <div className="flex items-center gap-1.5">
      {/* Thumbnail or placeholder */}
      {imageUrl ? (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="catalog"
            className="h-10 w-10 rounded border border-border object-contain bg-muted/30 cursor-pointer"
            onClick={() => !busy && fileRef.current?.click()}
            title="Click to replace image"
          />
          {/* Remove button */}
          <button
            className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center h-4 w-4 rounded-full bg-destructive text-destructive-foreground"
            onClick={() => onUploaded(row.id, null)}
            title="Remove image"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : (
        <div
          className="h-10 w-10 rounded border border-dashed border-border bg-muted/20 flex items-center justify-center cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => !busy && fileRef.current?.click()}
          title="Upload image"
        >
          {busy ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      )}

      {/* Upload button */}
      {!busy && (
        <button
          className="h-6 w-6 flex items-center justify-center rounded border border-border bg-background hover:bg-muted/50 transition-colors"
          onClick={() => fileRef.current?.click()}
          title="Upload image"
        >
          <Upload className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      {/* 2D / 3D view toggle */}
      <div className="flex rounded border border-border overflow-hidden">
        <button
          className={cn(
            "px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            viewMode === "3d"
              ? "bg-amber-500 text-white"
              : "bg-background text-muted-foreground hover:bg-muted/50"
          )}
          onClick={() => setViewMode("3d")}
          title="Isometric 3D view"
          disabled={busy}
        >
          3D
        </button>
        <button
          className={cn(
            "px-1.5 py-0.5 text-[10px] font-medium transition-colors border-l border-border",
            viewMode === "2d"
              ? "bg-amber-500 text-white"
              : "bg-background text-muted-foreground hover:bg-muted/50"
          )}
          onClick={() => setViewMode("2d")}
          title="Flat 2D front view"
          disabled={busy}
        >
          2D
        </button>
      </div>

      {/* AI generate button */}
      <button
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded border transition-colors",
          busy
            ? "border-border bg-muted/30 cursor-not-allowed opacity-50"
            : "border-amber-400/60 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40"
        )}
        onClick={!busy ? handleGenerate : undefined}
        title={`Generate ${viewMode === "2d" ? "flat 2D front elevation" : "isometric 3D"} drawing with AI`}
        disabled={busy}
      >
        {generating ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <Sparkles className="h-3 w-3 text-amber-500" />
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CabinetConfigAdmin() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [unconfiguredOnly, setUnconfiguredOnly] = useState(false);
  const [page, setPage] = useState(0);

  // Pending local edits: cabinetId → patch object
  const [pending, setPending] = useState<Record<number, Partial<CabinetRow>>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.cabinets.adminListCabinetConfig.useQuery({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    category: category || undefined,
    unconfiguredOnly,
  });

  const categories = ["Base","Wall","Tall","Corner","Drawer","Specialty","Vanity","Pantry","Island","Filler","Molding","Accessory"];

  const updateMutation = trpc.cabinets.adminUpdateCabinet.useMutation({
    onSuccess: (_, vars) => {
      setSaving((s) => { const n = new Set(s); n.delete(vars.id); return n; });
      setPending((p) => { const n = { ...p }; delete n[vars.id]; return n; });
      utils.cabinets.adminListCabinetConfig.invalidate();
    },
    onError: (e, vars) => {
      setSaving((s) => { const n = new Set(s); n.delete(vars.id); return n; });
      toast.error(`Save failed: ${e.message}`);
    },
  });

  const applyEdit = useCallback(
    (id: number, field: keyof CabinetRow, value: unknown) => {
      setPending((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
    },
    []
  );

  // Image uploaded — save immediately (no pending queue needed)
  const handleImageUploaded = useCallback(
    (id: number, url: string | null) => {
      setSaving((s) => new Set(s).add(id));
      updateMutation.mutate(
        { id, catalogImageUrl: url },
        {
          onSuccess: () => {
            setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
            utils.cabinets.adminListCabinetConfig.invalidate();
            if (url) toast.success("Catalog image saved");
            else toast.success("Image removed");
          },
          onError: (e) => {
            setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
            toast.error(`Save failed: ${e.message}`);
          },
        }
      );
    },
    [updateMutation, utils]
  );

  const saveRow = useCallback(
    (row: CabinetRow) => {
      const patch = pending[row.id];
      if (!patch || Object.keys(patch).length === 0) return;
      setSaving((s) => new Set(s).add(row.id));
      const merged = { ...row, ...patch };
      updateMutation.mutate({
        id: row.id,
        depth: merged.depth ?? null,
        numberOfDoors: merged.numberOfDoors ?? null,
        numberOfDrawers: merged.numberOfDrawers ?? null,
        numberOfFixedShelves: merged.numberOfFixedShelves ?? null,
        numberOfAdjShelves: merged.numberOfAdjShelves ?? null,
      });
    },
    [pending, updateMutation]
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const configuredCount = rows.filter(
    (r) =>
      r.depth != null ||
      r.numberOfDoors != null ||
      r.numberOfDrawers != null ||
      r.numberOfFixedShelves != null ||
      r.numberOfAdjShelves != null
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Cabinet Configuration</h2>
        <Badge variant="secondary" className="ml-1">{total} cabinets</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Set the standard depth, door count, drawer count, shelf counts, and catalog image for each generic cabinet.
        These values appear in the public Specifications card and drive catalog illustrations.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search code or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(0); }
            }}
          />
        </div>
        <Select value={category || "__all__"} onValueChange={(v) => { setCategory(v === "__all__" ? "" : v); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Switch
            id="unconfigured-only"
            checked={unconfiguredOnly}
            onCheckedChange={(v) => { setUnconfiguredOnly(v); setPage(0); }}
          />
          <Label htmlFor="unconfigured-only" className="text-sm cursor-pointer">Unconfigured only</Label>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => { setSearch(searchInput); setPage(0); }}>
          Search
        </Button>
      </div>

      {/* Progress summary */}
      {!unconfiguredOnly && rows.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span>{configuredCount} of {rows.length} shown have at least one field configured</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No cabinets found.</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-28">Code</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-20">W×H</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-24">Depth</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-20">Doors</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-20">Drawers</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-24">Fixed Sh.</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-24">Adj. Sh.</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-28">Image</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const patch = pending[row.id] ?? {};
                const merged = { ...row, ...patch };
                const isDirty = Object.keys(patch).length > 0;
                const isSaving = saving.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                      isDirty && "bg-amber-50/60 dark:bg-amber-900/10"
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs font-semibold text-primary">{row.masterCode}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-xs text-foreground line-clamp-1">{row.description}</span>
                      {row.category && (
                        <span className="text-[10px] text-muted-foreground block">{row.category}{row.subCategory ? ` › ${row.subCategory}` : ""}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      {row.width ? `${parseFloat(row.width)}"` : "—"}×{row.height ? `${parseFloat(row.height)}"` : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <DepthCell
                        row={merged as CabinetRow}
                        onSave={(id, depth) => applyEdit(id, "depth", depth)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <CountCell
                        value={merged.numberOfDoors}
                        options={DOOR_OPTIONS}
                        label="Doors"
                        onSave={(v) => applyEdit(row.id, "numberOfDoors", v)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <CountCell
                        value={merged.numberOfDrawers}
                        options={DRAWER_OPTIONS}
                        label="Drawers"
                        onSave={(v) => applyEdit(row.id, "numberOfDrawers", v)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <CountCell
                        value={merged.numberOfFixedShelves}
                        options={SHELF_OPTIONS}
                        label="Fixed Shelves"
                        onSave={(v) => applyEdit(row.id, "numberOfFixedShelves", v)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <CountCell
                        value={merged.numberOfAdjShelves}
                        options={SHELF_OPTIONS}
                        label="Adj. Shelves"
                        onSave={(v) => applyEdit(row.id, "numberOfAdjShelves", v)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <ImageCell
                        row={row as CabinetRow}
                        onUploaded={handleImageUploaded}
                        onGenerated={(id, url) => handleImageUploaded(id, url)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {isDirty && (
                        <Button
                          size="sm"
                          className="h-6 text-xs px-2"
                          disabled={isSaving}
                          onClick={() => saveRow(row as CabinetRow)}
                        >
                          {isSaving ? <Spinner className="h-3 w-3" /> : "Save"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CabinetConfigAdmin;
