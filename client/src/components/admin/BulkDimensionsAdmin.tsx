import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, ImageIcon, Upload, ChevronLeft, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  pkgLength: string | null;
  pkgWidth: string | null;
  pkgHeight: string | null;
  pkgWeight: string | null;
  catalogImageUrl?: string | null;
};

type DraftRow = {
  width: string;
  height: string;
  depth: string;
  weight: string;
  pkgLength: string;
  pkgWidth: string;
  pkgHeight: string;
  pkgWeight: string;
  catalogImageUrl: string;
};

const PAGE_SIZE = 100;

// ── Row component ──────────────────────────────────────────────────────────────

function DimRow({
  row,
  onSaved,
}: {
  row: CabinetRow;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftRow>({
    width: row.width ?? "",
    height: row.height ?? "",
    depth: row.depth ?? "",
    weight: row.weight ?? "",
    pkgLength: row.pkgLength ?? "",
    pkgWidth: row.pkgWidth ?? "",
    pkgHeight: row.pkgHeight ?? "",
    pkgWeight: row.pkgWeight ?? "",
    catalogImageUrl: row.catalogImageUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateMut = trpc.cabinets.adminUpdateCabinet.useMutation();
  const uploadImgMut = trpc.cabinets.adminUploadCatalogImage.useMutation();

  const isDirty =
    (draft.width || null) !== (row.width || null) ||
    (draft.height || null) !== (row.height || null) ||
    (draft.depth || null) !== (row.depth || null) ||
    (draft.weight || null) !== (row.weight || null) ||
    (draft.pkgLength || null) !== (row.pkgLength || null) ||
    (draft.pkgWidth || null) !== (row.pkgWidth || null) ||
    (draft.pkgHeight || null) !== (row.pkgHeight || null) ||
    (draft.pkgWeight || null) !== (row.pkgWeight || null) ||
    (draft.catalogImageUrl || null) !== (row.catalogImageUrl || null);

  const isMissingAssembled = !row.width || !row.height || !row.depth;
  const isMissingPkg = !row.pkgLength || !row.pkgWidth || !row.pkgHeight || !row.pkgWeight;
  const isMissingWeight = !row.weight || Number(row.weight) === 0;
  const isMissingData = isMissingAssembled || isMissingPkg || isMissingWeight;

  const set = (field: keyof DraftRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMut.mutateAsync({
        id: row.id,
        width: draft.width || null,
        height: draft.height || null,
        depth: draft.depth || null,
        weight: draft.weight || null,
        pkgLength: draft.pkgLength || null,
        pkgWidth: draft.pkgWidth || null,
        pkgHeight: draft.pkgHeight || null,
        pkgWeight: draft.pkgWeight || null,
        catalogImageUrl: draft.catalogImageUrl || null,
      });
      toast.success(`${row.masterCode} saved`);
      onSaved();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataBase64 = reader.result as string;
        const { url } = await uploadImgMut.mutateAsync({
          filename: file.name,
          dataBase64,
          contentType: file.type || "image/jpeg",
        });
        setDraft((d) => ({ ...d, catalogImageUrl: url }));
        toast.success("Image uploaded");
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploadingImg(false);
    }
  };

  return (
    <tr className={`border-b transition-colors ${isMissingData ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
      {/* Cabinet info */}
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-2">
          {isMissingData ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
          )}
          <div>
            <div className="font-mono text-xs font-semibold">{row.masterCode}</div>
            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[160px]">{row.description}</div>
          </div>
        </div>
      </td>

      {/* Category */}
      <td className="px-2 py-2 align-middle">
        <Badge variant="outline" className="text-xs whitespace-nowrap">{row.category}</Badge>
      </td>

      {/* Assembled W */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.width}
          onChange={set("width")}
          placeholder='W"'
          className={`h-7 w-14 text-xs text-center ${isMissingAssembled ? "border-amber-400" : ""}`}
          type="number" min="0" step="0.25"
        />
      </td>

      {/* Assembled H */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.height}
          onChange={set("height")}
          placeholder='H"'
          className={`h-7 w-14 text-xs text-center ${isMissingAssembled ? "border-amber-400" : ""}`}
          type="number" min="0" step="0.25"
        />
      </td>

      {/* Assembled D */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.depth}
          onChange={set("depth")}
          placeholder='D"'
          className={`h-7 w-14 text-xs text-center ${isMissingAssembled ? "border-amber-400" : ""}`}
          type="number" min="0" step="0.25"
        />
      </td>

      {/* Assembled weight */}
      <td className="px-2 py-2 align-middle">
        <Input
          value={draft.weight}
          onChange={set("weight")}
          placeholder="lbs"
          className={`h-7 w-16 text-xs text-center ${isMissingWeight ? "border-amber-400" : ""}`}
          type="number"
          min="0"
          step="0.1"
        />
      </td>

      {/* Package L */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.pkgLength}
          onChange={set("pkgLength")}
          placeholder="L in"
          className={`h-7 w-14 text-xs text-center ${isMissingPkg ? "border-amber-400" : ""}`}
          type="number"
          min="0"
          step="0.1"
        />
      </td>

      {/* Package W */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.pkgWidth}
          onChange={set("pkgWidth")}
          placeholder="W in"
          className={`h-7 w-14 text-xs text-center ${isMissingPkg ? "border-amber-400" : ""}`}
          type="number"
          min="0"
          step="0.1"
        />
      </td>

      {/* Package H */}
      <td className="px-1 py-2 align-middle">
        <Input
          value={draft.pkgHeight}
          onChange={set("pkgHeight")}
          placeholder="H in"
          className={`h-7 w-14 text-xs text-center ${isMissingPkg ? "border-amber-400" : ""}`}
          type="number"
          min="0"
          step="0.1"
        />
      </td>

      {/* Package weight */}
      <td className="px-2 py-2 align-middle">
        <Input
          value={draft.pkgWeight}
          onChange={set("pkgWeight")}
          placeholder="lbs"
          className={`h-7 w-16 text-xs text-center ${isMissingPkg ? "border-amber-400" : ""}`}
          type="number"
          min="0"
          step="0.1"
        />
      </td>

      {/* Catalog image */}
      <td className="px-2 py-2 align-middle">
        <div className="flex flex-col items-center gap-1">
          {draft.catalogImageUrl ? (
            <img
              src={draft.catalogImageUrl}
              alt={row.masterCode}
              className="w-16 h-16 object-contain rounded border bg-white shadow-sm"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-16 rounded border bg-muted flex flex-col items-center justify-center gap-1">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground">No image</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFile}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] w-16"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingImg}
            title="Replace image"
          >
            {uploadingImg ? <Spinner className="w-3 h-3" /> : <><Upload className="w-2.5 h-2.5 mr-1" />Replace</>}
          </Button>
        </div>
      </td>

      {/* Save */}
      <td className="px-2 py-2 align-middle">
        <Button
          size="sm"
          variant={isDirty ? "default" : "ghost"}
          className="h-7 px-2 text-xs"
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? <Spinner className="w-3 h-3" /> : isDirty ? "Save" : "✓"}
        </Button>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BulkDimensionsAdmin() {
  const [page, setPage] = useState(0);
  // Default to missing-only so admins immediately see what needs filling in
  const [missingOnly, setMissingOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("");

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.cabinets.adminListDimensions.useQuery({
    page,
    limit: PAGE_SIZE,
    missingOnly,
    search: search || undefined,
    category: category || undefined,
  });

  // Also fetch the all-categories list for the filter
  const { data: categoriesData } = trpc.cabinets.allCategories.useQuery();
  const categories = categoriesData ?? [];

  const rows = (data?.rows ?? []) as CabinetRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(0);
  }, [searchInput]);

  const handleSaved = useCallback(() => {
    refetch();
    utils.cabinets.adminListDimensions.invalidate();
  }, [refetch, utils]);

  const missingOnPageCount = rows.filter(
    (r) => !r.width || !r.height || !r.depth || !r.weight || Number(r.weight) === 0 ||
           !r.pkgLength || !r.pkgWidth || !r.pkgHeight || !r.pkgWeight
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dimensions & Weight Editor</h2>
          <p className="text-sm text-muted-foreground">
            Edit assembled dimensions (W/H/D), weight, and package dimensions for all cabinets.
            Amber borders indicate missing fields.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{total} cabinets</span>
          {missingOnPageCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {missingOnPageCount} incomplete on this page
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
        {/* Search */}
        <div className="flex gap-1.5">
          <Input
            placeholder="Search code or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-8 w-52 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>
            Search
          </Button>
        </div>

        {/* Category filter */}
        <Select
          value={category || "all"}
          onValueChange={(v) => { setCategory(v === "all" ? "" : v); setPage(0); }}
        >
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Missing only toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="missing-only"
            checked={missingOnly}
            onCheckedChange={(v) => { setMissingOnly(v); setPage(0); }}
          />
          <Label htmlFor="missing-only" className="text-sm cursor-pointer">
            Missing data only
          </Label>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-6 h-6" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {missingOnly ? "✓ All cabinets have complete dimension data" : "No cabinets found"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Cabinet</th>
                <th className="px-2 py-2 text-left font-medium">Category</th>
                <th className="px-1 py-2 text-center font-medium">W (in)</th>
                <th className="px-1 py-2 text-center font-medium">H (in)</th>
                <th className="px-1 py-2 text-center font-medium">D (in)</th>
                <th className="px-2 py-2 text-center font-medium">Weight (lbs)</th>
                <th className="px-1 py-2 text-center font-medium">Pkg L</th>
                <th className="px-1 py-2 text-center font-medium">Pkg W</th>
                <th className="px-1 py-2 text-center font-medium">Pkg H</th>
                <th className="px-2 py-2 text-center font-medium">Pkg Wt</th>
                <th className="px-2 py-2 text-left font-medium">Image</th>
                <th className="px-2 py-2 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <DimRow key={row.id} row={row} onSaved={handleSaved} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
