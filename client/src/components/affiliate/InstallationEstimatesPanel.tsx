import { useMemo, useState } from "react";
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

type DraftLine = { description: string; quantity: number; unitCost: number; costType: InstallationCostType };

type SavedLine = DraftLine & { lineTotal: number };

const money = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

// These are names only, not fabricated prices. The affiliate enters the values from
// their Kitchen Cost Sheet Cabinets. Other room templates can be added later.
const KITCHEN_COST_SHEET_STARTERS: Array<{ description: string; costType: InstallationCostType }> = [
  { description: "Cabinet installation labor", costType: "labor" },
  { description: "Cabinet installation materials", costType: "material" },
  { description: "Cabinet hardware / fasteners", costType: "material" },
  { description: "Fillers, scribes, and trim", costType: "material" },
  { description: "Toe kick and molding installation", costType: "labor" },
  { description: "Countertop installation labor", costType: "labor" },
];

const emptyLine = (): DraftLine => ({ description: "", quantity: 1, unitCost: 0, costType: "labor" });

export function InstallationEstimatesPanel({ affiliateId }: { affiliateId: number }) {
  const utils = trpc.useUtils();
  const estimates = trpc.installationEstimates.list.useQuery({ affiliateId });
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderRequestId, setOrderRequestId] = useState("");
  const [notes, setNotes] = useState("");
  const [roomType, setRoomType] = useState<InstallationRoomType>("Kitchen");
  const [markupOpen, setMarkupOpen] = useState(false);
  const [markupPercent, setMarkupPercent] = useState(0);
  const [lines, setLines] = useState<DraftLine[]>([{ description: "Cabinet installation labor", quantity: 1, unitCost: 0, costType: "labor" }]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost), 0);
    const markupAmount = subtotal * Math.max(0, markupPercent) / 100;
    return { subtotal, markupAmount, total: subtotal + markupAmount };
  }, [lines, markupPercent]);

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line));
  };

  const addKitchenStarter = (starter: (typeof KITCHEN_COST_SHEET_STARTERS)[number]) => {
    setLines((current) => [...current, { ...starter, quantity: 1, unitCost: 0 }]);
  };

  const create = trpc.installationEstimates.create.useMutation({
    onSuccess: () => {
      toast.success("Installation estimate saved separately from the material order.");
      setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setOrderRequestId(""); setNotes("");
      setRoomType("Kitchen"); setMarkupPercent(0); setMarkupOpen(false);
      setLines([{ description: "Cabinet installation labor", quantity: 1, unitCost: 0, costType: "labor" }]);
      utils.installationEstimates.list.invalidate({ affiliateId });
    },
    onError: (error) => toast.error("Could not save installation estimate", { description: error.message }),
  });
  const updateStatus = trpc.installationEstimates.updateStatus.useMutation({
    onSuccess: () => utils.installationEstimates.list.invalidate({ affiliateId }),
    onError: (error) => toast.error(error.message),
  });

  function saveEstimate() {
    const valid = lines.filter((line) => line.description.trim() && line.quantity > 0);
    if (!valid.length) {
      toast.error("Add at least one installation line item.");
      return;
    }
    create.mutate({
      affiliateId,
      roomType,
      markupPercent,
      orderRequestId: Number(orderRequestId) || null,
      customerName: customerName.trim() || null,
      customerEmail: customerEmail.trim() || null,
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      lineItems: valid.map((line) => ({ description: line.description.trim(), quantity: line.quantity, unitCost: line.unitCost, costType: line.costType })),
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div>
            <div>
              <h2 className="text-xl font-bold">Installation estimate</h2>
              <p className="text-sm text-muted-foreground">Create the affiliate’s installation document. Cabinet Dealz material totals stay separate.</p>
            </div>
          </div>
          <div className="w-full sm:w-56 space-y-1.5">
            <Label htmlFor="installation-room-type">Room type</Label>
            <select id="installation-room-type" value={roomType} onChange={(event) => setRoomType(event.target.value as InstallationRoomType)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {INSTALLATION_ROOM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm">
          <p className="font-semibold">{roomType} installation items</p>
          <p className="mt-1 text-muted-foreground">Choose a room to keep its installation estimate organized. Kitchen is the first cost-sheet workflow; enter the values from your Kitchen Cost Sheet Cabinets below.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Customer name</Label><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></div>
          <div className="space-y-1.5"><Label>Customer email</Label><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="customer@example.com" /></div>
          <div className="space-y-1.5"><Label>Customer phone</Label><Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(555) 555-5555" /></div>
          <div className="space-y-1.5"><Label>Cabinet Dealz material order # <span className="font-normal text-muted-foreground">(optional)</span></Label><Input inputMode="numeric" value={orderRequestId} onChange={(event) => setOrderRequestId(event.target.value.replace(/\D/g, ""))} placeholder="Material order request ID" /></div>
        </div>

        {roomType === "Kitchen" && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/30 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Kitchen Cost Sheet Cabinets</p><p className="text-xs text-muted-foreground">Starter item names only — enter your sheet’s material and labor costs.</p></div><Badge variant="outline">No prices imported</Badge></div>
            <div className="flex flex-wrap gap-2">{KITCHEN_COST_SHEET_STARTERS.map((starter) => <Button key={starter.description} type="button" variant="outline" size="sm" className="text-xs" onClick={() => addKitchenStarter(starter)}><Plus className="mr-1 h-3.5 w-3.5" />{starter.description}</Button>)}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Installation items</Label>
          <div className="hidden grid-cols-[minmax(0,1fr)_96px_72px_96px_34px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Description</span><span>Type</span><span>Qty</span><span>Unit cost</span><span /></div>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_72px_96px_34px]">
              <Input value={line.description} aria-label={`Installation item ${index + 1}`} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Installation description" />
              <select value={line.costType} aria-label={`Cost type ${index + 1}`} onChange={(event) => updateLine(index, { costType: event.target.value as InstallationCostType })} className="h-10 rounded-md border border-input bg-background px-2 text-sm"><option value="labor">Labor</option><option value="material">Material</option></select>
              <Input type="number" min="1" value={line.quantity} aria-label={`Quantity ${index + 1}`} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) || 0 })} />
              <Input type="number" min="0" step="0.01" value={line.unitCost} aria-label={`Unit cost ${index + 1}`} onChange={(event) => updateLine(index, { unitCost: Number(event.target.value) || 0 })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove installation item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="mr-1 h-4 w-4" />Add installation item</Button>
        </div>

        <div className="space-y-2"><Label>Customer-facing notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope, exclusions, schedule, or warranty notes." /></div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <Button type="button" variant="outline" onClick={() => setMarkupOpen((open) => !open)} aria-expanded={markupOpen}><Percent className="mr-2 h-4 w-4" />{markupOpen ? "Hide markup" : "Mark Up"}</Button>
          {markupOpen && <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end"><div className="space-y-1.5"><Label htmlFor="installation-markup">Add markup (%)</Label><div className="relative"><Input id="installation-markup" type="number" min="0" step="0.01" value={markupPercent} onChange={(event) => setMarkupPercent(Math.max(0, Number(event.target.value) || 0))} className="pr-8" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span></div></div><p className="text-xs text-muted-foreground">Markup applies to the installation subtotal only. Cabinet Dealz material pricing remains separate.</p></div>}
        </div>

        <div className="space-y-1 rounded-lg bg-muted/40 px-4 py-3 text-sm"><div className="flex justify-between"><span>Installation subtotal</span><span className="tabular-nums">{money(totals.subtotal)}</span></div>{markupPercent > 0 && <div className="flex justify-between"><span>Markup ({markupPercent}%)</span><span className="tabular-nums">{money(totals.markupAmount)}</span></div>}<div className="flex justify-between border-t pt-1 font-bold"><span>Installation total</span><span className="text-xl tabular-nums">{money(totals.total)}</span></div></div>
        <Button className="w-full" onClick={saveEstimate} disabled={create.isPending}><ReceiptText className="mr-2 h-4 w-4" />Save installation estimate</Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div><h2 className="text-xl font-bold">Customer presentation</h2><p className="text-sm text-muted-foreground">Show these installation totals separately from the Cabinet Dealz material invoice.</p></div>
        {estimates.isLoading ? <p className="text-sm text-muted-foreground">Loading installation estimates…</p> : estimates.data?.length ? estimates.data.map((estimate) => {
          const lineItems = (estimate.lineItems ?? []) as SavedLine[];
          return <article key={estimate.id} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{estimate.customerName || estimate.customerEmail || `Installation estimate #${estimate.id}`}</p><p className="text-xs text-muted-foreground">{estimate.roomType} · Affiliate installation invoice · Material invoice is issued separately by Cabinet Dealz</p></div><Badge variant="outline" className="capitalize">{estimate.status}</Badge></div>
            <div className="space-y-1.5 text-sm">{lineItems.map((line, index) => <div key={index} className="flex justify-between gap-3"><span>{line.quantity} × {line.description} <span className="text-xs text-muted-foreground">({line.costType})</span></span><span className="tabular-nums">{money(line.lineTotal)}</span></div>)}</div>
            <div className="border-t pt-2 flex items-center justify-between font-bold"><span>Installation total</span><span>{money(estimate.totalAmount)}</span></div>
            {Number(estimate.markupPercent) > 0 && <p className="text-xs text-muted-foreground">Markup: {Number(estimate.markupPercent).toFixed(2)}% ({money(estimate.markupAmount)})</p>}
            {estimate.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{estimate.notes}</p>}
            {installationEstimateStatusAction(estimate.status) === "share" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: estimate.id, affiliateId, status: "shared" })}><Send className="mr-1 h-3.5 w-3.5" />Mark shared with customer</Button>}
            {isCustomerVisibleInstallationEstimate(estimate.status) && estimate.shareToken && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${installationEstimateDocumentPath(estimate.shareToken!)}`); toast.success("Customer installation document link copied."); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy customer document</Button>}
          </article>;
        }) : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No installation estimates yet. Create one for the customer’s installation work.</div>}
      </section>
    </div>
  );
}
