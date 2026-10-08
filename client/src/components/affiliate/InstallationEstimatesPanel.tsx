import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, ReceiptText, Send, Trash2, Wrench, Percent } from "lucide-react";
import { toast } from "sonner";
import { installationEstimateDocumentPath } from "@shared/installationEstimateLink";
import { installationEstimateStatusAction, isCustomerVisibleInstallationEstimate } from "@shared/installationEstimateStatus";
import { INSTALLATION_ROOM_TYPES, type InstallationCostType, type InstallationRoomType } from "@shared/installationEstimate";
import { KITCHEN_COST_SHEET_DESCRIPTIONS, type KitchenCostSheetDescription } from "@shared/kitchenCostSheet";
import { downloadInstallationEstimateCsv, downloadInstallationEstimatePdf } from "@/lib/installationEstimateExport";

type DraftLine = { description: string; quantity: number; unitCost: number; costType: InstallationCostType };
type SavedLine = DraftLine & { lineTotal: number };
type KitchenCostRow = { description: KitchenCostSheetDescription; materialQuantity: number; materialUnitCost: number; laborQuantity: number; laborUnitCost: number };

const money = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

// Exact descriptions transcribed from KitchenCostSheet.pdf. The PDF is a blank
// form, so this list intentionally contains no invented quantities or prices.
const createKitchenRows = (): KitchenCostRow[] => KITCHEN_COST_SHEET_DESCRIPTIONS.map((description) => ({
  description,
  materialQuantity: 0,
  materialUnitCost: 0,
  laborQuantity: 0,
  laborUnitCost: 0,
}));

const emptyLine = (): DraftLine => ({ description: "", quantity: 1, unitCost: 0, costType: "labor" });

