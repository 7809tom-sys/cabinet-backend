import { useState, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, Palette, Star, ClipboardList, Upload,
  Eye, EyeOff, Search, DollarSign, ImageIcon, Check, X, Loader2,
  PlusCircle, ArrowLeft, FileSpreadsheet, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL = "__all__";
const MAX_PICKS = 8;

function money(v: string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────
type VendorPage = "overview" | "catalog" | "styles" | "picks" | "orders";

const NAV_ITEMS: { id: VendorPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "catalog", label: "My Catalog", icon: Package },
  { id: "styles", label: "Door Styles", icon: Palette },
  { id: "picks", label: "Design Tool Picks", icon: Star },
  { id: "orders", label: "Orders", icon: ClipboardList },
];

// ─── Overview Page ────────────────────────────────────────────────────────────
function OverviewPage() {
  const myLine = trpc.distributorPortal.myLine.useQuery(undefined);

  if (myLine.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (myLine.error) {
    return <div className="text-destructive p-4">Error loading line info: {myLine.error.message}</div>;
  }

  const { line, counts, styles } = myLine.data!;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{line.name}</h2>
        <p className="text-muted-foreground">Manage your product line, pricing, and design tool presence.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total SKUs</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.published}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.available}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Loader2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.pending}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Door Styles ({styles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {styles.map((s) => (
              <Badge key={s.id} variant="secondary">{s.ourName}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lead Time</span>
            <span>{line.leadTimeDays ?? "—"} days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Warehouse Zips</span>
            <span>{(line.warehouseZips as string[] | null)?.join(", ") || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Design Tool Picks</span>
            <span>{(line.designToolPicks as number[] | null)?.length ?? 0} / {MAX_PICKS}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Catalog Page ─────────────────────────────────────────────────────────────
function CatalogPage() {
  const utils = trpc.useUtils();
  const myLine = trpc.distributorPortal.myLine.useQuery(undefined);
  const [styleId, setStyleId] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [editingPrice, setEditingPrice] = useState<{ skuId: number; field: string; value: string } | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);

  const catalogInput = useMemo(
    () => ({
      styleId: styleId === ALL ? undefined : Number(styleId),
      category: category === ALL ? undefined : category,
      search: search.trim() || undefined,
      onlyHidden: onlyHidden || undefined,
      limit: 100,
      offset: 0,
    }),
    [styleId, category, search, onlyHidden]
  );

  const catalog = trpc.distributorPortal.catalog.useQuery(catalogInput, {
    enabled: !!myLine.data,
  });

  const toggleVis = trpc.distributorPortal.setVisibility.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      utils.distributorPortal.myLine.invalidate();
    },
  });

  const updatePrice = trpc.distributorPortal.updatePrice.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      toast.success("Price updated");
      setEditingPrice(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateImage = trpc.distributorPortal.updateImage.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      toast.success("Image uploaded");
    },
    onError: (err) => toast.error(err.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSkuId, setUploadingSkuId] = useState<number | null>(null);

  const handleImageUpload = useCallback(async (skuId: number, file: File) => {
    setUploadingSkuId(skuId);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await updateImage.mutateAsync({
        skuId,
        imageBase64: base64,
        contentType: file.type,
        fileName: file.name,
      });
    } finally {
      setUploadingSkuId(null);
    }
  }, [updateImage]);

  const styles = myLine.data?.styles ?? [];
  const categories = useMemo(() => {
    const cats = new Set<string>();
    catalog.data?.items.forEach((i) => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [catalog.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <h2 className="text-xl font-bold">My Catalog</h2>
        <Badge variant="outline">{catalog.data?.total ?? 0} products</Badge>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setShowCsvUpload(!showCsvUpload)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Spreadsheet Upload
          </Button>
          <Button size="sm" onClick={() => setShowNewProduct(!showNewProduct)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Product
          </Button>
        </div>
      </div>

      {showCsvUpload && <CsvUploadSection />}

      {showNewProduct && (
        <Card>
          <CardHeader><CardTitle>Submit New Product</CardTitle></CardHeader>
          <CardContent>
            <NewProductForm onClose={() => setShowNewProduct(false)} />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search SKU or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={styleId} onValueChange={setStyleId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Styles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Styles</SelectItem>
            {styles.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.ourName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyHidden} onCheckedChange={setOnlyHidden} />
          Hidden only
        </label>
      </div>

      {/* Table */}
      {catalog.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">List</TableHead>
                <TableHead className="text-right">Wholesale</TableHead>
                <TableHead className="text-right">Contractor</TableHead>
                <TableHead className="text-center">Visible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.data?.items.map((item) => (
                <TableRow key={item.skuId}>
                  <TableCell>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-10 w-10 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.masterCode}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{item.description}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{item.styleName}</Badge></TableCell>
                  <TableCell className="text-xs">{item.category}</TableCell>
                  <TableCell className="text-right">
                    <button
                      className="text-sm hover:underline cursor-pointer"
                      onClick={() => setEditingPrice({ skuId: item.skuId, field: "listPrice", value: item.listPrice ?? "" })}
                    >
                      {money(item.listPrice)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      className="text-sm hover:underline cursor-pointer"
                      onClick={() => setEditingPrice({ skuId: item.skuId, field: "wholesalePrice", value: item.wholesalePrice ?? "" })}
                    >
                      {money(item.wholesalePrice)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      className="text-sm hover:underline cursor-pointer"
                      onClick={() => setEditingPrice({ skuId: item.skuId, field: "contractorPrice", value: item.contractorPrice ?? "" })}
                    >
                      {money(item.contractorPrice)}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={item.isPublished}
                      onCheckedChange={(checked) => {
                        toggleVis.mutate({ skuId: item.skuId, isPublished: checked });
                      }}
                      disabled={toggleVis.isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === "approved" ? "default" : item.status === "pending" ? "secondary" : "destructive"} className="text-xs">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setUploadingSkuId(item.skuId);
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingSkuId === item.skuId}
                    >
                      {uploadingSkuId === item.skuId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {catalog.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No products found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadingSkuId) {
            handleImageUpload(uploadingSkuId, file);
          }
          e.target.value = "";
        }}
      />

      {/* Price edit dialog */}
      {editingPrice && (
        <Dialog open onOpenChange={() => setEditingPrice(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update {editingPrice.field.replace("Price", " Price")}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  value={editingPrice.value}
                  onChange={(e) => setEditingPrice({ ...editingPrice, value: e.target.value })}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPrice(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  updatePrice.mutate({
                    skuId: editingPrice.skuId,
                    [editingPrice.field]: editingPrice.value || undefined,
                  });
                }}
                disabled={updatePrice.isPending}
              >
                {updatePrice.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── CSV Upload Section ──────────────────────────────────────────────────────
function CsvUploadSection() {
  const utils = trpc.useUtils();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvResult, setCsvResult] = useState<{ updated: number; notFound: number; total: number; errors: string[] } | null>(null);

  const bulkUpdate = trpc.vendor.bulkCatalogUpdate.useMutation({
    onSuccess: (result) => {
      setCsvResult(result);
      utils.distributorPortal.catalog.invalidate();
      utils.distributorPortal.myLine.invalidate();
      toast.success(`Updated ${result.updated} of ${result.total} rows`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCsvUpload = useCallback(async (file: File) => {
    setCsvParsing(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }
      // Parse header
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
      const skuIdx = headers.findIndex(h => h === "distributorsku" || h === "sku" || h === "distributor_sku");
      if (skuIdx === -1) {
        toast.error("CSV must have a 'distributorSku' or 'sku' column");
        return;
      }
      const listIdx = headers.findIndex(h => h === "listprice" || h === "list_price" || h === "list");
      const wholeIdx = headers.findIndex(h => h === "wholesaleprice" || h === "wholesale_price" || h === "wholesale");
      const contIdx = headers.findIndex(h => h === "contractorprice" || h === "contractor_price" || h === "contractor");
      const homeIdx = headers.findIndex(h => h === "homeownerprice" || h === "homeowner_price" || h === "homeowner");
      const availIdx = headers.findIndex(h => h === "isavailable" || h === "is_available" || h === "available");

      const rows = lines.slice(1).filter(l => l.trim()).map(line => {
        const cols = line.split(",").map(c => c.trim());
        const row: any = { distributorSku: cols[skuIdx] };
        if (listIdx >= 0 && cols[listIdx]) row.listPrice = cols[listIdx];
        if (wholeIdx >= 0 && cols[wholeIdx]) row.wholesalePrice = cols[wholeIdx];
        if (contIdx >= 0 && cols[contIdx]) row.contractorPrice = cols[contIdx];
        if (homeIdx >= 0 && cols[homeIdx]) row.homeownerPrice = cols[homeIdx];
        if (availIdx >= 0 && cols[availIdx]) row.isAvailable = cols[availIdx].toLowerCase() === "true" || cols[availIdx] === "1";
        return row;
      });

      if (rows.length === 0) {
        toast.error("No valid data rows found in CSV");
        return;
      }

      bulkUpdate.mutate({ rows });
    } catch (err: any) {
      toast.error(`CSV parse error: ${err.message}`);
    } finally {
      setCsvParsing(false);
    }
  }, [bulkUpdate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Bulk Spreadsheet Upload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV file to bulk-update prices and availability for your existing products.
          The CSV must have a <code className="bg-muted px-1 rounded">distributorSku</code> column,
          plus any of: <code className="bg-muted px-1 rounded">listPrice</code>,{" "}
          <code className="bg-muted px-1 rounded">wholesalePrice</code>,{" "}
          <code className="bg-muted px-1 rounded">contractorPrice</code>,{" "}
          <code className="bg-muted px-1 rounded">homeownerPrice</code>,{" "}
          <code className="bg-muted px-1 rounded">isAvailable</code>.
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvParsing || bulkUpdate.isPending}
          >
            {(csvParsing || bulkUpdate.isPending) ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const csv = "distributorSku,listPrice,wholesalePrice,contractorPrice,homeownerPrice,isAvailable\nEXAMPLE-SKU-1,199.99,149.99,129.99,219.99,true\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "catalog-template.csv"; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>

        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCsvUpload(file);
            e.target.value = "";
          }}
        />

        {csvResult && (
          <div className="rounded-md border p-4 space-y-2">
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">Updated: {csvResult.updated}</span>
              <span className="text-muted-foreground">Total rows: {csvResult.total}</span>
              {csvResult.notFound > 0 && (
                <span className="text-destructive">Not found: {csvResult.notFound}</span>
              )}
            </div>
            {csvResult.errors.length > 0 && (
              <div className="text-xs text-destructive space-y-1">
                {csvResult.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── New Product Submission ──────────────────────────────────────────────────
function NewProductForm({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const myLine = trpc.distributorPortal.myLine.useQuery(undefined);
  const [form, setForm] = useState({
    cabinetId: "",
    styleId: "",
    distributorSku: "",
    listPrice: "",
    wholesalePrice: "",
    contractorPrice: "",
    homeownerPrice: "",
    supplierCabinetName: "",
  });

  const submit = trpc.distributorPortal.submitNewProduct.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      utils.distributorPortal.myLine.invalidate();
      toast.success("Product submitted for approval");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const styles = myLine.data?.styles ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Cabinet ID *</label>
          <Input
            type="number"
            placeholder="Cabinet ID from master catalog"
            value={form.cabinetId}
            onChange={(e) => setForm({ ...form, cabinetId: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Door Style *</label>
          <Select value={form.styleId} onValueChange={(v) => setForm({ ...form, styleId: v })}>
            <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
            <SelectContent>
              {styles.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.ourName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Your SKU *</label>
          <Input
            placeholder="Your internal SKU code"
            value={form.distributorSku}
            onChange={(e) => setForm({ ...form, distributorSku: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Supplier Cabinet Name</label>
          <Input
            placeholder="Optional display name"
            value={form.supplierCabinetName}
            onChange={(e) => setForm({ ...form, supplierCabinetName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">List Price</label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.listPrice}
            onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Wholesale Price</label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.wholesalePrice}
            onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Contractor Price</label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.contractorPrice}
            onChange={(e) => setForm({ ...form, contractorPrice: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Homeowner Price</label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.homeownerPrice}
            onChange={(e) => setForm({ ...form, homeownerPrice: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button
          onClick={() => {
            if (!form.cabinetId || !form.styleId || !form.distributorSku) {
              toast.error("Cabinet ID, Style, and SKU are required");
              return;
            }
            submit.mutate({
              cabinetId: Number(form.cabinetId),
              styleId: Number(form.styleId),
              distributorSku: form.distributorSku,
              listPrice: form.listPrice || undefined,
              wholesalePrice: form.wholesalePrice || undefined,
              contractorPrice: form.contractorPrice || undefined,
              homeownerPrice: form.homeownerPrice || undefined,
              supplierCabinetName: form.supplierCabinetName || undefined,
            });
          }}
          disabled={submit.isPending}
        >
          {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
          Submit for Approval
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Design Tool Picks Page ───────────────────────────────────────────────────
function DesignToolPicksPage() {
  const utils = trpc.useUtils();
  const picks = trpc.distributorPortal.getDesignToolPicks.useQuery(undefined);
  const catalog = trpc.distributorPortal.catalog.useQuery({ limit: 500, offset: 0 });
  const setPicks = trpc.distributorPortal.setDesignToolPicks.useMutation({
    onSuccess: () => {
      utils.distributorPortal.getDesignToolPicks.invalidate();
      utils.distributorPortal.myLine.invalidate();
      toast.success("Design tool picks updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const currentPicks = picks.data?.picks ?? [];
  const pickSet = useMemo(() => new Set(currentPicks), [currentPicks]);

  const togglePick = useCallback((skuId: number) => {
    const newPicks = pickSet.has(skuId)
      ? currentPicks.filter((id) => id !== skuId)
      : [...currentPicks, skuId];
    if (newPicks.length > MAX_PICKS) {
      toast.error(`Maximum ${MAX_PICKS} picks allowed`);
      return;
    }
    setPicks.mutate({ skuIds: newPicks });
  }, [currentPicks, pickSet, setPicks]);

  if (picks.isLoading || catalog.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Design Tool Picks</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select up to {MAX_PICKS} products to feature in the kitchen design tool.
          These are your best items that customers will see when designing their kitchen.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={currentPicks.length >= MAX_PICKS ? "destructive" : "secondary"}>
          {currentPicks.length} / {MAX_PICKS} selected
        </Badge>
        {currentPicks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPicks.mutate({ skuIds: [] })}
            disabled={setPicks.isPending}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Current picks */}
      {picks.data?.items && picks.data.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Picks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {picks.data.items.map((item) => (
                <div
                  key={item.skuId}
                  className="relative border rounded-lg p-3 bg-primary/5 border-primary/30"
                >
                  <button
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 transition-colors"
                    onClick={() => togglePick(item.skuId)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-16 w-full object-cover rounded mb-2" />
                  ) : (
                    <div className="h-16 w-full bg-muted rounded mb-2 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <p className="text-xs font-medium truncate">{item.masterCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  <p className="text-xs text-muted-foreground">{item.styleName}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available products to pick from */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.data?.items
              .filter((item) => item.isPublished && item.status === "approved")
              .map((item) => {
                const isPicked = pickSet.has(item.skuId);
                return (
                  <div
                    key={item.skuId}
                    className={`relative border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                      isPicked ? "bg-primary/5 border-primary/30" : "hover:border-primary/20"
                    }`}
                    onClick={() => togglePick(item.skuId)}
                  >
                    {isPicked && (
                      <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-14 w-full object-cover rounded mb-2" />
                    ) : (
                      <div className="h-14 w-full bg-muted rounded mb-2 flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs font-medium truncate">{item.masterCode}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    <div className="flex justify-between items-center mt-1">
                      <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
                      <span className="text-xs font-medium">{money(item.contractorPrice)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Door Styles Page ─────────────────────────────────────────────────────────
function DoorStylesPage() {
  const utils = trpc.useUtils();
  const myLine = trpc.distributorPortal.myLine.useQuery(undefined);
  const updateImage = trpc.distributorPortal.updateDoorStyleImage.useMutation({
    onSuccess: () => {
      utils.distributorPortal.myLine.invalidate();
      toast.success("Style image updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ styleId: number; imageType: "doorSample" | "roomScene" | "thumbnail" } | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    if (!uploadTarget) return;
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await updateImage.mutateAsync({
      styleId: uploadTarget.styleId,
      imageType: uploadTarget.imageType,
      imageBase64: base64,
      contentType: file.type,
    });
    setUploadTarget(null);
  }, [uploadTarget, updateImage]);

  const styles = myLine.data?.styles ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Door Styles</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Manage images for your door styles. Upload room scenes, door samples, and thumbnails.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {styles.map((style) => (
          <Card key={style.id}>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">{style.ourName}</h3>
              <p className="text-xs text-muted-foreground mb-3">{style.doorStyle}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUploadTarget({ styleId: style.id, imageType: "doorSample" });
                    fileInputRef.current?.click();
                  }}
                  disabled={updateImage.isPending}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Door Sample
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUploadTarget({ styleId: style.id, imageType: "roomScene" });
                    fileInputRef.current?.click();
                  }}
                  disabled={updateImage.isPending}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Room Scene
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUploadTarget({ styleId: style.id, imageType: "thumbnail" });
                    fileInputRef.current?.click();
                  }}
                  disabled={updateImage.isPending}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Thumbnail
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Orders Page ──────────────────────────────────────────────────────────────
function OrdersPage() {
  const orders = trpc.distributorPortal.orders.useQuery({ limit: 50 });

  if (orders.isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const rows = orders.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Orders</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Orders containing your products that have been submitted.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No submitted orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.requestNumber}</TableCell>
                  <TableCell>{order.styleName}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{order.tier}</Badge></TableCell>
                  <TableCell className="text-right">{order.itemCount}</TableCell>
                  <TableCell className="text-right font-medium">{money(order.totalAmount)}</TableCell>
                  <TableCell className="text-xs">{order.source}</TableCell>
                  <TableCell className="text-xs">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell><Badge className="text-xs">{order.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Vendor Portal Component ─────────────────────────────────────────────
export default function VendorPortal() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<VendorPage>("overview");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Vendor Portal</h1>
          <p className="text-muted-foreground">Sign in to access your vendor dashboard.</p>
          <Button onClick={() => { window.location.href = getLoginUrl(); }}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (user.role !== "distributor" && user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            The Vendor Portal is only available to distributor accounts.
          </p>
          <Button variant="outline" onClick={() => { window.location.href = "/"; }}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:block">
        <div className="p-4 border-b">
          <h1 className="font-bold text-lg">Vendor Portal</h1>
          <p className="text-xs text-muted-foreground mt-1">{user.name}</p>
        </div>
        <nav className="p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card z-50">
        <div className="flex justify-around py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex flex-col items-center gap-1 px-2 py-1 text-xs transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 p-6 pb-20 md:pb-6 overflow-y-auto">
        {page === "overview" && <OverviewPage />}
        {page === "catalog" && <CatalogPage />}
        {page === "styles" && <DoorStylesPage />}
        {page === "picks" && <DesignToolPicksPage />}
        {page === "orders" && <OrdersPage />}
      </main>
    </div>
  );
}
