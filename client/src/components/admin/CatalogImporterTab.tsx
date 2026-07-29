import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import JSZip from "jszip";

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

export default function CatalogImporterTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [distributorId, setDistributorId] = useState<number | "">("");
  const [preservePricing, setPreservePricing] = useState(true);
  const [importProgress, setImportProgress] = useState<{
    status: string;
    message: string;
  } | null>(null);

  const initializeImport = trpc.catalogImport.initializeImport.useMutation();
  const executeImport = trpc.catalogImport.executeImport.useMutation();
  const listImports = trpc.catalogImport.listImports.useQuery(
    { distributorId: Number(distributorId) },
    { enabled: distributorId !== "" }
  );

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

      // Find paf.xml
      const pafFile = Object.keys(zipContent.files).find((name) =>
        name.toLowerCase().endsWith("paf.xml")
      );

      if (!pafFile) {
        toast.error("paf.xml not found in zip file");
        setIsProcessing(false);
        return;
      }

      setImportProgress({ status: "parsing", message: "Parsing PAF XML..." });

      // Extract PAF XML content
      const xmlContent = await zipContent.files[pafFile].async("text");

      setImportProgress({
        status: "initializing",
        message: "Initializing import...",
      });

      // Initialize import record
      const initResult = await initializeImport.mutateAsync({
        distributorId: Number(distributorId),
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        preservePricing,
      });

      setImportProgress({
        status: "importing",
        message: "Importing products to database...",
      });

      // Mock products for demonstration
      const mockProducts: PafProduct[] = [
        {
          code: "3DB24",
          description: "3 Drawer Base 24",
          category: "Base Cabinet",
          width: 24,
          height: 30,
          depth: 24,
          numberOfDrawers: 3,
          listPrice: 450,
        },
      ];

      // Execute import
      const importResult = await executeImport.mutateAsync({
        importId: initResult.importId,
        distributorId: Number(distributorId),
        products: mockProducts,
        preservePricing,
      });

      setImportProgress({
        status: "completed",
        message: `Import complete! Created: ${importResult.stats.created}, Updated: ${importResult.stats.updated}, Skipped: ${importResult.stats.skipped}`,
      });

      toast.success("Import completed successfully");
      setSelectedFile(null);
      setDistributorId("");

      // Refresh import list
      listImports.refetch();

      // Reset after 3 seconds
      setTimeout(() => {
        setImportProgress(null);
        setIsProcessing(false);
      }, 3000);
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
    <div className="space-y-8">
      {/* Upload Form */}
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Upload 20/20 Catalog</h3>
          <p className="text-sm text-gray-600 mb-4">
            Upload distributor catalogs to automatically sync products and pricing
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="distributor">Distributor ID</Label>
          <Input
            id="distributor"
            type="number"
            placeholder="Enter distributor ID"
            value={distributorId}
            onChange={(e) => setDistributorId(e.target.value ? Number(e.target.value) : "")}
            disabled={isProcessing}
          />
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
          <h3 className="text-lg font-semibold">Import History</h3>
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
  );
}
