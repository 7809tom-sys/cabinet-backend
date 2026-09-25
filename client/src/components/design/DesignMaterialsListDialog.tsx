import { Download, FileSpreadsheet, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { materialsListCsv, materialsListPricedTotal, materialsListPrintHtml, type MaterialsListRow } from "@/lib/designMaterialsList";

function money(row: MaterialsListRow, value: number | null): string {
  if (value != null) return `$${value.toFixed(2)}`;
  return row.priceStatus === "unavailable" ? "Unavailable" : "Quote required";
}

function fileSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "design";
}

export function DesignMaterialsListDialog({
  open,
  onOpenChange,
  rows,
  roomLabel,
  styleName,
  brandName,
  onRemovePlacedItems,
  onAddPricedItemsToCart,
  pricedCartItemCount = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: readonly MaterialsListRow[];
  roomLabel: string;
  styleName: string | null;
  brandName?: string | null;
  /** Removes the exact placed cabinet/filler entries represented by a row. */
  onRemovePlacedItems?: (uids: string[]) => void;
  /** Adds only current, catalog-priced design lines through the authoritative cart workflow. */
  onAddPricedItemsToCart?: () => void;
  /** Purchase-unit count after quote-only and unavailable lines have been excluded. */
  pricedCartItemCount?: number;
}) {
  const title = `${brandName?.trim() || "Cabinet Dealz"} Materials & Parts List`;
  const cabinetRows = rows.filter((row) => row.section === "cabinet");
  const otherRows = rows.filter((row) => row.section === "other");
  const unavailableCabinetCount = rows.filter((row) => row.priceStatus === "unavailable").length;
  const quoteRequiredCount = rows.filter((row) => row.priceStatus === "quote_required").length;

  const downloadCsv = () => {
    const csv = materialsListCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileSlug(brandName?.trim() || "cabinet-dealz")}-materials-parts-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Materials list exported", { description: `${rows.length} rows` });
  };

  const printList = () => {
    const preview = window.open("", "_blank", "noopener,noreferrer");
    if (!preview) {
      toast.error("The print window was blocked. Allow popups and try again.");
      return;
    }
    preview.document.open();
    preview.document.write(materialsListPrintHtml({
      rows,
      title,
      roomLabel,
      styleName,
      generatedAt: new Date().toLocaleString(),
    }));
    preview.document.close();
    preview.focus();
    preview.setTimeout(() => preview.print(), 150);
  };

  const renderRows = (sectionRows: readonly MaterialsListRow[], heading: string) => (
    <>
      <tr className="bg-[#f7f0e3] text-[#6c4f1c]">
        <th colSpan={12} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">{heading}</th>
      </tr>
      {sectionRows.map((row) => (
        <tr key={`${row.section}:${row.label}:${row.code}:${row.styleColor}`} className="border-b border-slate-200 align-top odd:bg-white even:bg-slate-50/60">
          <td className="sticky left-0 z-[1] bg-white px-1.5 py-1.5 text-center even:bg-slate-50/60">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-700 hover:bg-red-50 hover:text-red-800 disabled:text-slate-300"
              disabled={!row.sourceUids?.length}
              aria-label={row.sourceUids?.length ? `Remove ${row.description}` : `${row.description} is not a placed design item`}
              title={row.sourceUids?.length ? `Remove ${row.description} from this design` : "This quoted material is not a placed design item"}
              onClick={() => onRemovePlacedItems?.(row.sourceUids ?? [])}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </td>
          <td className="px-2 py-2 text-center font-bold text-[#1a2744]">{row.label}</td>
          <td className="px-2 py-2 font-mono font-semibold">{row.code}</td>
          <td className="px-2 py-2 min-w-[190px]">{row.description}</td>
          <td className="px-2 py-2">{row.category}</td>
          <td className="px-2 py-2">{row.supplier}</td>
          <td className="px-2 py-2 min-w-[130px]">{row.styleColor}</td>
          <td className="px-2 py-2 whitespace-nowrap">{row.dimensions}</td>
          <td className="px-2 py-2 text-right tabular-nums">{row.qty}</td>
          <td className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${row.priceStatus === "unavailable" ? "text-rose-700" : row.unitPrice == null ? "text-amber-700" : ""}`}>{money(row, row.unitPrice)}</td>
          <td className={`px-2 py-2 text-right whitespace-nowrap font-semibold tabular-nums ${row.priceStatus === "unavailable" ? "text-rose-700" : row.lineTotal == null ? "text-amber-700" : ""}`}>{money(row, row.lineTotal)}</td>
          <td className="px-2 py-2 min-w-[180px] text-slate-600">{row.notes || "—"}</td>
        </tr>
      ))}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base text-[#1a2744] sm:text-lg">
                <FileSpreadsheet className="h-5 w-5 text-[#a87f33]" /> Complete Materials & Parts List
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Numbered cabinets, panels, fillers, and cabinet trim first; all non-cabinet materials are alphabetized below. Use the red trash button at the left of each placed item to remove it from this design.
              </DialogDescription>
              <p className="mt-1 text-[11px] font-medium text-slate-600">{roomLabel} · {styleName?.trim() || "Cabinet style not selected"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 pr-7 sm:pr-8">
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-[#a87f33] text-white hover:bg-[#8e6929]"
                onClick={onAddPricedItemsToCart}
                disabled={!onAddPricedItemsToCart || pricedCartItemCount <= 0}
                title="Add only catalog-priced materials and parts to the cart"
              >
                <ShoppingCart className="h-4 w-4" /> Add priced items to cart{pricedCartItemCount > 0 ? ` (${pricedCartItemCount})` : ""}
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={printList} disabled={rows.length === 0}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button type="button" size="sm" className="gap-1.5 bg-[#1a2744] text-white hover:bg-[#27395f]" onClick={downloadCsv} disabled={rows.length === 0}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center px-6 text-center text-sm text-muted-foreground">Add layout items before opening the materials list.</div>
          ) : (
            <table className="min-w-[1270px] w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#1a2744] text-white shadow-sm">
                <tr>
                  {['Remove', 'No.', 'Item code', 'Description', 'Category', 'Distributor', 'Color / style', 'Dimensions', 'Qty', 'Unit price', 'Line total', 'Notes'].map((heading, index) => (
                    <th key={heading} className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide ${index === 0 ? "sticky left-0 z-[1] bg-[#1a2744] text-center" : ""}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
	                {renderRows(cabinetRows, "Numbered cabinets & cabinet parts")}
                {renderRows(otherRows, "Other materials & parts — alphabetical")}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">
              {cabinetRows.length} cabinet & part rows · {otherRows.length} other rows
              {unavailableCabinetCount > 0 && <span className="font-semibold text-rose-700"> · {unavailableCabinetCount} unavailable cabinet line{unavailableCabinetCount === 1 ? "" : "s"}</span>}
              {quoteRequiredCount > 0 && <span className="font-semibold text-amber-700"> · {quoteRequiredCount} quote-required line{quoteRequiredCount === 1 ? "" : "s"}</span>}
            </span>
            <span className="text-sm font-bold text-[#1a2744]">Priced total: ${materialsListPricedTotal(rows).toFixed(2)}</span>
          </div>
          {(unavailableCabinetCount > 0 || quoteRequiredCount > 0) && (
            <p className="mt-1 text-[11px] text-slate-600">Quote-required and unavailable lines remain on this materials list and are not added to the cart.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
