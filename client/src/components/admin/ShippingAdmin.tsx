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
import { Plus, Trash2, Truck, Calculator, Plug, ShieldCheck } from "lucide-react";

// Dollars <-> cents helpers (we edit dollars, store cents).
const toDollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (dollars: string) => Math.round((parseFloat(dollars) || 0) * 100);
const numOr = (s: string, d: number) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
};

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
  markupPct: string;
  damageFeePct: string;
  freeFreightThreshold: string;
  defaultCabinetWeightLbs: string;
  // Live-quote model
  quoteMode: "estimator" | "live";
  liveProvider: "estimator" | "easypost" | "shippo";
  kitchenFreightFloor: string; // dollars
  kitchenMinCabinets: string;
  palletLengthIn: string;
  palletWidthIn: string;
  palletHeightIn: string;
  palletMaxWeightLbs: string;
  palletMaxCubicFt: string;
  palletTareLbs: string;
  freightClass: string;
  defaultCabinetCubicFt: string;
}

export default function ShippingAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.freight.adminGet.useQuery();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState(""); // write-only
  const [hasKey, setHasKey] = useState(false);

  // Test live quote
  const [testZip, setTestZip] = useState("30303");
  const [testWeight, setTestWeight] = useState("900");
  const [testCube, setTestCube] = useState("80");
  const [testResidential, setTestResidential] = useState(false);

  useEffect(() => {
    if (!data) return;
    const s = data.settings as
      | (NonNullable<typeof data.settings> & { hasLiveApiKey?: boolean })
      | null;
    setHasKey(!!s?.hasLiveApiKey);
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
      quoteMode: (s?.quoteMode ?? "estimator") as "estimator" | "live",
      liveProvider: (s?.liveProvider ?? "estimator") as "estimator" | "easypost" | "shippo",
      kitchenFreightFloor: toDollars(s?.kitchenFreightFloorCents ?? 80000),
      kitchenMinCabinets: String(s?.kitchenMinCabinets ?? 6),
      palletLengthIn: String(s?.palletLengthIn ?? "96"),
      palletWidthIn: String(s?.palletWidthIn ?? "40"),
      palletHeightIn: String(s?.palletHeightIn ?? "60"),
      palletMaxWeightLbs: String(s?.palletMaxWeightLbs ?? "1200"),
      palletMaxCubicFt: String(s?.palletMaxCubicFt ?? "100"),
      palletTareLbs: String(s?.palletTareLbs ?? "50"),
      freightClass: String(s?.freightClass ?? "175"),
      defaultCabinetCubicFt: String(s?.defaultCabinetCubicFt ?? "8"),
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
      setApiKeyInput("");
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
  const testLive = trpc.freight.testLiveQuote.useMutation({
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          `Live quote: $${toDollars(r.amountCents ?? 0)}` +
            (r.carrier ? ` · ${r.carrier}` : "") +
            (r.palletCount ? ` · ${r.palletCount} pallet(s)` : "")
        );
      } else {
        toast.error(r.error ?? "Live quote failed");
      }
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
      markupBps: Math.round(numOr(form.markupPct, 0) * 100),
      damageFeeBps: Math.round(numOr(form.damageFeePct, 0) * 100),
      freeFreightThresholdCents: toCents(form.freeFreightThreshold),
      defaultCabinetWeightLbs: numOr(form.defaultCabinetWeightLbs, 45),
      quoteMode: form.quoteMode,
      liveProvider: form.liveProvider,
      liveApiKey: apiKeyInput.trim().length > 0 ? apiKeyInput.trim() : undefined,
      kitchenFreightFloorCents: toCents(form.kitchenFreightFloor),
      kitchenMinCabinets: Math.round(numOr(form.kitchenMinCabinets, 6)),
      palletLengthIn: numOr(form.palletLengthIn, 96),
      palletWidthIn: numOr(form.palletWidthIn, 40),
      palletHeightIn: numOr(form.palletHeightIn, 60),
      palletMaxWeightLbs: numOr(form.palletMaxWeightLbs, 1200),
      palletMaxCubicFt: numOr(form.palletMaxCubicFt, 100),
      palletTareLbs: numOr(form.palletTareLbs, 50),
      freightClass: form.freightClass.trim() || "175",
      defaultCabinetCubicFt: numOr(form.defaultCabinetCubicFt, 8),
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

  function handleTestLive() {
    testLive.mutate({
      destinationZip: testZip.trim(),
      testWeightLbs: numOr(testWeight, 900),
      testCubicFt: numOr(testCube, 80),
      residential: testResidential,
    });
  }

  const liveMode = form.quoteMode === "live";

  return (
    <div className="space-y-6">
      {/* ── Shipping mode + live provider ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" /> Shipping Mode
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose how freight is priced. <strong>Live quote</strong> calls a carrier API for a real
            LTL rate (no estimates). Until a key is connected, the storefront shows
            "shipping quoted on your order" rather than a guessed amount.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Quote mode</Label>
              <Select value={form.quoteMode} onValueChange={(v) => set({ quoteMode: v as "estimator" | "live" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live carrier quote (recommended)</SelectItem>
                  <SelectItem value="estimator">In-house estimator (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Live provider</Label>
              <Select
                value={form.liveProvider}
                onValueChange={(v) => set({ liveProvider: v as "estimator" | "easypost" | "shippo" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easypost">EasyPost (LTL freight)</SelectItem>
                  <SelectItem value="shippo">Shippo (coming soon)</SelectItem>
                  <SelectItem value="estimator">None (estimator only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Carrier API key
              {hasKey && (
                <span className="text-xs font-normal text-emerald-600">• key on file</span>
              )}
            </Label>
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasKey ? "•••••••• (leave blank to keep current key)" : "Paste your EasyPost API key (EZTK… test or EZAK… live)"}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Stored securely server-side and never displayed back. Use your <strong>test key</strong>{" "}
              first to verify, then switch to the live key.
            </p>
          </div>

          {liveMode && form.liveProvider === "easypost" && !hasKey && apiKeyInput.trim().length === 0 && (
            <p className="text-sm text-amber-600">
              Live mode is on but no API key is connected yet — the storefront will show
              "shipping quoted on your order" until you save a key.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Origin, pallet, floor, class ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Freight Basis
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cabinets ship flat-pack (RTA) on freight pallets. Live quotes are built from each
            order's <strong>packaged weight + cubic feet</strong>, packed onto 8&nbsp;ft pallets.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Origin ZIP (ship-from)</Label>
              <Input value={form.originZip} onChange={(e) => set({ originZip: e.target.value })} placeholder="30303" />
            </div>
            <div className="space-y-1.5">
              <Label>Freight class</Label>
              <Input value={form.freightClass} onChange={(e) => set({ freightClass: e.target.value })} placeholder="175" />
            </div>
            <div className="space-y-1.5">
              <Label>Handling markup %</Label>
              <Input value={form.markupPct} onChange={(e) => set({ markupPct: e.target.value })} placeholder="15" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Kitchen freight minimum ($ floor)</Label>
              <Input value={form.kitchenFreightFloor} onChange={(e) => set({ kitchenFreightFloor: e.target.value })} placeholder="800.00" />
              <p className="text-xs text-muted-foreground">A kitchen-scale order is never quoted below this.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Kitchen = at least N cabinets</Label>
              <Input value={form.kitchenMinCabinets} onChange={(e) => set({ kitchenMinCabinets: e.target.value })} placeholder="6" />
              <p className="text-xs text-muted-foreground">Small parts orders below this are not forced to the floor.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">8&nbsp;ft pallet definition</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Length (in)</Label>
                <Input value={form.palletLengthIn} onChange={(e) => set({ palletLengthIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Width (in)</Label>
                <Input value={form.palletWidthIn} onChange={(e) => set({ palletWidthIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Height (in)</Label>
                <Input value={form.palletHeightIn} onChange={(e) => set({ palletHeightIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max weight / pallet (lbs)</Label>
                <Input value={form.palletMaxWeightLbs} onChange={(e) => set({ palletMaxWeightLbs: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max cube / pallet (cu ft)</Label>
                <Input value={form.palletMaxCubicFt} onChange={(e) => set({ palletMaxCubicFt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Pallet tare (lbs)</Label>
                <Input value={form.palletTareLbs} onChange={(e) => set({ palletTareLbs: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Default cabinet packaged weight (lbs)</Label>
              <Input value={form.defaultCabinetWeightLbs} onChange={(e) => set({ defaultCabinetWeightLbs: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default cabinet packaged cube (cu ft)</Label>
              <Input value={form.defaultCabinetCubicFt} onChange={(e) => set({ defaultCabinetCubicFt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Free freight over ($, 0 = off)</Label>
              <Input value={form.freeFreightThreshold} onChange={(e) => set({ freeFreightThreshold: e.target.value })} />
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={saveSettings.isPending}>
            {saveSettings.isPending ? "Saving…" : "Save shipping settings"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Test live quote ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" /> Test Live Quote
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sends a sample pallet to the carrier using the <strong>saved</strong> key + origin. Save
            your settings first, then test.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Destination ZIP</Label>
              <Input value={testZip} onChange={(e) => setTestZip(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Test weight (lbs)</Label>
              <Input value={testWeight} onChange={(e) => setTestWeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Test cube (cu ft)</Label>
              <Input value={testCube} onChange={(e) => setTestCube(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={testResidential} onCheckedChange={setTestResidential} id="resi" />
              <Label htmlFor="resi">Residential</Label>
            </div>
          </div>
          <Button onClick={handleTestLive} disabled={testLive.isPending} variant="outline" className="bg-background">
            {testLive.isPending ? "Requesting live rate…" : "Run live test quote"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Legacy estimator zones (only relevant in estimator mode) ──── */}
      <Card className={liveMode ? "opacity-70" : ""}>
        <CardHeader>
          <CardTitle>Estimator Zones (legacy)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only used when Quote mode is set to <strong>In-house estimator</strong>. Match a
            destination by leading ZIP digits (comma-separated; longest match wins).
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
            <Button variant="outline" size="sm" className="bg-background" onClick={() => setZones([...zones, { zoneName: "", zipPrefixes: "", rateDollars: "0.00" }])}>
              <Plus className="h-4 w-4 mr-1" /> Add zone
            </Button>
            <Button size="sm" onClick={handleSaveZones} disabled={saveZones.isPending}>
              {saveZones.isPending ? "Saving…" : "Save zones"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
