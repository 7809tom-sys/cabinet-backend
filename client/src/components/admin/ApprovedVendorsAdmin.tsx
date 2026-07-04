import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Store, RefreshCw, Plus, Pencil, Trash2, CheckCircle2, XCircle, UserPlus, ShieldCheck, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VendorLine = {
  id: number;
  name: string;
  sourceKey: string | null;
  category: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  isApproved: boolean;
  totalSalesCents: number;
  salesUpdatedAt: Date | string | null;
  notes: string | null;
};

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function VendorDialog({
  vendor,
  trigger,
  onSaved,
}: {
  vendor?: VendorLine;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    sourceKey: vendor?.sourceKey ?? "",
    category: vendor?.category ?? "",
    contactName: vendor?.contactName ?? "",
    contactEmail: vendor?.contactEmail ?? "",
    contactPhone: vendor?.contactPhone ?? "",
    isApproved: vendor?.isApproved ?? true,
    notes: vendor?.notes ?? "",
  });

  const upsert = trpc.vendors.upsert.useMutation({
    onSuccess: () => {
      toast.success(vendor ? "Vendor updated" : "Vendor added");
      setOpen(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message || "Failed to save vendor"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit vendor line" : "Add vendor line"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">Vendor / supply line name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Pelican Surfaces & Fixtures"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Surfaces & Fixtures"
              />
            </div>
            <div>
              <Label className="text-xs">Source key (for auto sales)</Label>
              <Input
                value={form.sourceKey}
                onChange={(e) => setForm({ ...form, sourceKey: e.target.value })}
                placeholder="pelican or dist:3"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact name</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Contact phone</Label>
              <Input
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Contact email</Label>
            <Input
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isApproved}
              onCheckedChange={(v) => setForm({ ...form, isApproved: v })}
            />
            <Label className="text-sm">Approved vendor</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={upsert.isPending || !form.name.trim()}
            onClick={() =>
              upsert.mutate({
                id: vendor?.id,
                name: form.name.trim(),
                sourceKey: form.sourceKey.trim() || null,
                category: form.category,
                contactName: form.contactName,
                contactEmail: form.contactEmail,
                contactPhone: form.contactPhone,
                isApproved: form.isApproved,
                notes: form.notes,
              })
            }
          >
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Provision Vendor Account Dialog ─────────────────────────────────────────
function ProvisionAccountDialog({ vendorId, vendorName, onDone }: { vendorId: number; vendorName: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  // Get list of distributors to link
  const distributors = trpc.distributors.list.useQuery(undefined, { enabled: open });
  const [selectedDistId, setSelectedDistId] = useState<string>("");

  const provision = trpc.vendor.adminProvisionVendor.useMutation({
    onSuccess: (res) => {
      toast.success(res.created ? `Account created for ${form.email}` : `Existing account linked to distributor`);
      setOpen(false);
      setForm({ email: "", password: "", name: "" });
      onDone();
    },
    onError: (e) => toast.error(e.message || "Failed to provision account"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1" title="Create vendor login">
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Provision Vendor Account: {vendorName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">Email (login)</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="vendor@company.com"
            />
          </div>
          <div>
            <Label className="text-xs">Temporary Password (min 8 chars)</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Temp1234!"
            />
          </div>
          <div>
            <Label className="text-xs">Display Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Contact name"
            />
          </div>
          <div>
            <Label className="text-xs">Link to Distributor Line</Label>
            <Select value={selectedDistId} onValueChange={setSelectedDistId}>
              <SelectTrigger><SelectValue placeholder="Select distributor line" /></SelectTrigger>
              <SelectContent>
                {(distributors.data ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name} ({d.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={provision.isPending || !form.email || !form.password || form.password.length < 8 || !selectedDistId}
            onClick={() => provision.mutate({
              email: form.email,
              password: form.password,
              name: form.name || form.email,
              distributorId: Number(selectedDistId),
            })}
          >
            {provision.isPending ? "Creating…" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending Products Approval ───────────────────────────────────────────────
function PendingProductsSection() {
  const utils = trpc.useUtils();
  const pending = trpc.distributorPortal.catalog.useQuery({ onlyPending: true, limit: 100, offset: 0 });
  const approve = trpc.distributorPortal.adminSetProductStatus.useMutation({
    onSuccess: () => {
      utils.distributorPortal.catalog.invalidate();
      toast.success("Product status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = pending.data?.items ?? [];

  if (pending.isLoading) return <div className="py-4 text-center"><Spinner /></div>;
  if (items.length === 0) return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      No pending product submissions.
    </div>
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4" /> Pending Product Submissions ({items.length})
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Cabinet</TableHead>
            <TableHead>Style</TableHead>
            <TableHead>List Price</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item: any) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">{item.distributorSku}</TableCell>
              <TableCell>{item.masterCode || item.cabinetId}</TableCell>
              <TableCell>{item.styleName || item.styleId}</TableCell>
              <TableCell>{item.listPrice ? `$${item.listPrice}` : "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-green-600"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ skuId: item.id, status: "approved" })}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-destructive"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ skuId: item.id, status: "rejected" })}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ApprovedVendorsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.vendors.list.useQuery();

  const recompute = trpc.vendors.recomputeSales.useMutation({
    onSuccess: (res) => {
      if (res.success && (res as any).autoComputed === false) {
        toast.info("No auto-attribution rule for this line — set a source key (e.g. pelican, dist:3) or enter sales manually.");
      } else {
        toast.success("Sales recomputed");
      }
      utils.vendors.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to recompute"),
  });

  const remove = trpc.vendors.remove.useMutation({
    onSuccess: () => {
      toast.success("Vendor removed");
      utils.vendors.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to remove"),
  });

  const vendors = (data ?? []) as VendorLine[];
  const totalAll = vendors.reduce((sum, v) => sum + (v.totalSalesCents || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" /> Approved Vendors
            </CardTitle>
            <CardDescription>
              Your supply-line scorecard. Track approval status and lifetime dollar
              sales per vendor. Sales recompute from real, non-cancelled orders —
              a Pelican line stays at $0 until Pelican products are actually
              ordered. Set a source key (<code>pelican</code> or{" "}
              <code>dist:&lt;id&gt;</code>) to enable automatic totals.
            </CardDescription>
          </div>
          <VendorDialog
            trigger={
              <Button className="gap-1 shrink-0">
                <Plus className="h-4 w-4" /> Add vendor
              </Button>
            }
            onSaved={() => utils.vendors.list.invalidate()}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {error.message || "Could not load vendors."}
          </p>
        ) : vendors.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No vendor lines yet. Add your first approved vendor above.
          </p>
        ) : (
          <>
            <div className="mb-4 rounded-lg border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total tracked sales across all vendors
              </div>
              <div className="text-2xl font-bold">{money(totalAll)}</div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total sales</TableHead>
                  <TableHead className="w-[220px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="font-medium">{v.name}</div>
                      {v.contactName && (
                        <div className="text-xs text-muted-foreground">{v.contactName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {v.category || "—"}
                    </TableCell>
                    <TableCell>
                      {v.isApproved ? (
                        <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" /> Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold">{money(v.totalSalesCents || 0)}</div>
                      {v.salesUpdatedAt && (
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(v.salesUpdatedAt).toLocaleDateString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={recompute.isPending}
                          onClick={() => recompute.mutate({ id: v.id })}
                          title="Recompute sales from orders"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <VendorDialog
                          vendor={v}
                          trigger={
                            <Button size="sm" variant="outline">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                          onSaved={() => utils.vendors.list.invalidate()}
                        />
                        <ProvisionAccountDialog
                          vendorId={v.id}
                          vendorName={v.name}
                          onDone={() => utils.vendors.list.invalidate()}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (confirm(`Remove vendor "${v.name}"?`)) remove.mutate({ id: v.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>

      {/* Pending product submissions */}
      <CardContent className="border-t pt-6">
        <PendingProductsSection />
      </CardContent>
    </Card>
  );
}
