/**
 * MissingImagesAdmin — shows every active cabinet that has no catalogImageUrl.
 *
 * Each row has a "Fix Image" button that opens a MediaPicker dialog. Once an
 * image is selected the cabinet is updated via adminFixCabinetImage and the
 * row disappears from the list. If the cabinet had conflictStatus='image_missing'
 * the server automatically clears that flag.
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImageOff, Search, ChevronLeft, ChevronRight, ImagePlus, CheckCircle2 } from "lucide-react";
import { MediaPicker } from "@/components/admin/MediaPicker";

const PAGE_SIZE = 50;

type MissingItem = {
  id: number;
  masterCode: string;
  description: string;
  category: string;
  subCategory: string | null;
  conflictStatus: string;
  catalogImageUrl: string | null;
};

function FixImageDialog({
  item,
  open,
  onOpenChange,
  onFixed,
}: {
  item: MissingItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFixed: () => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const utils = trpc.useUtils();

  const fixMut = trpc.cabinets.adminFixCabinetImage.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.conflictCleared
          ? `Image assigned and Image Missing flag cleared for ${item.masterCode}`
          : `Image assigned to ${item.masterCode}`
      );
      utils.cabinets.adminListMissingImages.invalidate();
      onFixed();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to assign image: ${err.message}`);
    },
  });

  const handleSave = useCallback(() => {
    if (!imageUrl.trim()) {
      toast.error("Please select or upload an image first.");
      return;
    }
    fixMut.mutate({ id: item.id, imageUrl: imageUrl.trim() });
  }, [imageUrl, item.id, fixMut]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5 text-amber-500" />
            Fix Image — {item.masterCode}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">{item.description}</p>
            <p className="text-muted-foreground mt-0.5">
              {item.category}
              {item.subCategory ? ` / ${item.subCategory}` : ""}
            </p>
            {item.conflictStatus === "image_missing" && (
              <Badge variant="destructive" className="mt-2 text-xs">
                Image Missing — conflict flag active
              </Badge>
            )}
          </div>

          <MediaPicker
            value={imageUrl}
            onChange={setImageUrl}
            label="Catalog Image"
            placeholder="Select from library or upload a new image"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={fixMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!imageUrl.trim() || fixMut.isPending}
            className="gap-1.5"
          >
            {fixMut.isPending ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Assign Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MissingImagesAdmin() {
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fixing, setFixing] = useState<MissingItem | null>(null);

  const { data, isLoading, refetch } = trpc.cabinets.adminListMissingImages.useQuery(
    { page, pageSize: PAGE_SIZE, search: search || undefined },
    {}
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(0);
  }, [searchInput]);

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <ImageOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Cabinets Missing Catalog Images</p>
          <p className="text-amber-800">
            These active cabinets have no catalog image. The system never guesses — click{" "}
            <strong>Fix Image</strong> to assign one from the media library or upload a new file.
            Once assigned, the cabinet's Image Missing flag (if any) is automatically cleared.
          </p>
        </div>
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by code or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch}>
          Search
        </Button>
        {!isLoading && (
          <span className="text-sm text-muted-foreground ml-auto">
            {total} cabinet{total !== 1 ? "s" : ""} missing an image
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="font-medium text-foreground">All cabinets have catalog images!</p>
          <p className="text-sm">No missing images found{search ? " for this search" : ""}.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Code</th>
                <th className="text-left px-4 py-2.5 font-medium">Description</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium">{item.masterCode}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {item.category}
                    {item.subCategory ? (
                      <span className="text-xs ml-1 text-muted-foreground/70">
                        / {item.subCategory}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {item.conflictStatus === "image_missing" ? (
                      <Badge variant="destructive" className="text-xs">
                        Image Missing
                      </Badge>
                    ) : item.conflictStatus === "conflict" ? (
                      <Badge variant="destructive" className="text-xs">
                        Conflict
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                        No Image
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
                      onClick={() => setFixing(item as MissingItem)}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Fix Image
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Fix Image dialog */}
      {fixing && (
        <FixImageDialog
          item={fixing}
          open={!!fixing}
          onOpenChange={(v) => !v && setFixing(null)}
          onFixed={() => {
            setFixing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
