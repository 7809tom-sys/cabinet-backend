import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Package } from "lucide-react";

type Status = "draft" | "submitted" | "confirmed" | "cancelled";

type EnrichedLine = {
  cabinetId: number | null;
  masterCode: string;
  rawCode?: string;
  description: string;
  qty: number;
  unitPrice: number | null;
  linePrice: number | null;
  doorStyle?: string | null;
  styleId?: number | null;
  tier?: string | null;
  matched: boolean;
  poSku: string | null;
};

type OrderRow = {
  id: number;
  requestNumber: string;
  originatorName: string | null;
  originatorEmail: string | null;
  originatorPhone: string | null;
  status: Status;
  tier: string;
  styleName: string | null;
  totalAmount: string | null;
  itemCount: number;
  notes: string | null;
  lineItems: EnrichedLine[];
  createdAt: Date;
};

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  confirmed: "bg-green-500/20 text-green-700 dark:text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

function copyPoSkus(lines: EnrichedLine[]) {
  const text = lines
    .filter((l) => l.poSku)
    .map((l) => `${l.qty}x  ${l.poSku}  — ${l.description}`)
    .join("\n");
  navigator.clipboard.writeText(text).then(() => toast.success("PO SKUs copied to clipboard"));
}

function OrderDetailDialog({
  order,
  open,
  onClose,
}: {
  order: OrderRow;
  open: boolean;
  onClose: () => void;
}) {
  const confirm = trpc.orders.confirm.useMutation({
    onSuccess: () => {
      toast.success("Order confirmed");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            Order {order.requestNumber}
            <Badge className={STATUS_COLORS[order.status]}>{order.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Customer info */}
        <div className="grid grid-cols-2 gap-4 text-sm border rounded-lg p-4 bg-muted/30">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Customer</p>
            <p className="font-medium">{order.originatorName || "—"}</p>
            <p className="text-muted-foreground">{order.originatorEmail || ""}</p>
            <p className="text-muted-foreground">{order.originatorPhone || ""}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Order Info</p>
            <p><span className="text-muted-foreground">Style:</span> {order.styleName || "—"}</p>
            <p><span className="text-muted-foreground">Tier:</span> {order.tier}</p>
            <p><span className="text-muted-foreground">Total:</span> {order.totalAmount ? `$${order.totalAmount}` : "—"}</p>
            <p><span className="text-muted-foreground">Date:</span> {new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {order.notes && (
          <div className="text-sm border rounded-lg p-3 bg-amber-500/5 border-amber-500/20">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Notes</p>
            <p>{order.notes}</p>
          </div>
        )}

        {/* PO SKU table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Line Items — PO SKUs</h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => copyPoSkus(order.lineItems)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy PO SKUs
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">Qty</TableHead>
                  <TableHead>PO SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lineItems.map((l, i) => (
                  <TableRow key={i} className={!l.matched ? "opacity-60" : ""}>
                    <TableCell className="text-center font-mono font-semibold">{l.qty}</TableCell>
                    <TableCell>
                      {l.poSku ? (
                        <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {l.poSku}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground italic">
                          {l.masterCode || l.rawCode || "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.description}
                      {!l.matched && (
                        <Badge variant="destructive" className="ml-2 text-xs">unmatched</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.unitPrice != null ? `$${l.unitPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {l.linePrice != null ? `$${l.linePrice.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {order.lineItems.some((l) => !l.poSku) && (
            <p className="text-xs text-muted-foreground mt-2">
              * Lines without a PO SKU are unmatched or missing a door style assignment.
            </p>
          )}
        </div>

        {/* Actions */}
        {order.status === "submitted" && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              onClick={() => confirm.mutate({ id: order.id })}
              disabled={confirm.isPending}
              className="gap-2"
            >
              {confirm.isPending && <Spinner className="h-4 w-4" />}
              Confirm Order
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function IncomingOrdersAdmin() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);

  const { data: orders, isLoading, error, refetch } = trpc.orders.adminListWithPoSkus.useQuery(
    statusFilter !== "all" ? { status: statusFilter as Status } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Failed to load orders.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rows = (orders ?? []) as OrderRow[];

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Incoming Orders</h2>
          <p className="text-sm text-muted-foreground">
            Each line item shows the PO SKU in{" "}
            <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              distributor-style-partno
            </span>{" "}
            format (e.g. <span className="font-mono text-xs text-primary">usd-sw-3db24</span>).
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No orders found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <Card key={order.id} className="overflow-hidden">
                {/* Order summary row */}
                <CardHeader
                  className="py-3 px-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <CardTitle className="text-sm font-mono font-semibold flex-1">
                      {order.requestNumber}
                    </CardTitle>
                    <Badge className={`text-xs ${STATUS_COLORS[order.status]}`}>
                      {order.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground hidden sm:block">
                      {order.originatorName || order.originatorEmail || "Guest"}
                    </span>
                    <span className="text-sm font-medium">
                      {order.totalAmount ? `$${order.totalAmount}` : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailOrder(order);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </CardHeader>

                {/* Expanded line items */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">
                        {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} ·{" "}
                        {order.styleName || "No style"} · {order.tier}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs h-7"
                        onClick={() => copyPoSkus(order.lineItems)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy PO SKUs
                      </Button>
                    </div>
                    <div className="rounded border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="w-10 text-center text-xs">Qty</TableHead>
                            <TableHead className="text-xs">PO SKU</TableHead>
                            <TableHead className="text-xs">Description</TableHead>
                            <TableHead className="text-right text-xs">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.lineItems.map((l, i) => (
                            <TableRow key={i} className={!l.matched ? "opacity-60" : ""}>
                              <TableCell className="text-center font-mono text-sm font-bold py-2">
                                {l.qty}
                              </TableCell>
                              <TableCell className="py-2">
                                {l.poSku ? (
                                  <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                    {l.poSku}
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground italic">
                                    {l.masterCode || "—"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs py-2">{l.description}</TableCell>
                              <TableCell className="text-right font-mono text-xs py-2">
                                {l.linePrice != null ? `$${l.linePrice.toFixed(2)}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      {detailOrder && (
        <OrderDetailDialog
          order={detailOrder}
          open={!!detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </div>
  );
}