export function InstallationEstimatesPanel({ affiliateId }: { affiliateId: number }) {
  const utils = trpc.useUtils();
  const estimates = trpc.installationEstimates.list.useQuery({ affiliateId });
  const kitchenDefaults = trpc.installationEstimates.kitchenCostDefaults.useQuery({ affiliateId });
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderRequestId, setOrderRequestId] = useState("");
  const [notes, setNotes] = useState("");
  const [roomType, setRoomType] = useState<InstallationRoomType>("Kitchen");
  const [markupOpen, setMarkupOpen] = useState(false);
  const [markupPercent, setMarkupPercent] = useState(0);
  const [kitchenRows, setKitchenRows] = useState<KitchenCostRow[]>(createKitchenRows);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  useEffect(() => {
    const defaults = kitchenDefaults.data?.defaults;
    if (!defaults) return;
    const byDescription = new Map(defaults.map((row) => [row.description, row]));
    setKitchenRows((current) => current.map((row) => ({
      ...row,
      materialUnitCost: byDescription.get(row.description)?.materialUnitCost ?? row.materialUnitCost,
      laborUnitCost: byDescription.get(row.description)?.laborUnitCost ?? row.laborUnitCost,
    })));
  }, [kitchenDefaults.data]);

  const kitchenTotals = useMemo(() => kitchenRows.reduce((totals, row) => ({
    material: totals.material + Math.max(0, row.materialQuantity) * Math.max(0, row.materialUnitCost),
    labor: totals.labor + Math.max(0, row.laborQuantity) * Math.max(0, row.laborUnitCost),
  }), { material: 0, labor: 0 }), [kitchenRows]);
  const genericSubtotal = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost), 0), [lines]);
  const subtotal = roomType === "Kitchen" ? kitchenTotals.material + kitchenTotals.labor : genericSubtotal;
  const markupAmount = subtotal * Math.max(0, markupPercent) / 100;
  const total = subtotal + markupAmount;

  const updateKitchenRow = (index: number, patch: Partial<KitchenCostRow>) => {
    setKitchenRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };
  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line));
  };

  const create = trpc.installationEstimates.create.useMutation({
    onSuccess: () => {
      toast.success("Installation estimate saved separately from the material order.");
      setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setOrderRequestId(""); setNotes("");
      setRoomType("Kitchen"); setMarkupPercent(0); setMarkupOpen(false); setKitchenRows(createKitchenRows); setLines([emptyLine()]);
      utils.installationEstimates.list.invalidate({ affiliateId });
    },
    onError: (error) => toast.error("Could not save installation estimate", { description: error.message }),
  });
  const updateStatus = trpc.installationEstimates.updateStatus.useMutation({
    onSuccess: () => utils.installationEstimates.list.invalidate({ affiliateId }),
    onError: (error) => toast.error(error.message),
  });
  const saveDefaults = trpc.installationEstimates.saveKitchenCostDefaults.useMutation({
    onSuccess: () => {
      toast.success("Kitchen material and labor defaults saved for this affiliate.");
      kitchenDefaults.refetch();
    },
    onError: (error) => toast.error("Could not save Kitchen defaults", { description: error.message }),
  });

  function saveKitchenDefaults() {
    saveDefaults.mutate({
      affiliateId,
      defaults: kitchenRows.map((row) => ({ description: row.description, materialUnitCost: row.materialUnitCost, laborUnitCost: row.laborUnitCost })),
    });
  }

  function saveEstimate() {
    const lineItems = roomType === "Kitchen"
      ? kitchenRows.flatMap((row) => [
        row.materialQuantity > 0 ? { description: row.description, quantity: row.materialQuantity, unitCost: row.materialUnitCost, costType: "material" as const } : null,
        row.laborQuantity > 0 ? { description: row.description, quantity: row.laborQuantity, unitCost: row.laborUnitCost, costType: "labor" as const } : null,
      ]).filter((line): line is NonNullable<typeof line> => line !== null)
      : lines.filter((line) => line.description.trim() && line.quantity > 0).map((line) => ({ ...line, description: line.description.trim() }));
    if (!lineItems.length) {
      toast.error(`Enter at least one ${roomType.toLowerCase()} material or labor row.`);
      return;
    }
    create.mutate({
      affiliateId, roomType, markupPercent, orderRequestId: Number(orderRequestId) || null,
      customerName: customerName.trim() || null, customerEmail: customerEmail.trim() || null, customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null, lineItems,
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div><div><h2 className="text-xl font-bold">Installation estimate</h2><p className="text-sm text-muted-foreground">Create the affiliate’s installation document. Cabinet Dealz material totals stay separate.</p></div></div>
          <div className="w-full space-y-1.5 sm:w-56"><Label htmlFor="installation-room-type">Room type</Label><select id="installation-room-type" value={roomType} onChange={(event) => setRoomType(event.target.value as InstallationRoomType)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{INSTALLATION_ROOM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm"><p className="font-semibold">{roomType} installation items</p><p className="mt-1 text-muted-foreground">{roomType === "Kitchen" ? "Use the exact Kitchen Cost Sheet Cabinets rows below. Enter material and labor quantities and price per unit; each total is calculated automatically." : `Add ${roomType.toLowerCase()} installation lines with their cost type, quantity, and unit cost.`}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Customer name</Label><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></div><div className="space-y-1.5"><Label>Customer email</Label><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="customer@example.com" /></div><div className="space-y-1.5"><Label>Customer phone</Label><Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(555) 555-5555" /></div><div className="space-y-1.5"><Label>Cabinet Dealz material order # <span className="font-normal text-muted-foreground">(optional)</span></Label><Input inputMode="numeric" value={orderRequestId} onChange={(event) => setOrderRequestId(event.target.value.replace(/\D/g, ""))} placeholder="Material order request ID" /></div></div>

        {roomType === "Kitchen" ? (
          <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Kitchen Cost Sheet Cabinets</p><p className="text-xs text-muted-foreground">Source: KitchenCostSheet.pdf · set unit prices once, then reuse them on future estimates.</p></div><div className="flex items-center gap-2"><Badge variant="outline">{kitchenDefaults.data?.hasSavedDefaults ? "Saved defaults applied" : "No saved defaults"}</Badge><Button type="button" size="sm" variant="outline" onClick={saveKitchenDefaults} disabled={saveDefaults.isPending}>{saveDefaults.isPending ? "Saving…" : "Save prices as defaults"}</Button></div></div>
            <div className="overflow-x-auto rounded-md border border-border bg-background"><div className="min-w-[760px]"><div className="grid grid-cols-[minmax(190px,1fr)_72px_92px_92px_72px_92px_92px] gap-1 border-b bg-muted/50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Description</span><span className="col-span-3 text-center">Material</span><span className="col-span-3 text-center">Labor</span><span /><span /><span /><span /><span /><span /></div><div className="grid grid-cols-[minmax(190px,1fr)_72px_92px_92px_72px_92px_92px] gap-1 border-b bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground"><span /><span>Qty</span><span>Price / unit</span><span>Total</span><span>Qty</span><span>Price / unit</span><span>Total</span></div>{kitchenRows.map((row, index) => <div key={row.description} className="grid grid-cols-[minmax(190px,1fr)_72px_92px_92px_72px_92px_92px] items-center gap-1 border-b px-2 py-1.5 last:border-b-0"><span className="text-xs font-medium">{row.description}</span><Input type="number" min="0" step="0.01" value={row.materialQuantity} aria-label={`${row.description} material quantity`} onChange={(event) => updateKitchenRow(index, { materialQuantity: Number(event.target.value) || 0 })} className="h-8 px-2 text-xs" /><Input type="number" min="0" step="0.01" value={row.materialUnitCost} aria-label={`${row.description} material price per unit`} onChange={(event) => updateKitchenRow(index, { materialUnitCost: Number(event.target.value) || 0 })} className="h-8 px-2 text-xs" /><span className="text-right text-xs tabular-nums">{money(row.materialQuantity * row.materialUnitCost)}</span><Input type="number" min="0" step="0.01" value={row.laborQuantity} aria-label={`${row.description} labor quantity`} onChange={(event) => updateKitchenRow(index, { laborQuantity: Number(event.target.value) || 0 })} className="h-8 px-2 text-xs" /><Input type="number" min="0" step="0.01" value={row.laborUnitCost} aria-label={`${row.description} labor price per unit`} onChange={(event) => updateKitchenRow(index, { laborUnitCost: Number(event.target.value) || 0 })} className="h-8 px-2 text-xs" /><span className="text-right text-xs tabular-nums">{money(row.laborQuantity * row.laborUnitCost)}</span></div>)}</div></div>
            <div className="grid gap-1 text-sm sm:grid-cols-3"><div className="flex justify-between rounded bg-background px-3 py-2"><span>Material total</span><span className="font-semibold tabular-nums">{money(kitchenTotals.material)}</span></div><div className="flex justify-between rounded bg-background px-3 py-2"><span>Labor total</span><span className="font-semibold tabular-nums">{money(kitchenTotals.labor)}</span></div><div className="flex justify-between rounded bg-background px-3 py-2 font-bold"><span>Kitchen subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div></div>
          </div>
        ) : (
          <div className="space-y-2"><Label>Installation items</Label><div className="hidden grid-cols-[minmax(0,1fr)_96px_72px_96px_34px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Description</span><span>Type</span><span>Qty</span><span>Unit cost</span><span /></div>{lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_72px_96px_34px]"><Input value={line.description} aria-label={`${roomType} installation item ${index + 1}`} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Installation description" /><select value={line.costType} aria-label={`Cost type ${index + 1}`} onChange={(event) => updateLine(index, { costType: event.target.value as InstallationCostType })} className="h-10 rounded-md border border-input bg-background px-2 text-sm"><option value="labor">Labor</option><option value="material">Material</option></select><Input type="number" min="1" value={line.quantity} aria-label={`Quantity ${index + 1}`} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) || 0 })} /><Input type="number" min="0" step="0.01" value={line.unitCost} aria-label={`Unit cost ${index + 1}`} onChange={(event) => updateLine(index, { unitCost: Number(event.target.value) || 0 })} /><Button type="button" variant="ghost" size="icon" aria-label={`Remove installation item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="mr-1 h-4 w-4" />Add installation item</Button></div>
        )}

        <div className="space-y-2"><Label>Customer-facing notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope, exclusions, schedule, or warranty notes." /></div>
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"><Button type="button" variant="outline" onClick={() => setMarkupOpen((open) => !open)} aria-expanded={markupOpen}><Percent className="mr-2 h-4 w-4" />{markupOpen ? "Hide markup" : "Mark Up"}</Button>{markupOpen && <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end"><div className="space-y-1.5"><Label htmlFor="installation-markup">Add markup (%)</Label><div className="relative"><Input id="installation-markup" type="number" min="0" step="0.01" value={markupPercent} onChange={(event) => setMarkupPercent(Math.max(0, Number(event.target.value) || 0))} className="pr-8" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span></div></div><p className="text-xs text-muted-foreground">Markup applies to the installation subtotal only. Cabinet Dealz material pricing remains separate.</p></div>}</div>
        <div className="space-y-1 rounded-lg bg-muted/40 px-4 py-3 text-sm"><div className="flex justify-between"><span>Installation subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>{markupPercent > 0 && <div className="flex justify-between"><span>Markup ({markupPercent}%)</span><span className="tabular-nums">{money(markupAmount)}</span></div>}<div className="flex justify-between border-t pt-1 font-bold"><span>Installation total</span><span className="text-xl tabular-nums">{money(total)}</span></div></div>
        <Button className="w-full" onClick={saveEstimate} disabled={create.isPending}><ReceiptText className="mr-2 h-4 w-4" />Save installation estimate</Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4"><div><h2 className="text-xl font-bold">Customer presentation</h2><p className="text-sm text-muted-foreground">Show these installation totals separately from the Cabinet Dealz material invoice.</p></div>{estimates.isLoading ? <p className="text-sm text-muted-foreground">Loading installation estimates…</p> : estimates.data?.length ? estimates.data.map((estimate) => { const lineItems = (estimate.lineItems ?? []) as SavedLine[]; const exportData = { id: estimate.id, roomType: estimate.roomType, customerName: estimate.customerName, customerEmail: estimate.customerEmail, customerPhone: estimate.customerPhone, lineItems, subtotal: estimate.subtotal, markupPercent: estimate.markupPercent, markupAmount: estimate.markupAmount, totalAmount: estimate.totalAmount }; return <article key={estimate.id} className="rounded-lg border border-border p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{estimate.customerName || estimate.customerEmail || `Installation estimate #${estimate.id}`}</p><p className="text-xs text-muted-foreground">{estimate.roomType} · Affiliate installation invoice · Material invoice is issued separately by Cabinet Dealz</p></div><Badge variant="outline" className="capitalize">{estimate.status}</Badge></div><div className="space-y-1.5 text-sm">{lineItems.map((line, index) => <div key={index} className="flex justify-between gap-3"><span>{line.quantity} × {line.description} <span className="text-xs text-muted-foreground">({line.costType})</span></span><span className="tabular-nums">{money(line.lineTotal)}</span></div>)}</div><div className="border-t pt-2 flex items-center justify-between font-bold"><span>Installation total</span><span>{money(estimate.totalAmount)}</span></div>{Number(estimate.markupPercent) > 0 && <p className="text-xs text-muted-foreground">Markup: {Number(estimate.markupPercent).toFixed(2)}% ({money(estimate.markupAmount)})</p>}{estimate.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{estimate.notes}</p>}<div className="flex flex-wrap gap-2">{installationEstimateStatusAction(estimate.status) === "share" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: estimate.id, affiliateId, status: "shared" })}><Send className="mr-1 h-3.5 w-3.5" />Mark shared with customer</Button>}<Button size="sm" variant="outline" onClick={() => downloadInstallationEstimateCsv(exportData)}>Download CSV</Button><Button size="sm" variant="outline" onClick={() => { void downloadInstallationEstimatePdf(exportData).catch((error: unknown) => toast.error("Could not create PDF", { description: error instanceof Error ? error.message : "Please try again." })); }}>Download PDF</Button>{isCustomerVisibleInstallationEstimate(estimate.status) && estimate.shareToken && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${installationEstimateDocumentPath(estimate.shareToken!)}`); toast.success("Customer installation document link copied."); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy customer document</Button>}</div></article>; }) : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No installation estimates yet. Create one for the customer’s installation work.</div>}</section>
    </div>
  );
}
