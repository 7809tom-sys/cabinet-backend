import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PafProduct {
  code: string;
  description: string;
  category?: string;
  width?: number;
  height?: number;
  depth?: number;
  numberOfDoors?: number;
  numberOfDrawers?: number;
  listPrice?: number;
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// NAC DataPack format detection and parsing
// ---------------------------------------------------------------------------

function isDataPackFormat(zipContent: InstanceType<typeof import("jszip")>): boolean {
  const fileNames = Object.keys(zipContent.files);
  const hasCatInfo = fileNames.some(
    (n) => n === "CatInfo.Xml" || n.toLowerCase() === "catinfo.xml"
  );
  const hasProductsCsv = fileNames.some((n) =>
    n.toLowerCase().includes("conversiondata/pricing/10_products.csv")
  );
  return hasCatInfo && hasProductsCsv;
}

async function parseDataPackZip(zipContent: InstanceType<typeof import("jszip")>): Promise<PafProduct[]> {
  const fileNames = Object.keys(zipContent.files);
  const productsCsvPath = fileNames.find((n) =>
    n.toLowerCase().includes("conversiondata/pricing/10_products.csv")
  );
  if (!productsCsvPath) return [];
  const catalogPrefix = productsCsvPath.substring(
    0,
    productsCsvPath.toLowerCase().indexOf("conversiondata/")
  );
  const productsCsvText = await zipContent.files[productsCsvPath].async("text");
  const productRows = parseSimpleCsv(productsCsvText);
  const priceCsvPath = fileNames.find(
    (n) =>
      n.startsWith(catalogPrefix) &&
      n.toLowerCase().includes("conversiondata/pricing/72_pricetags_default.csv")
  );
  const priceMap: Record<string, number> = {};
  if (priceCsvPath) {
    const priceCsvText = await zipContent.files[priceCsvPath].async("text");
    const priceRows = parseSimpleCsv(priceCsvText);
    for (const row of priceRows) {
      if (row[1] === "PR00011" && row[5] === "O.PG02") {
        const sku = row[4];
        const price = parseFloat(row[7]);
        if (sku && !isNaN(price)) priceMap[sku] = price;
      }
    }
  }
  const products: PafProduct[] = [];
  for (const row of productRows) {
    if (row[0] !== "Product") continue;
    const sku = row[2];
    const description = row[3] || sku;
    if (!sku) continue;
    const product: PafProduct = {
      code: sku.toUpperCase(),
      description,
      category: inferCategoryFromNacSku(sku),
    };
    if (priceMap[sku] !== undefined) product.listPrice = priceMap[sku];
    products.push(product);
  }
  return products;
}

function parseSimpleCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let isFirst = true;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isFirst) { isFirst = false; continue; }
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function inferCategoryFromNacSku(sku: string): string {
  const s = sku.toUpperCase();
  if (/^W\d/.test(s) || s.startsWith("WDC") || s.startsWith("WBC") || s.startsWith("WEC") || s.startsWith("WB")) return "Wall Cabinet";
  if (/^T\d/.test(s) || s.startsWith("OT") || s.startsWith("UT") || s.startsWith("PT")) return "Tall Cabinet";
  if (/^V\d/.test(s) || s.startsWith("VDB") || s.startsWith("VB")) return "Vanity";
  return "Base Cabinet";
}

function parseSimplePafXml(xmlContent: string): PafProduct[] {
  const products: PafProduct[] = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("Invalid XML format");
    const productElements = xmlDoc.getElementsByTagName("Product");
    for (let i = 0; i < productElements.length; i++) {
      const elem = productElements[i];
      const product: PafProduct = {
        code: elem.getAttribute("Code") || `PROD_${i}`,
        description: elem.getAttribute("Description") || "",
      };
      const categoryElem = elem.getElementsByTagName("Category")[0];
      if (categoryElem) product.category = categoryElem.textContent || undefined;
      const widthElem = elem.getElementsByTagName("Width")[0];
      if (widthElem?.textContent) product.width = parseFloat(widthElem.textContent);
      const heightElem = elem.getElementsByTagName("Height")[0];
      if (heightElem?.textContent) product.height = parseFloat(heightElem.textContent);
      const depthElem = elem.getElementsByTagName("Depth")[0];
      if (depthElem?.textContent) product.depth = parseFloat(depthElem.textContent);
      const priceElem = elem.getElementsByTagName("ListPrice")[0];
      if (priceElem?.textContent) product.listPrice = parseFloat(priceElem.textContent);
      const imageElem = elem.getElementsByTagName("ImageUrl")[0];
      if (imageElem?.textContent) product.imageUrl = imageElem.textContent;
      if (product.code && product.description) products.push(product);
    }
  } catch (err) {
    console.error("Error parsing PAF XML:", err);
  }
  return products;
}

