import { useState, useMemo, useCallback, useRef, useEffect, FormEvent, createContext, useContext } from "react";
import {
  LayoutDashboard, Package, Palette, Star, ClipboardList, Upload,
  Eye, EyeOff, Search, DollarSign, ImageIcon, Check, X, Loader2,
  PlusCircle, ArrowLeft, ArrowUp, ArrowDown, GripVertical, Truck, MapPin, FileSpreadsheet, Download, BarChart3,
  Sparkles, Clock, CheckCircle2, Send, Link2, CreditCard,
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
import { Label } from "@/components/ui/label";
import { csvEscape } from "@shared/inventoryForecast";

// ─── Admin Distributor Context ───────────────────────────────────────────────
const AdminDistributorContext = createContext<number | undefined>(undefined);
function useAdminDistributorId(): number | undefined {
  return useContext(AdminDistributorContext);
}
// Carries the distributor code (e.g. "PEL") so sub-pages can branch on it
const AdminDistributorCodeContext = createContext<string | undefined>(undefined);
function useAdminDistributorCode(): string | undefined {
  return useContext(AdminDistributorCodeContext);
}
// Pelican is a special distributor whose products live in a separate table
const PEL_DIST_CODE = "PEL";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL = "__all__";
const MAX_PICKS = 8;

function money(v: string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────
type VendorPage = "overview" | "catalog" | "styles" | "featured-styles" | "shipping" | "picks" | "orders" | "promotions" | "gallery" | "analytics" | "ai-services" | "integrations" | "payments";

const NAV_ITEMS: { id: VendorPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "catalog", label: "My Catalog", icon: Package },
  { id: "styles", label: "Door Styles", icon: Palette },
  { id: "featured-styles", label: "Featured Styles", icon: Star },
  { id: "shipping", label: "Shipping", icon: Truck },
  { id: "picks", label: "3D Designer Picks", icon: Star },
  { id: "promotions", label: "Promotions", icon: DollarSign },
  { id: "gallery", label: "Gallery", icon: ImageIcon },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "ai-services", label: "AI Services", icon: Sparkles },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "payments", label: "Payments", icon: CreditCard },
];

