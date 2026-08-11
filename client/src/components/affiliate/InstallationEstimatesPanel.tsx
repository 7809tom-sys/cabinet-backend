import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, ReceiptText, Send, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

type DraftLine = { description: string; quantity: number; unitCost: number };

const money = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

export function InstallationEstimatesPanel({ affiliateId }: { affiliateId: number }) {
  const utils = trpc.useUtils();
  const estimates = trpc.installationEstimates.list.useQuery({ affiliateId });
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ description: "Cabinet installation labor", quantity: 1, unitCost: 0 }]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost), 0),
    [lines],
  );
  const create = trpc.installationEstimates.create.useMutation({
    onSuccess: () => {
      toast.success("Installation estimate saved separately from the material order.");
      setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setNotes("");
      setLines([{ description: "Cabinet installation labor", quantity: 1, unitCost: 0 }]);
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
      customerName: customerName.trim() || null,
      customerEmail: customerEmail.trim() || null,
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      lineItems: valid.map((line) => ({ description: line.description.trim(), quantity: line.quantity, unitCost: line.unitCost })),
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-bold">Installation estimate</h2>
            <p className="text-sm text-muted-foreground">Create the affiliate’s installation document. Cabinet Dealz material totals stay separate.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Customer name</Label><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></div>
          <div className="space-y-1.5"><Label>Customer email</Label><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="customer@example.com" /></div>
          <div className="space-y-1.5"><Label>Customer phone</Label><Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(555) 555-5555" /></div>
        </div>
        <div className="space-y-2">
          <Label>Installation items</Label>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_72px_96px_34px] gap-2">
              <Input value={line.description} aria-label={`Installation item ${index + 1}`} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="Installation description" />
              <Input type="number" min="1" value={line.quantity} aria-label={`Quantity ${index + 1}`} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) || 0 } : item))} />
              <Input type="number" min="0" step="0.01" value={line.unitCost} aria-label={`Unit cost ${index + 1}`} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost: Number(event.target.value) || 0 } : item))} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove installation item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { description: "", quantity: 1, unitCost: 0 }])}><Plus className="mr-1 h-4 w-4" />Add installation item</Button>
        </div>
        <div className="space-y-1.5"><Label>Customer-facing notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope, exclusions, schedule, or warranty notes." /></div>
        <div className="rounded-lg bg-muted/40 px-4 py-3 flex items-center justify-between"><span className="font-medium">Installation total</span><span className="text-xl font-bold tabular-nums">{money(subtotal)}</span></div>
        <Button className="w-full" onClick={saveEstimate} disabled={create.isPending}><ReceiptText className="mr-2 h-4 w-4" />Save installation estimate</Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div><h2 className="text-xl font-bold">Customer presentation</h2><p className="text-sm text-muted-foreground">Show these installation totals separately from the Cabinet Dealz material invoice.</p></div>
        {estimates.isLoading ? <p className="text-sm text-muted-foreground">Loading installation estimates…</p> : estimates.data?.length ? estimates.data.map((estimate) => {
          const lineItems = (estimate.lineItems ?? []) as Array<{ description: string; quantity: number; unitCost: number; lineTotal: number }>;
          return <article key={estimate.id} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{estimate.customerName || estimate.customerEmail || `Installation estimate #${estimate.id}`}</p><p className="text-xs text-muted-foreground">Affiliate installation invoice · Material invoice is issued separately by Cabinet Dealz</p></div><Badge variant="outline" className="capitalize">{estimate.status}</Badge></div>
            <div className="space-y-1.5 text-sm">{lineItems.map((line, index) => <div key={index} className="flex justify-between gap-3"><span>{line.quantity} × {line.description}</span><span className="tabular-nums">{money(line.lineTotal)}</span></div>)}</div>
            <div className="border-t pt-2 flex items-center justify-between font-bold"><span>Installation total</span><span>{money(estimate.totalAmount)}</span></div>
            {estimate.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{estimate.notes}</p>}
            {estimate.status === "draft" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: estimate.id, affiliateId, status: "shared" })}><Send className="mr-1 h-3.5 w-3.5" />Mark shared with customer</Button>}
            {estimate.status !== "draft" && estimate.shareToken && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/installation-estimate/${estimate.shareToken}`); toast.success("Customer installation document link copied."); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy customer document</Button>}
          </article>;
        }) : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No installation estimates yet. Create one for the customer’s installation work.</div>}
      </section>
    </div>
  );
}
