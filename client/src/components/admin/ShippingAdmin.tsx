import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Truck, Calculator } from "lucide-react";
import { estimateFreight, type FreightZoneRate, type FreightSettings } from "@shared/freight";

// Dollars <-> cents helpers for the form (we edit dollars, store cents).
const toDollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (dollars: string) => Math.round((parseFloat(dollars) || 0) * 100);

type ZoneRow = { zoneName: string; zipPrefixes: string; rateDollars: string };

interface SettingsForm {
  enabled: boolean;
  originZip: string;
  rateModel: "per_cwt" | "flat";
  handlingFee: string;
  minCharge: string;
  liftgateFee: string;
  residentialFee: string;
  insideDeliveryFee: string;
  markupPct: string; // percent in the UI; stored as bps
  damageFeePct: string;
  freeFreightThreshold: string;
  defaultCabinetWeightLbs: string;
}

export default function ShippingAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.freight.adminGet.useQuery();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  // Quick test calculator
  const [testZip, setTestZip] = useState("30303");
  const [testWeight, setTestWeight] = useState("400");
  const [testSubtotal, setTestSubtotal] = useState("3000");

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      enabled: s?.enabled ?? true,
      originZip: s?.originZip ?? "",
      rateModel: (s?.rateModel ?? "per_cwt") as "per_cwt" | "flat",
      handlingFee: toDollars(s?.handlingFeeCents ?? 0),
      minCharge: toDollars(s?.minChargeCents ?? 8900),
      liftgateFee: toDollars(s?.liftgateFeeCents ?? 7500),
      residentialFee: toDollars(s?.residentialFeeCents ?? 6500),
      insideDeliveryFee: toDollars(s?.insideDeliveryFeeCents ?? 5000),
      markupPct: ((s?.markupBps ?? 1500) / 100).toString(),
      damageFeePct: ((s?.damageFeeBps ?? 0) / 100).toString(),
      freeFreightThreshold: toDollars(s?.freeFreightThresholdCents ?? 0),
      defaultCabinetWeightLbs: String(s?.defaultCabinetWeightLbs ?? "45"),
    });
    setZones(
      (data.zones ?? []).map((z) => ({
        zoneName: z.zoneName,
        zipPrefixes: z.zipPrefixes,
        rateDollars: toDollars(z.rateCents),
      }))
    );
  }, [data]);

  const saveSettings = trpc.freight.adminUpdateSettings.useMutation({
    onSuccess: () => {
      utils.freight.adminGet.invalidate();
      toast.success("Shipping settings saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const saveZones = trpc.freight.adminSaveZones.useMutation({
    onSuccess: () => {
      utils.freight.adminGet.invalidate();
      toast.success("Freight zones saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-destructive">Couldn't load shipping settings: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  if (!form) return null;

  const set = (patch: Partial<SettingsForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function handleSaveSettings() {
    if (!form) return;
    saveSettings.mutate({
      enabled: form.enabled,
      originZip: form.originZip.trim(),
      rateModel: form.rateModel,
      handlingFeeCents: toCents(form.handlingFee),
      minChargeCents: toCents(form.minCharge),
      liftgateFeeCents: toCents(form.liftgateFee),
      residentialFeeCents: toCents(form.residentialFee),
      insideDeliveryFeeCents: toCents(form.insideDeliveryFee),
      markupBps: Math.round((parseFloat(form.markupPct) || 0) * 100),
      damageFeeBps: Math.round((parseFloat(form.damageFeePct) || 0) * 100),
      freeFreightThresholdCents: toCents(form.freeFreightThreshold),
      defaultCabinetWeightLbs: parseFloat(form.defaultCabinetWeightLbs) || 45,
    });
  }

  function handleSaveZones() {
    const cleaned = zones
      .map((z) => ({
        zoneName: z.zoneName.trim(),
        zipPrefixes: z.zipPrefixes.replace(/\s/g, ""),
        rateCents: toCents(z.rateDollars),
      }))
      .filter((z) => z.zoneName && z.zipPrefixes);
    saveZones.mutate({ zones: cleaned });
  }

  // ── Live preview using the same pure estimator the server runs ──
  const previewSettings: FreightSettings = {
    enabled: form.enabled,
    originZip: form.originZip,
    rateModel: form.rateModel,
    handlingFeeCents: toCents(form.handlingFee),
    minChargeCents: toCents(form.minCharge),
    liftgateFeeCents: toCents(form.liftgateFee),
    residentialFeeCents: toCents(form.residentialFee),
    insideDeliveryFeeCents: toCents(form.insideDeliveryFee),
    markupBps: Math.round((parseFloat(form.markupPct) || 0) * 100),
    damageFeeBps: Math.round((parseFloat(form.damageFeePct) || 0) * 100),
    freeFreightThresholdCents: toCents(form.freeFreightThreshold),
    defaultCabinetWeightLbs: parseFloat(form.defaultCabinetWeightLbs) || 45,
  };
  const previewZones: FreightZoneRate[] = zones.map((z) => ({
    zoneName: z.zoneName,
    zipPrefixes: z.zipPrefixes.replace(/\s/g, ""),
    rateCents: toCents(z.rateDollars),
  }));
  const preview = estimateFreight(
    {
      destinationZip: testZip,
      totalWeightLbs: parseFloat(testWeight) || 0,
      merchandiseSubtotalCents: toCents(testSubtotal),
    },
    previewSettings,
    previewZones
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Freight Estimator Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Compute LTL freight in-house (no broker). Set your origin, per-zone rates, fees, and the
            margin to add on top of cost.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} id="enabled" />
            <Label htmlFor="enabled">Freight estimating enabled</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Origin ZIP</Label>
              <Input value={form.originZip} onChange={(e) => set({ originZip: e.target.value })} placeholder="30303" />
            </div>
            <div className="space-y-1.5">
              <Label>Rate model</Label>
              <Select value={form.rateModel} onValueChange={(v) => set({ rateModel: v as "per_cwt" | "flat" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_cwt">Per 100 lbs (CWT)</SelectItem>
                  <SelectItem value="flat">Flat per zone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default cabinet weight (lbs)</Label>
              <Input value={form.defaultCabinetWeightLbs} onChange={(e) => set({ defaultCabinetWeightLbs: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Markup % (your margin)</Label>
              <Input value={form.markupPct} onChange={(e) => set({ markupPct: e.target.value })} placeholder="15" />
            </div>
            <div className="space-y-1.5">
              <Label>Damage coverage % (optional)</Label>
              <Input value={form.damageFeePct} onChange={(e) => set({ damageFeePct: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Free freight over ($, 0 = off)</Label>
              <Input value={form.freeFreightThreshold} onChange={(e) => set({ freeFreightThreshold: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label>Handling ($)</Label>
              <Input value={form.handlingFee} onChange={(e) => set({ handlingFee: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Min charge ($)</Label>
              <Input value={form.minCharge} onChange={(e) => set({ minCharge: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Liftgate ($)</Label>
              <Input value={form.liftgateFee} onChange={(e) => set({ liftgateFee: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Residential ($)</Label>
              <Input value={form.residentialFee} onChange={(e) => set({ residentialFee: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Inside delivery ($)</Label>
              <Input value={form.insideDeliveryFee} onChange={(e) => set({ insideDeliveryFee: e.target.value })} />
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={saveSettings.isPending}>
            {saveSettings.isPending ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Freight Zones</CardTitle>
          <p className="text-sm text-muted-foreground">
            Match a destination by leading ZIP digits (comma-separated; longest match wins). Rate is{" "}
            {form.rateModel === "per_cwt" ? "$ per 100 lbs" : "a flat $ per shipment"}.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zone name</TableHead>
                <TableHead>ZIP prefixes</TableHead>
                <TableHead className="w-32">Rate ($)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((z, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input value={z.zoneName} onChange={(e) => {
                      const next = [...zones]; next[i] = { ...next[i], zoneName: e.target.value }; setZones(next);
                    }} />
                  </TableCell>
                  <TableCell>
                    <Input value={z.zipPrefixes} onChange={(e) => {
                      const next = [...zones]; next[i] = { ...next[i], zipPrefixes: e.target.value }; setZones(next);
                    }} placeholder="30,31,32" />
                  </TableCell>
                  <TableCell>
                    <Input value={z.rateDollars} onChange={(e) => {
                      const next = [...zones]; next[i] = { ...next[i], rateDollars: e.target.value }; setZones(next);
                    }} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZones(zones.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setZones([...zones, { zoneName: "", zipPrefixes: "", rateDollars: "0.00" }])}>
              <Plus className="h-4 w-4 mr-1" /> Add zone
            </Button>
            <Button size="sm" onClick={handleSaveZones} disabled={saveZones.isPending}>
              {saveZones.isPending ? "Saving…" : "Save zones"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" /> Quick Estimate (preview)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Uses your unsaved edits above so you can sanity-check rates before saving.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Destination ZIP</Label>
              <Input value={testZip} onChange={(e) => setTestZip(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total weight (lbs)</Label>
              <Input value={testWeight} onChange={(e) => setTestWeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Merch subtotal ($)</Label>
              <Input value={testSubtotal} onChange={(e) => setTestSubtotal(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-border p-4 bg-muted/30 text-sm">
            {!preview.available ? (
              <p className="text-amber-600">{preview.reason ?? "No quote available."}</p>
            ) : (
              <div className="space-y-1">
                <div className="font-medium">{preview.zoneName} · {preview.billableWeightLbs} lbs billable</div>
                {preview.lines.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span>${toDollars(l.amountCents)}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Markup ({form.markupPct}%)</span>
                  <span>${toDollars(preview.markupCents)}</span>
                </div>
                {preview.damageFeeCents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Damage coverage</span>
                    <span>${toDollars(preview.damageFeeCents)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1 mt-1 font-semibold">
                  <span>{preview.freeFreightApplied ? "Total (FREE freight)" : "Total freight"}</span>
                  <span>${toDollars(preview.totalCents)}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