// ─── Pelican Vendor Catalog Page ─────────────────────────────────────────────
function PelicanVendorCatalogPage({ initialCategory }: { initialCategory?: string } = {}) {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<string>(initialCategory ?? ALL);
  const [search, setSearch] = useState("");
  const input = useMemo(
    () => ({
      category: category === ALL ? undefined : (category as any),
      search: search.trim() || undefined,
      limit: 200,
      offset: 0,
    }),
    [category, search]
  );
  const { data, isLoading, error } = trpc.pelican.adminList.useQuery(input);
  const setVisibility = trpc.pelican.setVisibility.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });
  const setPopular = trpc.pelican.setPopular.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });
  const setCoverage = trpc.pelican.setCoverage.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });

  const categories = useMemo(() => {
    const cats = new Set<string>();
    (data?.items ?? []).forEach((i: any) => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <h2 className="text-xl font-bold">Pelican Catalog</h2>
        <Badge variant="outline">{data?.total ?? 0} products</Badge>
        <div className="flex gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              className="pl-8 h-9 w-48"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : error ? (
        <div className="text-destructive p-4">Could not load Pelican products: {error.message}</div>
      ) : !data?.items.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No Pelican items match your filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Catalog</TableHead>
                <TableHead className="text-center">Designer</TableHead>
                <TableHead className="text-center">Featured</TableHead>
                <TableHead className="text-right">Sq ft/Box</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell className="p-1.5">
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.name}
                        className="h-10 w-10 object-cover rounded border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded border border-border flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.pelicanCode}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{it.category}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{money(it.yourCost ?? it.listPrice)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {money(it.sellPrice)}
                    {typeof it.markupBps === "number" && (
                      <Badge variant="outline" className="ml-1 text-[10px]">{(it.markupBps / 100).toFixed(0)}%</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={!!it.isActive} onCheckedChange={(v) => setVisibility.mutate({ id: it.id, isActive: v })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={!!it.showInCatalog} onCheckedChange={(v) => setVisibility.mutate({ id: it.id, showInCatalog: v })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={!!it.showInDesigner} onCheckedChange={(v) => setVisibility.mutate({ id: it.id, showInDesigner: v })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm" variant={it.isPopular ? "default" : "outline"}
                      className="h-8 w-8 p-0"
                      onClick={() => setPopular.mutate({ id: it.id, isPopular: !it.isPopular, popularRank: it.popularRank ?? 0 })}
                      title={it.isPopular ? "Unfeature" : "Feature"}
                    >
                      <Star className={`h-4 w-4 ${it.isPopular ? "fill-current" : ""}`} />
                    </Button>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {it.coverageSqFt
                      ? <span className="font-medium">{parseFloat(String(it.coverageSqFt)).toFixed(2)}</span>
                      : it.size
                        ? <span className="text-muted-foreground text-xs">{it.size}</span>
                        : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Pelican Vendor Overview Page ─────────────────────────────────────────────
function PelicanVendorOverviewPage({ onNavigateToCatalog }: { onNavigateToCatalog?: (category?: string) => void } = {}) {
  const { data, isLoading } = trpc.pelican.adminList.useQuery({ limit: 1, offset: 0 });
  const categories = trpc.pelican.categories.useQuery({ scope: "catalog" });
  const active = trpc.pelican.adminList.useQuery({ limit: 500, offset: 0 });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1,2,3].map((i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
      </div>
    );
  }

  const totalProducts = data?.total ?? 0;
  const activeCount = (active.data?.items ?? []).filter((i: any) => i.isActive).length;
  const categoryCount = categories.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Stone Creek Collection (Pelican)</h2>
        <p className="text-muted-foreground">Manage surfaces, fixtures, and tile products.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className={onNavigateToCatalog ? "cursor-pointer hover:border-primary transition-colors" : ""}
          onClick={() => onNavigateToCatalog?.()}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalProducts}</div></CardContent>
        </Card>
        <Card
          className={onNavigateToCatalog ? "cursor-pointer hover:border-primary transition-colors" : ""}
          onClick={() => onNavigateToCatalog?.()}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Palette className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{categoryCount}</div></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Product Categories</CardTitle>
          {onNavigateToCatalog && (
            <p className="text-xs text-muted-foreground">Click a category to filter the catalog</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(categories.data ?? []).map((c: any) => (
              onNavigateToCatalog ? (
                <button
                  key={c.category}
                  onClick={() => onNavigateToCatalog(c.category)}
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                >
                  {c.category} ({c.count})
                </button>
              ) : (
                <Badge key={c.category} variant="secondary">{c.category} ({c.count})</Badge>
              )
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────────────────
function OverviewPage() {
  const adminDistId = useAdminDistributorId();
  const myLine = trpc.distributorPortal.myLine.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);

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

  if (!myLine.data) {
    return <div className="p-4 text-muted-foreground">Your vendor line is not available yet. You can still use the portal navigation while the line information is prepared.</div>;
  }

  const { line, counts, styles } = myLine.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{line.name}</h2>
        <p className="text-muted-foreground">Manage your product line, pricing, and 3D Designer presence.</p>
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
            <span className="text-muted-foreground">3D Designer Picks</span>
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
  const adminDistId = useAdminDistributorId();
  const myLine = trpc.distributorPortal.myLine.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
  const [styleId, setStyleId] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [editingPrice, setEditingPrice] = useState<{ skuId: number; field: string; value: string } | null>(null);
  const [editingOnHand, setEditingOnHand] = useState<{ skuId: number; value: string } | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const catalogInput = useMemo(
    () => ({
      ...(adminDistId ? { distributorId: adminDistId } : {}),
      styleId: styleId === ALL ? undefined : Number(styleId),
      category: category === ALL ? undefined : category,
      search: search.trim() || undefined,
      onlyHidden: onlyHidden || undefined,
      limit: 100,
      offset: 0,
    }),
    [styleId, category, search, onlyHidden, adminDistId]
  );

  const catalog = trpc.distributorPortal.catalog.useQuery(catalogInput, {
    enabled: !!myLine.data,
  });

  const toggleVis = trpc.distributorPortal.setVisibility.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      utils.distributorPortal.myLine.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePrice = trpc.distributorPortal.updatePrice.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      toast.success("Price updated");
      setEditingPrice(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateOnHand = trpc.distributorPortal.updateOnHandInventory.useMutation({
    onSuccess: () => {
      void utils.distributorPortal.catalog.invalidate();
      void utils.distributorPortal.inventoryForecast.invalidate();
      toast.success("On-hand inventory updated");
      setEditingOnHand(null);
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
        ...(adminDistId ? { distributorId: adminDistId } : {}),
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
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-center">Visible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.data?.items.map((item) => (
                <TableRow key={item.skuId}>
                  <TableCell>
                    {item.imageUrl || item.catalogImageUrl ? (
                      <img src={item.imageUrl || item.catalogImageUrl!} alt="" className="h-10 w-10 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.masterCode ?? item.distributorSku ?? item.platformSku}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{item.description ?? item.supplierCabinetName ?? "Pending master-cabinet mapping"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{item.styleName}</Badge></TableCell>
                  <TableCell className="text-xs">{item.category ?? <span className="text-muted-foreground">Unmapped</span>}</TableCell>
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
                  <TableCell className="text-right">
                    <button
                      className="text-sm hover:underline cursor-pointer"
                      onClick={() => setEditingOnHand({ skuId: item.skuId, value: item.onHandQty == null ? "" : String(item.onHandQty) })}
                      title="Set current on-hand inventory for this vendor SKU"
                    >
                      {item.onHandQty == null ? "—" : item.onHandQty.toLocaleString()}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={item.isPublished}
                      onCheckedChange={(checked) => {
                        toggleVis.mutate({
                          ...(adminDistId ? { distributorId: adminDistId } : {}),
                          skuId: item.skuId,
                          isPublished: checked,
                        });
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
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
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
                    ...(adminDistId ? { distributorId: adminDistId } : {}),
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

      {editingOnHand && (
        <Dialog open onOpenChange={() => setEditingOnHand(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Set on-hand inventory</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Leave blank when this vendor has no inventory feed. Zero is a valid reported quantity.</p>
            <Input
              type="number"
              min="0"
              step="1"
              value={editingOnHand.value}
              onChange={(event) => setEditingOnHand({ ...editingOnHand, value: event.target.value })}
              placeholder="No inventory feed"
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingOnHand(null)}>Cancel</Button>
              <Button
                disabled={updateOnHand.isPending}
                onClick={() => updateOnHand.mutate({
                  ...(adminDistId ? { distributorId: adminDistId } : {}),
                  skuId: editingOnHand.skuId,
                  onHandQty: editingOnHand.value.trim() === "" ? null : Number(editingOnHand.value),
                })}
              >
                {updateOnHand.isPending ? "Saving…" : "Save inventory"}
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
  const adminDistId = useAdminDistributorId();
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

      bulkUpdate.mutate({ rows, ...(adminDistId ? { distributorId: adminDistId } : {}) });
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
  const adminDistId = useAdminDistributorId();
  const myLine = trpc.distributorPortal.myLine.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
  const [form, setForm] = useState({
    styleId: "",
    distributorSku: "",
    listPrice: "",
    yourCost: "",
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
          <p className="mt-1 text-xs text-muted-foreground">Enter any supplier SKU. Master-cabinet matching is optional and can be completed during approval.</p>
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
          <label className="text-sm font-medium">List Price <span className="text-muted-foreground">(optional if Cost is entered)</span></label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.listPrice}
            onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Your Cost <span className="text-muted-foreground">(optional if List Price is entered)</span></label>
          <Input
            type="number" step="0.01" placeholder="0.00"
            value={form.yourCost}
            onChange={(e) => setForm({ ...form, yourCost: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button
          onClick={() => {
            if (!form.styleId || !form.distributorSku) {
              toast.error("Style and SKU are required");
              return;
            }
            if (!form.listPrice && !form.yourCost) {
              toast.error("Enter a List Price or Your Cost");
              return;
            }
            submit.mutate({
              ...(adminDistId ? { distributorId: adminDistId } : {}),
              styleId: Number(form.styleId),
              distributorSku: form.distributorSku,
              listPrice: form.listPrice || undefined,
              yourCost: form.yourCost || undefined,
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
  const adminDistId = useAdminDistributorId();
  const picks = trpc.distributorPortal.getDesignToolPicks.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
  const catalog = trpc.distributorPortal.catalog.useQuery({ ...(adminDistId ? { distributorId: adminDistId } : {}), limit: 500, offset: 0 });
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
    setPicks.mutate({ skuIds: newPicks, ...(adminDistId ? { distributorId: adminDistId } : {}) });
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
        <h2 className="text-xl font-bold">3D Designer Picks</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select up to {MAX_PICKS} products to feature in the 3D Designer.
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
            onClick={() => setPicks.mutate({ skuIds: [], ...(adminDistId ? { distributorId: adminDistId } : {}) })}
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
  const adminDistId = useAdminDistributorId();
  const myLine = trpc.distributorPortal.myLine.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
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
      ...(adminDistId ? { distributorId: adminDistId } : {}),
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
            <CardContent className="p-4 space-y-3">
              <div>
                <h3 className="font-medium">{style.ourName}</h3>
                <p className="text-xs text-muted-foreground">{style.doorStyle}</p>
              </div>

              {/* Image previews */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "doorSample" as const, label: "Door Sample", url: style.doorSampleImageUrl },
                  { key: "roomScene" as const, label: "Room Scene", url: style.roomSceneImageUrl },
                  { key: "thumbnail" as const, label: "Thumbnail", url: style.thumbnailImageUrl },
                ] as { key: "doorSample" | "roomScene" | "thumbnail"; label: string; url?: string | null }[]).map(({ key, label, url }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setUploadTarget({ styleId: style.id, imageType: key });
                      fileInputRef.current?.click();
                    }}
                    disabled={updateImage.isPending}
                    className="group relative rounded-md overflow-hidden border border-border bg-muted/30 aspect-square flex flex-col items-center justify-center hover:border-primary transition-colors"
                    title={url ? `Replace ${label}` : `Upload ${label}`}
                  >
                    {url ? (
                      <>
                        <img
                          src={url}
                          alt={label}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <Upload className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span className="text-[10px] font-medium text-center leading-tight px-1">{label}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Status badges */}
              <div className="flex gap-1 flex-wrap">
                {style.doorSampleImageUrl && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">Door ✓</span>}
                {style.roomSceneImageUrl && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">Scene ✓</span>}
                {style.thumbnailImageUrl && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">Thumb ✓</span>}
                {!style.doorSampleImageUrl && !style.roomSceneImageUrl && !style.thumbnailImageUrl && (
                  <span className="text-[10px] text-muted-foreground">No images yet — click a slot to upload</span>
                )}
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

// ─── Featured Styles Page ─────────────────────────────────────────────────────
// This deliberately mirrors the Featured Door Styles workflow used by the
// administrator, but its procedure only returns styles that have actual cabinet
// SKU rows in the current vendor's supply line. The client never receives a
// different vendor's styles as a fallback.
type VendorFeaturedStyle = {
  id: number;
  styleCode: string;
  ourName: string;
  distributorName: string;
  doorStyle: string | null;
  color: string | null;
  finish: string | null;
  woodSpecies: string | null;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  thumbnailImageUrl: string | null;
  doorSampleVerified: boolean;
  isFeatured: boolean;
  featuredRank: number;
  isActive: boolean;
  skuCount: number;
  roomScenes: Array<{ id: number; imageUrl: string; sortOrder: number; isVerified: boolean; isActive: boolean }>;
};

function vendorStyleThumb(style: VendorFeaturedStyle): string | null {
  return style.roomSceneImageUrl
    || style.roomScenes.find((scene) => scene.isActive)?.imageUrl
    || style.doorSampleImageUrl
    || style.thumbnailImageUrl
    || null;
}

function VendorFeaturedStylesPage() {
  const utils = trpc.useUtils();
  const adminDistId = useAdminDistributorId();
  const [search, setSearch] = useState("");
  const stylesQuery = trpc.distributorPortal.featuredStyles.useQuery(
    adminDistId ? { distributorId: adminDistId } : undefined,
  );
  const setFeatured = trpc.distributorPortal.setFeaturedStyle.useMutation({
    onSuccess: () => {
      utils.distributorPortal.featuredStyles.invalidate();
      utils.distributorPortal.myLine.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const reorder = trpc.distributorPortal.reorderFeaturedStyles.useMutation({
    onSuccess: () => utils.distributorPortal.featuredStyles.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const styles = useMemo(
    () => (stylesQuery.data ?? []) as VendorFeaturedStyle[],
    [stylesQuery.data],
  );
  const includesSearch = useCallback((style: VendorFeaturedStyle) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${style.ourName} ${style.distributorName} ${style.styleCode} ${style.doorStyle ?? ""} ${style.color ?? ""} ${style.finish ?? ""}`
      .toLowerCase()
      .includes(term);
  }, [search]);
  const featured = useMemo(
    () => styles
      .filter((style) => style.isFeatured)
      .filter(includesSearch)
      .sort((left, right) => left.featuredRank - right.featuredRank || left.ourName.localeCompare(right.ourName)),
    [styles, includesSearch],
  );
  const available = useMemo(
    () => styles
      .filter((style) => style.isActive && !style.isFeatured)
      .filter(includesSearch)
      .sort((left, right) => left.ourName.localeCompare(right.ourName)),
    [styles, includesSearch],
  );

  const hasVerifiedScene = (style: VendorFeaturedStyle) =>
    style.roomScenes.some((scene) => scene.isActive && scene.isVerified);
  const mutateInput = (input: { styleId: number; featured: boolean }) => ({
    ...input,
    ...(adminDistId ? { distributorId: adminDistId } : {}),
  });
  const move = (index: number, direction: -1 | 1) => {
    const next = [...featured];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({
      orderedIds: next.map((style) => style.id),
      ...(adminDistId ? { distributorId: adminDistId } : {}),
    });
  };

  if (stylesQuery.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>;
  }
  if (stylesQuery.error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load Featured Styles: {stylesQuery.error.message}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Star className="h-5 w-5 text-primary" /> Featured Door Styles</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Curate the cabinet lines featured from your vendor portal. This copy of Featured Styles only includes door styles that have cabinets in your catalog.
          </p>
        </div>
        <Badge variant="secondary" className="self-start text-sm sm:self-auto">{featured.length} featured cabinet line{featured.length === 1 ? "" : "s"}</Badge>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Featured Door Styles ({featured.length})</h3>
        {featured.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No featured cabinet lines yet. Add a room-scene-ready style from your cabinet catalog below.
          </div>
        ) : (
          <ul className="space-y-2">
            {featured.map((style, index) => {
              const image = vendorStyleThumb(style);
              return (
                <li key={style.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  {image ? <img src={image} alt={style.ourName} className="h-12 w-12 shrink-0 rounded object-cover ring-1 ring-border" /> : <div className="h-12 w-12 shrink-0 rounded bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{style.ourName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="border-blue-300 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700"><Package className="mr-0.5 h-2.5 w-2.5" /> {style.skuCount} cabinet SKU{style.skuCount === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700"><ImageIcon className="mr-0.5 h-2.5 w-2.5" /> Room scene ready</Badge>
                      <span className="text-xs text-muted-foreground">{[style.doorStyle, style.color, style.finish].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} aria-label={`Move ${style.ourName} up`}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === featured.length - 1 || reorder.isPending} onClick={() => move(index, 1)} aria-label={`Move ${style.ourName} down`}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" disabled={setFeatured.isPending} onClick={() => setFeatured.mutate(mutateInput({ styleId: style.id, featured: false }))} aria-label={`Remove ${style.ourName} from featured`}><X className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">My cabinet lines <span className="font-normal normal-case text-muted-foreground/60">({available.length})</span></h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search my cabinet lines…" className="h-9 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">{styles.length === 0 ? "No cabinet-backed door styles are available in this vendor catalog." : "No matching cabinet lines."}</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((style) => {
              const image = vendorStyleThumb(style);
              const sceneReady = hasVerifiedScene(style);
              return (
                <div key={style.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
                  {image ? <img src={image} alt={style.ourName} className="h-11 w-11 shrink-0 rounded object-cover ring-1 ring-border" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{style.ourName}</p>
                    <p className="truncate text-xs text-muted-foreground">{style.skuCount} cabinet SKU{style.skuCount === 1 ? "" : "s"} {[style.doorStyle, style.color].filter(Boolean).length > 0 ? `· ${[style.doorStyle, style.color].filter(Boolean).join(" · ")}` : ""}</p>
                    <p className={`mt-1 text-[10px] ${sceneReady ? "text-emerald-700" : "text-amber-700"}`}>{sceneReady ? "Verified room scene ready" : "Add a verified room scene in Door Styles first"}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={setFeatured.isPending || !sceneReady} onClick={() => setFeatured.mutate(mutateInput({ styleId: style.id, featured: true }))} aria-label={`Feature ${style.ourName}`} title={sceneReady ? "Feature this cabinet line" : "Add a verified matching room scene in Door Styles first"}><Star className="h-4 w-4 text-muted-foreground/60" /></Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shipping Page ────────────────────────────────────────────────────────────
function centsToDollars(value: number | null | undefined): string | null {
  return value == null ? null : `$${(value / 100).toFixed(2)}`;
}

function VendorShippingPage() {
  const adminDistId = useAdminDistributorId();
  const shipping = trpc.distributorPortal.shippingOverview.useQuery(
    adminDistId ? { distributorId: adminDistId } : undefined,
  );

  if (shipping.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (shipping.error || !shipping.data) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load shipping readiness: {shipping.error?.message ?? "No supply-line data returned."}</div>;
  }

  const { line, styles, allCabinetsCovered } = shipping.data;
  const warehouses = line.warehouseZips ?? [];
  const flatFee = centsToDollars(line.shippingFlatFreightFeeCents);
  const freeThreshold = centsToDollars(line.shippingFreeFreightThresholdCents);
  const policyLabel = line.shippingRuleMode === "fixed"
    ? `Fixed freight${flatFee ? ` · ${flatFee}` : ""}`
    : line.shippingRuleMode === "threshold"
      ? `Free freight threshold${freeThreshold ? ` · ${freeThreshold}` : ""}`
      : "Live freight quote";

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Truck className="h-6 w-6 text-primary" /> Shipping & Warehouses</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Shipping origins and cabinet-line readiness for {line.name}. The freight engine uses these same origin assignments when it quotes a shipment.</p>
        </div>
        <Badge variant="secondary" className="w-fit">{styles.length} cabinet line{styles.length === 1 ? "" : "s"}</Badge>
      </div>

      <Card className={allCabinetsCovered ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/50"}>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {allCabinetsCovered ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" /> : <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />}
            <div>
              <h3 className="font-semibold">{allCabinetsCovered ? "All cabinet lines cover every configured warehouse" : "Warehouse-origin coverage needs attention"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {allCabinetsCovered
                  ? `Every cabinet line inherits or explicitly lists all ${warehouses.length} configured warehouse origin${warehouses.length === 1 ? "" : "s"}.`
                  : warehouses.length === 0
                    ? "Add a verified warehouse origin before freight can use the line automatically."
                    : "At least one cabinet line has a limited origin assignment. Review the checkmarks below before quoting freight."}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={allCabinetsCovered ? "border-emerald-400 bg-white text-emerald-700" : "border-amber-400 bg-white text-amber-700"}>{warehouses.length} configured warehouse origin{warehouses.length === 1 ? "" : "s"}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Configured warehouses</CardTitle></CardHeader>
          <CardContent>
            {warehouses.length === 0 ? <p className="text-sm text-muted-foreground">No verified warehouse origin ZIPs are configured yet.</p> : (
              <div className="flex flex-wrap gap-2">
                {warehouses.map((zip) => <Badge key={zip} variant="outline" className="gap-1.5 border-sky-300 bg-sky-50 px-2.5 py-1 text-sky-800"><MapPin className="h-3.5 w-3.5" /> {zip}</Badge>)}
              </div>
            )}
            {(line.warehouseName || line.warehouseAddress) && <p className="mt-3 text-xs text-muted-foreground">{[line.warehouseName, line.warehouseAddress].filter(Boolean).join(" · ")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Shipping rule</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{policyLabel}</p>
            <p className="text-muted-foreground">Lead time: {line.leadTimeDays ?? "—"} days</p>
            {line.pickupEnabled && <p className="text-muted-foreground">Local pickup: {line.pickupZip ?? warehouses[0] ?? "origin pending"} · {line.pickupRadiusMiles ?? 100} mile radius</p>}
            {line.shippingExceptions && <p className="text-xs text-amber-700">Shipping note: {line.shippingExceptions}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cabinet-line warehouse coverage</CardTitle>
          <p className="text-xs text-muted-foreground">A check means this style's cabinet catalog uses every configured warehouse origin, either through its own origin ZIPs or its distributor warehouse fallback. It does not represent a live on-hand inventory count.</p>
        </CardHeader>
        <CardContent className="p-0">
          {styles.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No cabinet-backed styles are available to assess.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Cabinet line</TableHead><TableHead>Catalog status</TableHead><TableHead>Shipping origins</TableHead><TableHead className="text-right">All warehouses</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {styles.map((style) => {
                    const image = style.roomSceneImageUrl || style.doorSampleImageUrl || style.thumbnailImageUrl;
                    const publishable = style.availableCount === style.catalogCount && style.publishedCount === style.catalogCount;
                    return (
                      <TableRow key={style.id}>
                        <TableCell>
                          <div className="flex min-w-48 items-center gap-2.5">
                            {image ? <img src={image} alt={style.ourName} className="h-9 w-9 rounded object-cover ring-1 ring-border" /> : <div className="flex h-9 w-9 items-center justify-center rounded bg-muted"><Palette className="h-4 w-4 text-muted-foreground" /></div>}
                            <div className="min-w-0"><p className="truncate font-medium">{style.ourName}</p><p className="truncate text-xs text-muted-foreground">{[style.doorStyle, style.color, style.finish].filter(Boolean).join(" · ")}</p></div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className={publishable ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}>{style.availableCount}/{style.catalogCount} available · {style.publishedCount}/{style.catalogCount} published</Badge></TableCell>
                        <TableCell><div className="flex min-w-48 flex-wrap gap-1">{style.originZips.map((zip) => <Badge key={zip} variant="secondary" className="text-[10px]">{zip}</Badge>)}{style.originZips.length === 0 && <span className="text-xs text-amber-700">Origin needed</span>}</div></TableCell>
                        <TableCell className="text-right">{style.allWarehousesCovered ? <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Covered</span> : <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700"><MapPin className="h-4 w-4" /> Review</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Promotions Page ─────────────────────────────────────────────────────────
function PromotionsPage() {
  const adminDistId = useAdminDistributorId();
  const promos = trpc.promotions.list.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
  const createMut = trpc.promotions.create.useMutation({
    onSuccess: () => { promos.refetch(); toast.success("Promotion created"); setShowCreate(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleMut = trpc.promotions.update.useMutation({
    onSuccess: () => promos.refetch(),
    onError: (e: any) => toast.error(e.message),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    discountType: "percent" as "percent" | "fixed_price",
    discountValue: "",
    targetType: "all" as "all" | "sku" | "category",
    targetValue: "",
    startsAt: "",
    endsAt: "",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Promotions</h2>
          <p className="text-muted-foreground">Create sales and discounts for your products.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> New Promotion
        </Button>
      </div>

      {promos.isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : promos.data?.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <DollarSign className="mx-auto h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No promotions yet</p>
          <p className="text-sm">Create your first promotion to offer discounts to customers.</p>
        </CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promos.data?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {p.discountType === "percent" ? `${p.discountValue}% off` : `$${Number(p.discountValue).toFixed(2)} off`}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {p.category ? `Category: ${p.category}` : p.skuIds?.length ? `${p.skuIds.length} SKU(s)` : "All Products"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.startsAt ? new Date(p.startsAt).toLocaleDateString() : "—"}
                  {" → "}
                  {p.endsAt ? new Date(p.endsAt).toLocaleDateString() : "Ongoing"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={p.isActive}
                    onCheckedChange={() => toggleMut.mutate({ id: p.id, isActive: !p.isActive, ...(adminDistId ? { distributorId: adminDistId } : {}) })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Promotion Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Summer Sale 20% Off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Discount Type</label>
                <Select value={form.discountType} onValueChange={(v) => setForm(f => ({ ...f, discountType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage Off</SelectItem>
                    <SelectItem value="fixed_price">Fixed Amount Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Value</label>
                <Input type="number" value={form.discountValue} onChange={(e) => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === "percent" ? "20" : "5.00"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Target</label>
                <Select value={form.targetType} onValueChange={(v) => setForm(f => ({ ...f, targetType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All My Products</SelectItem>
                    <SelectItem value="sku">Specific SKU</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.targetType !== "all" && (
                <div>
                  <label className="text-sm font-medium">{form.targetType === "sku" ? "SKU Code" : "Category Name"}</label>
                  <Input value={form.targetValue} onChange={(e) => setForm(f => ({ ...f, targetValue: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start Date (optional)</label>
                <Input type="date" value={form.startsAt} onChange={(e) => setForm(f => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">End Date (optional)</label>
                <Input type="date" value={form.endsAt} onChange={(e) => setForm(f => ({ ...f, endsAt: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.name || !form.discountValue || createMut.isPending}
              onClick={() => createMut.mutate({
                ...(adminDistId ? { distributorId: adminDistId } : {}),
                name: form.name,
                discountType: form.discountType,
                discountValue: Number(form.discountValue),
                category: form.targetType === "category" ? form.targetValue : undefined,
                startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
                endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
              })}
            >
              {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Gallery Page ─────────────────────────────────────────────────────────────
function GalleryPage() {
  const adminDistId = useAdminDistributorId();
  const gallery = trpc.gallery.listByDistributor.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);
  const uploadMut = trpc.gallery.upload.useMutation();
  const deleteMut = trpc.gallery.delete.useMutation();
  const utils = trpc.useUtils();
  const [selectedSku, setSelectedSku] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Get catalog for SKU selector
  const catalog = trpc.distributorPortal.catalog.useQuery({ ...(adminDistId ? { distributorId: adminDistId } : {}), limit: 500, offset: 0 });
  const skuOptions = (catalog.data?.items ?? []).map((item: any) => ({
    id: item.id as number,
    label: `${item.masterCode ?? ""} — ${item.styleName ?? "SKU"} #${item.id}`,
  }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSku) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await uploadMut.mutateAsync({
          ...(adminDistId ? { distributorId: adminDistId } : {}),
          skuId: selectedSku,
          imageBase64: base64,
          fileName: file.name,
          contentType: file.type || "image/jpeg",
        });
        utils.gallery.listByDistributor.invalidate();
      } catch (err: any) {
        alert(err.message || "Upload failed");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this image?")) return;
    await deleteMut.mutateAsync({ id, ...(adminDistId ? { distributorId: adminDistId } : {}) });
    utils.gallery.listByDistributor.invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Product Gallery</h2>
      </div>

      {/* Upload section */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">Upload lifestyle photos, detail shots, or room scenes for your products.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="border rounded px-3 py-2 text-sm bg-background"
              value={selectedSku ?? ""}
              onChange={(e) => setSelectedSku(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select a product...</option>
              {skuOptions.map((s: { id: number; label: string }) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!selectedSku || uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploadMut.isPending ? "Uploading..." : "Upload Image"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
        </CardContent>
      </Card>

      {/* Gallery grid */}
      {gallery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square w-full" />)}
        </div>
      ) : (gallery.data?.length ?? 0) === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No gallery images yet. Upload your first product photo above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(gallery.data ?? []).map((img: any) => (
            <div key={img.id} className="relative group rounded-lg overflow-hidden border border-border">
              <img src={img.s3Url} alt={img.caption || "Product"} className="w-full aspect-square object-cover" />
              {img.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 truncate">
                  {img.caption}
                </div>
              )}
              <button
                onClick={() => handleDelete(img.id)}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vendor Analytics Page ───────────────────────────────────────────────────
function VendorAnalyticsPage() {
  const adminDistId = useAdminDistributorId();
  const { user } = useAuth();
  const [days, setDays] = useState(60);
  const [inventoryDays, setInventoryDays] = useState<30 | 90 | 180>(180);
  const [showDeadDesigns, setShowDeadDesigns] = useState(false);
  const [baseRatePercent, setBaseRatePercent] = useState("");
  const [lowRatePercent, setLowRatePercent] = useState("");
  const [highRatePercent, setHighRatePercent] = useState("");
  const summary = trpc.analytics.summary.useQuery({ days, ...(adminDistId ? { distributorId: adminDistId } : {}) });
  const forecast = trpc.analytics.savedPlanForecast.useQuery({ days, ...(adminDistId ? { distributorId: adminDistId } : {}) });
  const inventoryForecast = trpc.distributorPortal.inventoryForecast.useQuery({
    days: inventoryDays,
    includeDead: showDeadDesigns,
    ...(adminDistId ? { distributorId: adminDistId } : {}),
  });
  const utils = trpc.useUtils();
  const updateRates = trpc.distributorPortal.updateInventoryForecastRates.useMutation({
    onSuccess: () => {
      void utils.distributorPortal.inventoryForecast.invalidate();
      toast.success("Inventory forecast rate saved");
    },
    onError: (error) => toast.error(error.message || "Could not save the forecast rate"),
  });

  useEffect(() => {
    const rates = inventoryForecast.data?.rates;
    if (!rates) return;
    setBaseRatePercent(rates.baseRateBps == null ? "" : String(rates.baseRateBps / 100));
    setLowRatePercent(rates.lowRateBps == null ? "" : String(rates.lowRateBps / 100));
    setHighRatePercent(rates.highRateBps == null ? "" : String(rates.highRateBps / 100));
  }, [inventoryForecast.data?.rates.baseRateBps, inventoryForecast.data?.rates.lowRateBps, inventoryForecast.data?.rates.highRateBps]);

  const exportInventoryForecast = useCallback(() => {
    const inventory = inventoryForecast.data;
    if (!inventory) return;
    const header = ["Master SKU", "Vendor ordering SKU", "Open designs (qty)", "Open designs", "Affiliates", "Projected sell-through", "Low", "High", "Suggested stock", "On hand", "Status", "Notes"];
    const rows = inventory.rows.map((row) => [
      row.masterCode,
      row.vendorSku,
      row.openDesignQty,
      row.openDesignCount,
      row.affiliateCount,
      row.projectedSellThrough,
      row.lowProjectedSellThrough,
      row.highProjectedSellThrough,
      row.suggestedStock,
      row.onHandQty,
      row.stockStatus,
      row.stockStatus === "demand_only" ? "Vendor inventory feed not provided" : row.stockStatus === "rate_tbd" ? "Close rate TBD by administrator" : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-forecast-${inventory.lineName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${inventoryDays}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [inventoryForecast.data, inventoryDays]);

  if (summary.isLoading || forecast.isLoading || inventoryForecast.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  const data = summary.data;
  const savedPlanForecast = forecast.data;
  const inventory = inventoryForecast.data;
  if (!data || !savedPlanForecast || !inventory) return <p className="text-muted-foreground">No analytics data available.</p>;
  const isAdmin = user?.role === "admin";
  const toBps = (value: string) => value.trim() === "" ? null : Math.round(Number(value) * 100);
  const statusLabel: Record<string, string> = { short: "Short", ok: "OK", over: "Over", demand_only: "Demand only", rate_tbd: "Rate TBD" };
  const statusClass: Record<string, string> = {
    short: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    over: "border-amber-200 bg-amber-50 text-amber-800",
    demand_only: "border-slate-200 bg-slate-50 text-slate-700",
    rate_tbd: "border-violet-200 bg-violet-50 text-violet-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Product Analytics</h2>
        <select
          className="border rounded px-3 py-1.5 text-sm bg-background"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <section className="space-y-4" aria-labelledby="saved-plan-demand-heading">
        <div>
          <h3 id="saved-plan-demand-heading" className="text-lg font-semibold">Saved-plan demand forecast</h3>
          <p className="text-sm text-muted-foreground">A demand signal from saved plans in the last {days} days. It does not use submitted orders or represent a sales commitment.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Saved plans</p>
              <p className="text-3xl font-bold">{savedPlanForecast.savedPlanCount.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Projected cabinet units</p>
              <p className="text-3xl font-bold">{savedPlanForecast.projectedCabinetQty.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Latest saved-plan activity</p>
              <p className="text-base font-semibold">{savedPlanForecast.latestSavedAt ? new Date(savedPlanForecast.latestSavedAt).toLocaleDateString() : "No recent plans"}</p>
            </CardContent>
          </Card>
        </div>

        {savedPlanForecast.topSkus.length > 0 ? (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Leading SKU demand</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Style</TableHead><TableHead className="text-right">Units in plans</TableHead><TableHead className="text-right">Plans</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {savedPlanForecast.topSkus.map((row) => (
                      <TableRow key={`${row.platformSku}-${row.styleId}`}>
                        <TableCell className="font-medium">{row.sku}</TableCell>
                        <TableCell>{row.style}</TableCell>
                        <TableCell className="text-right">{row.units.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.planCount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">No vendor-matched cabinet selections appear in saved plans for this period yet.</CardContent></Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Styles in the pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {savedPlanForecast.topStyles.length > 0 ? savedPlanForecast.topStyles.map((row) => (
                <div key={row.styleId} className="flex items-center justify-between text-sm gap-3">
                  <span className="truncate">{row.style}</span>
                  <Badge variant="secondary">{row.units} units · {row.planCount} plans</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground">No matched styles in the selected period.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Recent saved-plan timing</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {savedPlanForecast.activity.length > 0 ? savedPlanForecast.activity.slice(-8).map((row) => (
                <div key={row.day} className="flex items-center justify-between text-sm gap-3"><span>{new Date(`${row.day}T00:00:00Z`).toLocaleDateString()}</span><Badge variant="outline">{row.planCount} saved</Badge></div>
              )) : <p className="text-sm text-muted-foreground">No saved-plan activity in the selected period.</p>}
            </CardContent>
          </Card>
        </div>

        {savedPlanForecast.unresolvedCabinetQty > 0 && (
          <p className="text-xs text-muted-foreground">{savedPlanForecast.unresolvedCabinetQty.toLocaleString()} cabinet unit{savedPlanForecast.unresolvedCabinetQty === 1 ? "" : "s"} could not be matched to a current vendor SKU and are excluded from the SKU demand list.</p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="inventory-forecast-heading">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 id="inventory-forecast-heading" className="text-lg font-semibold">Design → Inventory forecast</h3>
            <p className="text-sm text-muted-foreground">Master-SKU demand from active open designs only. Designs closed by a confirmed or paid order are excluded; unsold designs at least seven months old are dead and never inflate the forecast.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={String(inventoryDays)} onValueChange={(value) => setInventoryDays(Number(value) as 30 | 90 | 180)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="180">Last 180 days</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportInventoryForecast} disabled={inventory.rows.length === 0}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Open active designs</p><p className="text-3xl font-bold">{inventory.openDesignCount}</p><p className="mt-1 text-xs text-muted-foreground">Since {new Date(inventory.activeSince).toLocaleDateString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Closed designs excluded</p><p className="text-3xl font-bold">{inventory.closedDesignCount}</p><p className="mt-1 text-xs text-muted-foreground">Confirmed or paid orders are not pipeline demand.</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Close-rate factor</p><p className="text-3xl font-bold">{inventory.rateConfigured ? `${(inventory.rates.baseRateBps! / 100).toFixed(1)}%` : "TBD"}</p><p className="mt-1 text-xs text-muted-foreground">{inventory.rateConfigured ? "Administrator-configured, not assumed." : "Set by an administrator before projected units are calculated."}</p></CardContent></Card>
        </div>

        {isAdmin && adminDistId && <Card className="border-violet-200 bg-violet-50/40"><CardHeader className="pb-3"><CardTitle className="text-base">Administrator forecast rate</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4 md:items-end"><Label className="space-y-1"><span>Low close rate (%)</span><Input type="number" min="0" max="100" step="0.1" value={lowRatePercent} onChange={(event) => setLowRatePercent(event.target.value)} placeholder="Optional" /></Label><Label className="space-y-1"><span>Base close rate (%)</span><Input type="number" min="0" max="100" step="0.1" value={baseRatePercent} onChange={(event) => setBaseRatePercent(event.target.value)} placeholder="TBD" /></Label><Label className="space-y-1"><span>High close rate (%)</span><Input type="number" min="0" max="100" step="0.1" value={highRatePercent} onChange={(event) => setHighRatePercent(event.target.value)} placeholder="Optional" /></Label><Button disabled={updateRates.isPending} onClick={() => updateRates.mutate({ distributorId: adminDistId, baseRateBps: toBps(baseRatePercent), lowRateBps: toBps(lowRatePercent), highRateBps: toBps(highRatePercent) })}>{updateRates.isPending ? "Saving…" : "Save rates"}</Button></CardContent></Card>}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3"><div><CardTitle className="text-base">Vendor inventory requirements</CardTitle><p className="mt-1 text-xs text-muted-foreground">Vendor ordering SKU is an alias for the master nomenclature code. On-hand is shown only when the vendor has supplied inventory.</p></div><Button variant="ghost" size="sm" onClick={() => setShowDeadDesigns((value) => !value)}>{showDeadDesigns ? "Hide dead designs" : "View dead designs"}</Button></CardHeader>
          <CardContent className="p-0">
            {inventory.rows.length === 0 ? <div className="p-5 text-sm text-muted-foreground">No open vendor-matched designs in this active window. Dead designs are excluded from demand.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Master SKU</TableHead><TableHead>Vendor ordering SKU</TableHead><TableHead className="text-right">Open designs (qty)</TableHead><TableHead className="text-right">Projected sell-through</TableHead><TableHead className="text-right">Suggested stock</TableHead><TableHead className="text-right">On hand</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>{inventory.rows.map((row) => <TableRow key={row.masterCode}><TableCell className="font-medium">{row.masterCode}</TableCell><TableCell className="font-mono text-xs">{row.vendorSku}</TableCell><TableCell className="text-right">{row.openDesignQty} <span className="text-xs text-muted-foreground">({row.openDesignCount})</span></TableCell><TableCell className="text-right">{row.projectedSellThrough == null ? "TBD" : <><span>{row.projectedSellThrough}</span>{row.lowProjectedSellThrough != null && row.highProjectedSellThrough != null && <span className="block text-xs text-muted-foreground">{row.lowProjectedSellThrough}–{row.highProjectedSellThrough}</span>}</>}</TableCell><TableCell className="text-right">{row.suggestedStock ?? "TBD"}</TableCell><TableCell className="text-right">{row.onHandQty ?? "—"}</TableCell><TableCell><Badge variant="outline" className={statusClass[row.stockStatus]}>{statusLabel[row.stockStatus]}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{row.stockStatus === "demand_only" ? "On-hand feed not provided" : row.stockStatus === "rate_tbd" ? "Administrator rate is TBD" : `${row.affiliateCount} affiliate${row.affiliateCount === 1 ? "" : "s"} in pipeline`}</TableCell></TableRow>)}</TableBody></Table></div>}
          </CardContent>
        </Card>

        {showDeadDesigns && <Card className="border-slate-200"><CardHeader className="pb-3"><CardTitle className="text-base">Dead designs — excluded from forecast</CardTitle><p className="text-xs text-muted-foreground">Unsold designs with last activity on or before {new Date(inventory.deadBefore).toLocaleDateString()}.</p></CardHeader><CardContent>{inventory.deadDesigns.length === 0 ? <p className="text-sm text-muted-foreground">No unsold designs meet the seven-month dead cutoff.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Design</TableHead><TableHead>Last activity</TableHead><TableHead className="text-right">Placed cabinets</TableHead></TableRow></TableHeader><TableBody>{inventory.deadDesigns.map((design) => <TableRow key={design.id}><TableCell>{design.name}</TableCell><TableCell>{new Date(design.lastActivityAt).toLocaleDateString()}</TableCell><TableCell className="text-right">{design.placedCabinetCount}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>}
      </section>

      {/* Summary card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Product Views</p>
          <p className="text-3xl font-bold">{data.totalViews.toLocaleString()}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Avg. Daily Views</p>
          <p className="text-3xl font-bold">
            {days > 0 ? Math.round(data.totalViews / days).toLocaleString() : 0}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Top Referrers</p>
          <p className="text-3xl font-bold">{data.topReferrers?.length ?? 0}</p>
        </div>
      </div>

      {/* Daily views chart (simple bar representation) */}
      {data.dailyViews.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">Daily Views</h3>
          <div className="flex items-end gap-1 h-32">
            {data.dailyViews.map((d: any) => {
              const max = Math.max(...data.dailyViews.map((x: any) => x.count));
              const height = max > 0 ? (d.count / max) * 100 : 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{d.count}</span>
                  <div
                    className="w-full bg-primary/80 rounded-t min-h-[2px]"
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top products */}
      {data.topProducts.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">Top Products</h3>
          <div className="space-y-2">
            {data.topProducts.map((p: any, i: number) => (
              <div key={p.pageSlug} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">#{i + 1}</span>
                <span className="flex-1 ml-3 truncate">{p.pageSlug}</span>
                <Badge variant="secondary">{p.count} views</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top referrers */}
      {(data.topReferrers?.length ?? 0) > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">Traffic Sources</h3>
          <div className="space-y-2">
            {data.topReferrers!.map((r: any, i: number) => (
              <div key={r.referrer ?? i} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate">{r.referrer || "Direct"}</span>
                <Badge variant="outline">{r.count} visits</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.totalViews === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No product views recorded in the last {days} days. Views will appear here as customers browse your products.
        </p>
      )}
    </div>
  );
}

// ─── Orders Page ──────────────────────────────────────────────────────────────
function OrdersPage() {
  const adminDistId = useAdminDistributorId();
  const orders = trpc.distributorPortal.orders.useQuery({ limit: 50, ...(adminDistId ? { distributorId: adminDistId } : {}) });

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

// ─── AI Catalog Services Page ────────────────────────────────────────────────
function AICatalogServicesPage() {
  const [requestType, setRequestType] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [estimate, setEstimate] = useState<{ skus: number; hours: number; cost: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [approved, setApproved] = useState(false);

  const services = [
    {
      title: "Catalog Onboarding",
      description: "Upload your ProKitchen or 2020 Design catalog file — we'll parse, map SKUs, set pricing, and organize categories.",
      icon: Package,
    },
    {
      title: "Photo & Image Processing",
      description: "AI-generated product photos, background removal, and consistent catalog imagery across your line.",
      icon: ImageIcon,
    },
    {
      title: "Trim & Accessory Audit",
      description: "Cross-reference your catalog against the database, identify missing items, fix conflicts, and fill gaps.",
      icon: CheckCircle2,
    },
    {
      title: "Price Sheet Import",
      description: "Upload your price sheet and we'll map it to the system — style coverage, pricing tiers, and availability.",
      icon: FileSpreadsheet,
    },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setEstimate(null);
    setApproved(false);
    // Estimate based on file size (rough heuristic: ~1KB per SKU for XML/CSV)
    setEstimating(true);
    setTimeout(() => {
      const fileSizeKB = file.size / 1024;
      let estimatedSkus = 0;
      if (file.name.endsWith('.xml') || file.name.endsWith('.mfr')) {
        estimatedSkus = Math.max(50, Math.round(fileSizeKB / 2));
      } else {
        estimatedSkus = Math.max(20, Math.round(fileSizeKB / 0.5));
      }
      const skusPerHour = 150;
      const hours = Math.max(0.25, Math.ceil((estimatedSkus / skusPerHour) * 4) / 4);
      const cost = hours * 100;
      setEstimate({ skus: estimatedSkus, hours, cost });
      setEstimating(false);
    }, 1500);
  };

  const handleApproveEstimate = () => {
    setApproved(true);
    toast.success("Estimate approved! Processing will begin shortly. You'll be notified when complete.");
  };

  const handleSubmit = () => {
    if (!requestType) {
      toast.error("Please select a service type");
      return;
    }
    toast.success("Service request submitted! We'll be in touch within 24 hours.");
    setSubmitted(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Catalog Services
        </h2>
        <p className="text-muted-foreground mt-1">
          Let our AI-powered team get your products online fast. Professional catalog management at <span className="font-semibold text-foreground">$100/hour</span>.
        </p>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">1</div>
              <div>
                <p className="font-medium text-sm">Upload & Describe</p>
                <p className="text-xs text-muted-foreground">Upload your catalog file (ProKitchen, 2020 Design, CSV, Excel) and describe your needs.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">2</div>
              <div>
                <p className="font-medium text-sm">Get Estimate</p>
                <p className="text-xs text-muted-foreground">See the estimated time and cost instantly. The more info you provide, the lower the cost.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">3</div>
              <div>
                <p className="font-medium text-sm">Approve & Process</p>
                <p className="text-xs text-muted-foreground">Approve the estimate and our AI handles the heavy lifting — mapping SKUs, pricing, images.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">4</div>
              <div>
                <p className="font-medium text-sm">Review & Go Live</p>
                <p className="text-xs text-muted-foreground">Review the results in your portal, approve, and your products go live.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <Card key={service.title} className={`cursor-pointer transition-all ${
            requestType === service.title ? "ring-2 ring-primary" : "hover:border-primary/50"
          }`} onClick={() => setRequestType(service.title)}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <service.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{service.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload & Request form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upload Catalog & Request Service</CardTitle>
          <p className="text-xs text-muted-foreground">Upload your file AND describe what you need. The more information you provide, the faster and cheaper the AI processing.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="font-semibold text-lg">{approved ? "Approved & Processing" : "Request Submitted"}</h3>
              <p className="text-muted-foreground text-sm">{approved ? "Your catalog is being processed. You'll be notified when it's ready for review." : "We'll review your request and get back to you within 24 hours."}</p>
              <Button variant="outline" onClick={() => { setSubmitted(false); setApproved(false); setRequestType(""); setDetails(""); setUploadedFile(null); setEstimate(null); }}>
                Submit Another Request
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Type</label>
                <Select value={requestType} onValueChange={setRequestType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service..." />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.title} value={s.title}>{s.title}</SelectItem>
                    ))}
                    <SelectItem value="Other">Other (describe below)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Catalog File</label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept=".xml,.mfr,.csv,.xlsx,.xls,.json,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="catalog-upload"
                  />
                  <label htmlFor="catalog-upload" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{uploadedFile ? uploadedFile.name : "Click to upload catalog file"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports: ProKitchen (.xml), 2020 Design (.mfr, .xml), CSV, Excel (.xlsx)</p>
                  </label>
                </div>
                {uploadedFile && (
                  <p className="text-xs text-muted-foreground">File: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(0)} KB)</p>
                )}
              </div>

              {/* Estimate display */}
              {estimating && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm">Analyzing file and estimating cost...</span>
                </div>
              )}
              {estimate && !approved && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    Cost Estimate
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">~{estimate.skus}</p>
                      <p className="text-xs text-muted-foreground">Estimated SKUs</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-primary">{estimate.hours}h</p>
                      <p className="text-xs text-muted-foreground">Estimated Time</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-primary">${estimate.cost.toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">Estimated Cost</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Providing detailed descriptions below can reduce processing time by up to 40%.</p>
                  <Button onClick={handleApproveEstimate} className="w-full">
                    <Check className="h-4 w-4 mr-2" />
                    Approve Estimate & Start Processing
                  </Button>
                </div>
              )}
              {approved && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                  <p className="text-sm font-medium text-green-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Estimate approved — ${estimate?.cost.toFixed(0)} for ~{estimate?.hours}h of processing
                  </p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Details & Instructions</label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="The more detail you provide, the faster and cheaper the processing:\n\n• How many door styles / colors?\n• What pricing tiers do you use?\n• Any special SKU naming conventions?\n• Which categories (base, wall, tall, vanity, accessories)?\n• Any items to exclude?"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
                <p className="text-xs text-muted-foreground italic">Tip: The better the information you provide, the quicker AI processes your catalog and the less it costs.</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Billed at <span className="font-semibold text-foreground">$100/hr</span> · Typical turnaround: 24–48 hours</span>
                </div>
                <Button onClick={handleSubmit} disabled={!requestType}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Request
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Accepted formats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Accepted Catalog Formats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-sm">ProKitchen Export</p>
                <p className="text-xs text-muted-foreground">.xml catalog export from ProKitchen software</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                <FileSpreadsheet className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium text-sm">2020 Design Export</p>
                <p className="text-xs text-muted-foreground">.mfr or .xml manufacturer files from 2020 Design</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                <FileSpreadsheet className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-sm">CSV / Excel</p>
                <p className="text-xs text-muted-foreground">.csv or .xlsx spreadsheet with your product data</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                <FileSpreadsheet className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="font-medium text-sm">PDF Price Sheet</p>
                <p className="text-xs text-muted-foreground">Scanned or digital PDF price lists — AI extracts the data</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing note */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <h4 className="font-medium text-sm">Pricing & Billing</h4>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> $100/hour — billed in 15-minute increments</li>
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Free estimate before work begins — no surprises</li>
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> The more info you provide, the less time (and money) it takes</li>
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> No charge if you're not satisfied with the results</li>
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Most catalog imports completed in 2–4 hours ($200–$400)</li>
        </ul>
      </div>

      {/* History Log */}
      <ServiceHistoryLog />
    </div>
  );
}

function ServiceHistoryLog() {
  const adminDistId = useAdminDistributorId();
  const { data: history, isLoading } = trpc.distributorPortal.aiServiceHistory.useQuery(adminDistId ? { distributorId: adminDistId } : undefined);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Request History</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</div></CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Request History</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No previous service requests. Submit your first request above!</p></CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    estimated: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    processing: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-600",
    pending: "bg-orange-100 text-orange-800",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Request History</CardTitle>
        <p className="text-xs text-muted-foreground">Your previously submitted catalog processing requests and their outcomes.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {history.map((req: any) => (
            <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{req.serviceType}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || "bg-gray-100 text-gray-600"}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {req.fileName && <span>{req.fileName}</span>}
                  <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                {req.status === "completed" && req.actualCost ? (
                  <div>
                    <p className="font-semibold text-sm text-green-700">${Number(req.actualCost).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{Number(req.actualHours).toFixed(1)}h actual</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-sm">${Number(req.estimatedCost).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">~{Number(req.estimatedHours).toFixed(1)}h est.</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Integrations Page ───────────────────────────────────────────────────────
const INTEGRATIONS = [
  {
    id: "netsuite",
    name: "Oracle NetSuite",
    description: "Full ERP with inventory management. Sync stock levels, orders, and pricing automatically.",
    fields: ["Account ID", "Consumer Key", "Consumer Secret", "Token ID", "Token Secret"],
    popular: true,
  },
  {
    id: "epicor",
    name: "Epicor",
    description: "Building materials distribution ERP. Real-time inventory and order routing.",
    fields: ["API URL", "API Key", "Company ID"],
    popular: true,
  },
  {
    id: "quickbooks",
    name: "QuickBooks Commerce",
    description: "Inventory and order management for small-to-mid distributors.",
    fields: ["Client ID", "Client Secret", "Realm ID"],
    popular: true,
  },
  {
    id: "generic",
    name: "Custom REST API",
    description: "Connect any system with a REST API. Map your endpoints to our standard format.",
    fields: ["Base URL", "API Key", "Auth Header Name"],
    popular: false,
  },
];

function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // In production this would save to the backend
    toast.success("Integration credentials saved. Our team will verify the connection within 24 hours.");
    setSaved(true);
  };

  const selected = INTEGRATIONS.find((i) => i.id === selectedIntegration);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Inventory Integrations</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your inventory system to automatically sync stock levels, pricing, and orders.
        </p>
      </div>

      {!selectedIntegration ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {INTEGRATIONS.map((integration) => (
            <Card
              key={integration.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { setSelectedIntegration(integration.id); setSaved(false); setCredentials({}); }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{integration.description}</p>
                  </div>
                  {integration.popular && <Badge variant="secondary">Popular</Badge>}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  {integration.fields.length} credentials required
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="max-w-lg space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedIntegration(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to integrations
          </Button>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{selected?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{selected?.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected?.fields.map((field) => (
                <div key={field} className="space-y-1">
                  <Label>{field}</Label>
                  <Input
                    type="password"
                    placeholder={`Enter ${field}`}
                    value={credentials[field] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [field]: e.target.value })}
                  />
                </div>
              ))}
              {saved ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Credentials saved. Connection verification pending.
                </div>
              ) : (
                <Button onClick={handleSave} className="w-full">
                  Save & Verify Connection
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h4 className="font-medium text-sm mb-2">How it works</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Enter your API credentials above</li>
                <li>Our team verifies the connection within 24 hours</li>
                <li>Once verified, inventory syncs automatically every hour</li>
                <li>Orders are routed directly to your system</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Payments Page ───────────────────────────────────────────────────────────
function PaymentsPage() {
  const [connected, setConnected] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Payment Connection</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your Stripe account to receive automatic payouts when orders are fulfilled.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#635BFF]/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-[#635BFF]" />
            </div>
            <div>
              <h3 className="font-semibold">Stripe Connect</h3>
              <p className="text-xs text-muted-foreground">Receive your split of each order automatically</p>
            </div>
          </div>

          {connected ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Stripe account connected. Payouts are active.</span>
            </div>
          ) : (
            <>
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="text-sm font-medium">How split payments work:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Customer places an order through an affiliate storefront</li>
                  <li>Payment is collected by Cabinet Dealz via Stripe</li>
                  <li>Your fulfillment cost is automatically transferred to your Stripe account</li>
                  <li>Affiliate commission and broker fee are deducted</li>
                </ol>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  toast.info("Stripe Connect onboarding will be available once Cabinet Dealz activates Stripe integration.");
                }}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Connect Stripe Account
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Stripe to create or connect your account.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No payouts yet. Connect your Stripe account to start receiving payments.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Vendor Login Form ────────────────────────────────────────────────────────
function VendorLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  // Check for invite token in URL
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite");
  const [inviteVendor, setInviteVendor] = useState<string | null>(null);

  useEffect(() => {
    if (inviteToken) {
      setMode("register");
      // Fetch vendor info from invite token
      fetch(`/api/trpc/vendors.getByInvite?input=${encodeURIComponent(JSON.stringify({ token: inviteToken }))}`)
        .then(r => r.json())
        .then(data => {
          if (data?.result?.data) {
            setInviteVendor(data.result.data.name);
          }
        })
        .catch(() => {});
    }
  }, [inviteToken]);

  const loginMutation = trpc.emailAuth.login.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err) => {
      setError(err.message || "Invalid email or password.");
    },
  });

  const registerMutation = trpc.emailAuth.signup.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err: any) => {
      setError(err.message || "Registration failed.");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      registerMutation.mutate({ email: email.trim(), password, inviteToken: inviteToken || undefined });
    } else {
      loginMutation.mutate({ email: email.trim(), password });
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Vendor Portal</CardTitle>
          {inviteVendor && mode === "register" ? (
            <p className="text-muted-foreground text-sm mt-1">
              You've been invited to join as a vendor for <strong>{inviteVendor}</strong>. Create your account below.
            </p>
          ) : mode === "register" ? (
            <p className="text-muted-foreground text-sm mt-1">
              Create your vendor account to manage your catalog and orders.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm mt-1">
              Sign in with your vendor credentials to manage your catalog and orders.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendor-email">Email</Label>
              <Input
                id="vendor-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-password">Password</Label>
              <div className="relative">
                <Input
                  id="vendor-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "register" ? "Create a password (8+ chars)" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="vendor-confirm-password">Confirm Password</Label>
                <Input
                  id="vendor-confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {mode === "register" ? "Creating account..." : "Signing in..."}</>
              ) : (
                mode === "register" ? "Create Account" : "Sign In"
              )}
            </Button>
          </form>
          <div className="text-center mt-4">
            {mode === "login" ? (
              <p className="text-xs text-muted-foreground">
                Don't have an account? Contact Cabinet Dealz to get your vendor invite link.
              </p>
            ) : (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setMode("login")}
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Vendor Portal Component ─────────────────────────────────────────────
export default function VendorPortal() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<VendorPage>("overview");

  // Admin bypass: detect ?as=<distributorId> in URL
  const params = new URLSearchParams(window.location.search);
  const asParam = params.get("as");
  const [adminDistributorId, setAdminDistributorId] = useState<number | null>(
    asParam ? Number(asParam) : null
  );

  // Fetch distributors list for admin selector
  const isAdmin = user?.role === "admin";
  const distList = trpc.distributors.list.useQuery(undefined, { enabled: isAdmin === true });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <VendorLoginForm />;
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

  // Admin must select a vendor to view as
  if (isAdmin && !adminDistributorId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold">Vendor Portal — Admin View</h1>
          <p className="text-muted-foreground">
            Select a vendor to view their portal as:
          </p>
          <div className="flex flex-col gap-2">
            {distList.isLoading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}
            {(distList.data ?? []).map((d: any) => (
              <Button
                key={d.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setAdminDistributorId(d.id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("as", String(d.id));
                  window.history.replaceState({}, "", url.toString());
                }}
              >
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{d.code}</span>
                {d.name}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="mt-4" onClick={() => { window.location.href = "/"; }}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <VendorPortalDashboard
      user={user}
      page={page}
      setPage={setPage}
      isAdmin={isAdmin}
      adminDistributorId={adminDistributorId}
      setAdminDistributorId={setAdminDistributorId}
      distList={distList.data ?? []}
    />
  );
}

function VendorPortalDashboard({
  user,
  page,
  setPage,
  isAdmin,
  adminDistributorId,
  setAdminDistributorId,
  distList,
}: {
  user: any;
  page: VendorPage;
  setPage: (p: VendorPage) => void;
  isAdmin: boolean;
  adminDistributorId: number | null;
  setAdminDistributorId: (id: number | null) => void;
  distList: any[];
}) {
  const activeDistCode = isAdmin && adminDistributorId
    ? (distList.find((d: any) => d.id === adminDistributorId)?.code ?? undefined)
    : undefined;
  const isPelican = activeDistCode === PEL_DIST_CODE;
  const [pelicanCategoryFilter, setPelicanCategoryFilter] = useState<string | undefined>(undefined);

  const handleNavigateToCatalog = useCallback((category?: string) => {
    setPelicanCategoryFilter(category);
    setPage("catalog");
  }, [setPage]);

  return (
    <AdminDistributorContext.Provider value={isAdmin && adminDistributorId ? adminDistributorId : undefined}>
    <AdminDistributorCodeContext.Provider value={activeDistCode}>
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:block">
        <div className="p-4 border-b">
          <h1 className="font-bold text-lg">Vendor Portal</h1>
          <p className="text-xs text-muted-foreground mt-1">{user.name}</p>
          {isAdmin && adminDistributorId && (
            <div className="mt-2">
              <Select
                value={String(adminDistributorId)}
                onValueChange={(v) => {
                  const id = Number(v);
                  setAdminDistributorId(id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("as", String(id));
                  window.history.replaceState({}, "", url.toString());
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {distList.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.code} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="mt-1 text-[10px]">Admin preview</Badge>
            </div>
          )}
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
	        {page === "overview" && (isPelican ? <PelicanVendorOverviewPage onNavigateToCatalog={handleNavigateToCatalog} /> : <OverviewPage />)}
	        {page === "catalog" && (isPelican ? <PelicanVendorCatalogPage initialCategory={pelicanCategoryFilter} /> : <CatalogPage />)}
	        {page === "styles" && <DoorStylesPage />}
	        {page === "featured-styles" && <VendorFeaturedStylesPage />}
	        {page === "shipping" && <VendorShippingPage />}
	        {page === "picks" && <DesignToolPicksPage />}
        {page === "promotions" && <PromotionsPage />}
        {page === "gallery" && <GalleryPage />}
        {page === "analytics" && <VendorAnalyticsPage />}
        {page === "orders" && <OrdersPage />}
        {page === "ai-services" && <AICatalogServicesPage />}
        {page === "integrations" && <IntegrationsPage />}
        {page === "payments" && <PaymentsPage />}
      </main>
    </div>
    </AdminDistributorCodeContext.Provider>
    </AdminDistributorContext.Provider>
  );
}