export default function AdminCatalogImport() {
  const auth = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [distributorId, setDistributorId] = useState<number | "">("");
  const [preservePricing, setPreservePricing] = useState(true);
  const [importProgress, setImportProgress] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    fileName: string;
  } | null>(null);

  // New vendor creation state
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorBrand, setNewVendorBrand] = useState("");

  const utils = trpc.useUtils();
  const { data: distList, isLoading: distsLoading } = trpc.distributorAdmin.adminList.useQuery();

  const addDistributor = trpc.distributorAdmin.addDistributor.useMutation({
    onSuccess: (d) => {
      toast.success(`Vendor "${d.name}" created (ID: ${d.id})`);
      utils.distributorAdmin.adminList.invalidate();
      setDistributorId(d.id);
      setShowNewVendor(false);
      setNewVendorName("");
      setNewVendorBrand("");
    },
    onError: (e) => toast.error(e.message),
  });

  const initializeImport = trpc.catalogImport.initializeImport.useMutation();
  const executeImport = trpc.catalogImport.executeImport.useMutation();
  const listImports = trpc.catalogImport.listImports.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: distributorId !== "" }
  );

  // Check if user is admin
  if (!auth.user || auth.user.role !== "admin") {
    return (
      <div className="container py-12">
        <Card className="p-6">
          <p className="text-red-600">Access denied. Admin privileges required.</p>
        </Card>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".zip")) {
        toast.error("Please select a .zip file");
        return;
      }
      setSelectedFile(file);
      toast.success(`Selected: ${file.name}`);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !distributorId) {
      toast.error("Please select a file and distributor");
      return;
    }

    setIsProcessing(true);
    setImportProgress({ status: "extracting", message: "Extracting zip file..." });

    try {
      // Extract zip file
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(selectedFile);

      setImportProgress({ status: "parsing", message: "Detecting catalog format..." });

      // Detect format: NAC DataPack (CatInfo.Xml + ConversionData CSVs) vs classic PAF XML
      let parsedProducts: PafProduct[];
      if (isDataPackFormat(zipContent)) {
        setImportProgress({ status: "parsing", message: "Parsing NAC DataPack catalog (CSV format)..." });
        parsedProducts = await parseDataPackZip(zipContent);
      } else {
        const pafFile = Object.keys(zipContent.files).find((name) =>
          name.toLowerCase().endsWith("paf.xml")
        );
        if (!pafFile) {
          toast.error("No recognized catalog format found (expected paf.xml or NAC DataPack CSVs)");
          setIsProcessing(false);
          return;
        }
        setImportProgress({ status: "parsing", message: "Parsing PAF XML..." });
        const xmlContent = await zipContent.files[pafFile].async("text");
        parsedProducts = parseSimplePafXml(xmlContent);
      }

      // Initialize import record
      setImportProgress({ status: "initializing", message: "Initializing import..." });
      const initResult = await initializeImport.mutateAsync({
        distributorId: Number(distributorId),
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        preservePricing,
      });

      if (parsedProducts.length === 0) {
        throw new Error("No products found in catalog file");
      }

      setImportProgress({
        status: "importing",
        message: `Found ${parsedProducts.length} products. Importing to database...`,
      });

      // Execute import
      const importResult = await executeImport.mutateAsync({
        importId: initResult.importId,
        distributorId: Number(distributorId),
        products: parsedProducts,
        preservePricing,
      });

      setImportProgress({
        status: "completed",
        message: `Import complete! Created: ${importResult.stats.created}, Updated: ${importResult.stats.updated}, Skipped: ${importResult.stats.skipped}`,
      });

      toast.success("Import completed successfully");
      setSelectedFile(null);

      // Refresh import list
      listImports.refetch();

      // Save result for persistent display and reset progress
      setImportResult({
        created: importResult.stats.created,
        updated: importResult.stats.updated,
        skipped: importResult.stats.skipped,
        errors: importResult.stats.errors?.length ?? 0,
        fileName: selectedFile.name,
      });
      setImportProgress(null);
      setIsProcessing(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Import failed: ${errorMsg}`);
      setImportProgress({
        status: "failed",
        message: errorMsg,
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="container py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">20/20 Catalog Importer</h1>
          <p className="text-gray-500 mt-2">
            Upload distributor catalogs to automatically sync products and pricing
          </p>
        </div>

        {/* Upload Form */}
        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="distributor">Distributor</Label>
            {distsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Spinner className="h-4 w-4" /> Loading vendors…
              </div>
            ) : (
              <Select
                value={distributorId !== "" ? String(distributorId) : ""}
                onValueChange={(v) => setDistributorId(Number(v))}
                disabled={isProcessing}
              >
                <SelectTrigger id="distributor" className="w-full">
                  <SelectValue placeholder="Choose a vendor…" />
                </SelectTrigger>
                <SelectContent>
                  {(distList ?? []).map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {`${d.brandName || d.name}  (ID: ${d.id})`}
                </SelectItem>
              ))}
                </SelectContent>
              </Select>
            )}

            {/* Add New Vendor */}
            {!showNewVendor ? (
              <button
                type="button"
                onClick={() => setShowNewVendor(true)}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                disabled={isProcessing}
              >
                <Plus className="h-3.5 w-3.5" /> Add new vendor
              </button>
            ) : (
              <div className="border border-border rounded-lg p-4 space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">New Vendor</h3>
                  <button type="button" onClick={() => setShowNewVendor(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Company Name *</Label>
                  <Input
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="e.g. Acme Cabinets"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Brand Name (optional)</Label>
                  <Input
                    value={newVendorBrand}
                    onChange={(e) => setNewVendorBrand(e.target.value)}
                    placeholder="e.g. Acme"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!newVendorName.trim() || addDistributor.isPending}
                    onClick={() => addDistributor.mutate({ name: newVendorName.trim(), brandName: newVendorBrand.trim() || undefined })}
                  >
                    {addDistributor.isPending ? <Spinner className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Create Vendor
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewVendor(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Catalog Zip File</Label>
            <Input
              id="file"
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              disabled={isProcessing}
            />
            {selectedFile && (
              <p className="text-sm text-gray-600">Selected: {selectedFile.name}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="preserve"
              checked={preservePricing}
              onChange={(e) => setPreservePricing(e.target.checked)}
              disabled={isProcessing}
            />
            <Label htmlFor="preserve" className="cursor-pointer">
              Preserve existing pricing (don't overwrite)
            </Label>
          </div>

         {importProgress && (
           <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
             <div className="flex items-center space-x-2">
               {importProgress.status === "completed" ? (
                 <div className="text-green-600">✓</div>
               ) : importProgress.status === "failed" ? (
                 <div className="text-red-600">✗</div>
               ) : (
                 <Spinner className="h-4 w-4" />
               )}
               <div>
                 <p className="font-semibold capitalize">{importProgress.status}</p>
                 <p className="text-sm text-gray-600">{importProgress.message}</p>
               </div>
             </div>
           </div>
         )}

          {/* Persistent result card — stays until dismissed */}
          {importResult && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-300">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <p className="font-semibold text-green-800">✓ Import Complete — {importResult.fileName}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-white rounded p-2 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-700">{importResult.created}</p>
                      <p className="text-xs text-muted-foreground">Created</p>
                    </div>
                    <div className="bg-white rounded p-2 text-center border border-green-200">
                      <p className="text-2xl font-bold text-blue-700">{importResult.updated}</p>
                      <p className="text-xs text-muted-foreground">Updated</p>
                    </div>
                    <div className="bg-white rounded p-2 text-center border border-green-200">
                      <p className="text-2xl font-bold text-gray-600">{importResult.skipped}</p>
                      <p className="text-xs text-muted-foreground">Skipped</p>
                    </div>
                  </div>
                  {importResult.errors > 0 && (
                    <p className="text-sm text-red-600">{importResult.errors} error(s) — check Import History below for details</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setImportResult(null)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!selectedFile || !distributorId || isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Processing...
              </>
            ) : (
              "Start Import"
            )}
          </Button>
        </Card>

        {/* Import History */}
        {distributorId && listImports.data && (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Import History</h2>
            {listImports.data.length === 0 ? (
              <p className="text-gray-500">No imports yet for this distributor</p>
            ) : (
              <div className="space-y-3">
                {listImports.data.map((imp) => (
                  <div
                    key={imp.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{imp.fileName}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(imp.uploadedAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          imp.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : imp.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : imp.status === "processing"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {imp.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Cabinets: {imp.cabinetCount} | SKUs: {imp.skuCount} | Images: {imp.imageCount}</p>
                      {imp.errorLog && imp.errorLog.length > 0 && (
                        <p className="text-red-600">
                          Errors: {imp.errorLog.length}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
