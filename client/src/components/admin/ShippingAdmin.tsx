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
import { Plus, Trash2, Truck, Plug, ShieldCheck, Activity, X } from "lucide-react";
import FreightTestLab from "./FreightTestLab";
import { isValidZipPrefix, normalizeZipPrefix, parseZipPrefixes, serializeZipPrefixes } from "@/lib/shippingZipPrefixes";

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
  liveProvider: "estimator" | "easypost" | "shippo" | "freightquote" | "globaltranz" | "worldwideexpress";
  // Freightquote credentials
  fqClientId: string;
  fqClientSecret: string;
  fqAccountNumber: string;
  fqEnvironment: "sandbox" | "production";
  // GlobalTranz credentials
  gtzApiKey: string;
  gtzUsername: string;
  gtzPassword: string;
  gtzAccountNumber: string;
  gtzEnvironment: "sandbox" | "production";
  // Worldwide Express credentials
  wwexClientId: string;
  wwexClientSecret: string;
  wwexAccountNumber: string;
  wwexUsername: string;
  wwexPassword: string;
  wwexEnvironment: "sandbox" | "production";
  wwexSandboxTokenUrl: string;
  wwexSandboxRateUrl: string;
  wwexProductionTokenUrl: string;
  wwexProductionRateUrl: string;
  kitchenFreightFloor: string; // dollars
  kitchenMinCabinets: string;
  standardPalletLengthIn: string;
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
  const [hasWwexClientSecret, setHasWwexClientSecret] = useState(false);
  const [zipDrafts, setZipDrafts] = useState<Record<number, string>>({});
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    // Settings queries may finish after a credential mutation. Initialise once
    // only, so an earlier cached response can never put an old Client ID back.
    if (!data || formInitialized) return;
    const s = data.settings as
      | (NonNullable<typeof data.settings> & { hasLiveApiKey?: boolean; hasWwexClientSecret?: boolean })
      | null;
    setHasKey(!!s?.hasLiveApiKey);
    setHasWwexClientSecret(!!s?.hasWwexClientSecret);
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
      liveProvider: (s?.liveProvider ?? "estimator") as SettingsForm["liveProvider"],
      fqClientId: (s as Record<string, unknown>)?.fqClientId as string ?? "",
      fqClientSecret: "",
      fqAccountNumber: (s as Record<string, unknown>)?.fqAccountNumber as string ?? "",
      fqEnvironment: ((s as Record<string, unknown>)?.fqEnvironment as "sandbox" | "production") ?? "sandbox",
      gtzApiKey: "",
      gtzUsername: (s as Record<string, unknown>)?.gtzUsername as string ?? "",
      gtzPassword: "",
      gtzAccountNumber: (s as Record<string, unknown>)?.gtzAccountNumber as string ?? "",
      gtzEnvironment: ((s as Record<string, unknown>)?.gtzEnvironment as "sandbox" | "production") ?? "sandbox",
      wwexClientId: (s as Record<string, unknown>)?.wwexClientId as string ?? "",
      wwexClientSecret: "",
      wwexAccountNumber: (s as Record<string, unknown>)?.wwexAccountNumber as string ?? "",
      wwexUsername: (s as Record<string, unknown>)?.wwexUsername as string ?? "",
      wwexPassword: "",
      wwexEnvironment: ((s as Record<string, unknown>)?.wwexEnvironment as "sandbox" | "production") ?? "sandbox",
      wwexSandboxTokenUrl: (s as Record<string, unknown>)?.wwexSandboxTokenUrl as string ?? "",
      wwexSandboxRateUrl: (s as Record<string, unknown>)?.wwexSandboxRateUrl as string ?? "",
      wwexProductionTokenUrl: (s as Record<string, unknown>)?.wwexProductionTokenUrl as string ?? "",
      wwexProductionRateUrl: (s as Record<string, unknown>)?.wwexProductionRateUrl as string ?? "",
      kitchenFreightFloor: toDollars(s?.kitchenFreightFloorCents ?? 80000),
      kitchenMinCabinets: String(s?.kitchenMinCabinets ?? 6),
      standardPalletLengthIn: String(s?.standardPalletLengthIn ?? "48"),
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
    setFormInitialized(true);
  }, [data, formInitialized]);

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
  const saveWwexCredentials = trpc.freight.saveWwexCredentials.useMutation({
    onSuccess: (result) => {
      setHasWwexClientSecret(result.hasWwexClientSecret);
      setForm((current) => current ? { ...current, wwexClientId: result.wwexClientId, wwexClientSecret: "" } : current);
      utils.freight.adminGet.invalidate();
      toast.success("WWEX Client ID and Client Secret saved.");
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
      // Broker credentials — only sent when non-empty (server keeps existing if omitted)
      fqClientId: form.fqClientId || undefined,
      fqClientSecret: form.fqClientSecret || undefined,
      fqAccountNumber: form.fqAccountNumber || undefined,
      fqEnvironment: form.fqEnvironment,
      gtzApiKey: form.gtzApiKey || undefined,
      gtzUsername: form.gtzUsername || undefined,
      gtzPassword: form.gtzPassword || undefined,
      gtzAccountNumber: form.gtzAccountNumber || undefined,
      gtzEnvironment: form.gtzEnvironment,
      wwexAccountNumber: form.wwexAccountNumber || undefined,
      wwexUsername: form.wwexUsername || undefined,
      wwexPassword: form.wwexPassword || undefined,
      wwexEnvironment: form.wwexEnvironment,
      wwexSandboxTokenUrl: form.wwexSandboxTokenUrl.trim() || null,
      wwexSandboxRateUrl: form.wwexSandboxRateUrl.trim() || null,
      wwexProductionTokenUrl: form.wwexProductionTokenUrl.trim() || null,
      wwexProductionRateUrl: form.wwexProductionRateUrl.trim() || null,
      liveApiKey: apiKeyInput.trim().length > 0 ? apiKeyInput.trim() : undefined,
      kitchenFreightFloorCents: toCents(form.kitchenFreightFloor),
      kitchenMinCabinets: Math.round(numOr(form.kitchenMinCabinets, 6)),
      standardPalletLengthIn: numOr(form.standardPalletLengthIn, 48),
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
        zipPrefixes: serializeZipPrefixes(parseZipPrefixes(z.zipPrefixes)),
        rateCents: toCents(z.rateDollars),
      }))
      .filter((z) => z.zoneName && z.zipPrefixes);
    saveZones.mutate({ zones: cleaned });
  }

  function updateZone(index: number, patch: Partial<ZoneRow>) {
    setZones((current) => current.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, ...patch } : zone)));
  }

  function addZipToZone(index: number) {
    const rawDraft = zipDrafts[index] ?? "";
    const zip = normalizeZipPrefix(rawDraft);
    if (!isValidZipPrefix(zip)) {
      toast.error("Enter a ZIP code or ZIP prefix using 1 to 5 digits.");
      return;
    }
    const currentZips = parseZipPrefixes(zones[index]?.zipPrefixes ?? "");
    if (currentZips.includes(zip)) {
      toast.error(`${zip} is already in this zone.`);
      return;
    }
    updateZone(index, { zipPrefixes: serializeZipPrefixes([...currentZips, zip]) });
    setZipDrafts((current) => ({ ...current, [index]: "" }));
  }

  function removeZipFromZone(index: number, zip: string) {
    updateZone(index, { zipPrefixes: serializeZipPrefixes(parseZipPrefixes(zones[index]?.zipPrefixes ?? "").filter((currentZip) => currentZip !== zip)) });
  }

  function handleSaveWwexCredentials() {
    if (!form) return;
    const wwexClientId = form.wwexClientId.trim();
    const wwexClientSecret = form.wwexClientSecret.trim();
    if (!wwexClientId || !wwexClientSecret) {
      toast.error("Enter both the WWEX Client ID and Client Secret before saving.");
      return;
    }
    saveWwexCredentials.mutate({ wwexClientId, wwexClientSecret });
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
                onValueChange={(v) => set({ liveProvider: v as SettingsForm["liveProvider"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easypost">EasyPost (LTL freight)</SelectItem>
                  <SelectItem value="freightquote">Freightquote by C.H. Robinson</SelectItem>
                  <SelectItem value="globaltranz">GlobalTranz</SelectItem>
                  <SelectItem value="worldwideexpress">Worldwide Express (WWEX)</SelectItem>
                  <SelectItem value="shippo">Shippo</SelectItem>
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

          {/* ── Freightquote (C.H. Robinson) credentials ─────────────────── */}
          {liveMode && form.liveProvider === "freightquote" && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Freightquote by C.H. Robinson — OAuth2 Credentials</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client ID</Label>
                  <Input value={form.fqClientId} onChange={(e) => set({ fqClientId: e.target.value })} placeholder="Client ID from Navisphere portal" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Secret</Label>
                  <Input type="password" value={form.fqClientSecret} onChange={(e) => set({ fqClientSecret: e.target.value })} placeholder="•••••••• (leave blank to keep current)" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number</Label>
                  <Input value={form.fqAccountNumber} onChange={(e) => set({ fqAccountNumber: e.target.value })} placeholder="C.H. Robinson account number" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Environment</Label>
                  <Select value={form.fqEnvironment} onValueChange={(v) => set({ fqEnvironment: v as "sandbox" | "production" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                      <SelectItem value="production">Production (live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Get credentials at <a href="https://developer.chrobinson.com" target="_blank" rel="noopener noreferrer" className="underline">developer.chrobinson.com</a>. Requires an active C.H. Robinson shipper account.</p>
            </div>
          )}

          {/* ── GlobalTranz credentials ───────────────────────────────────── */}
          {liveMode && form.liveProvider === "globaltranz" && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GlobalTranz — API Key + Basic Auth</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">API / Security Key</Label>
                  <Input type="password" value={form.gtzApiKey} onChange={(e) => set({ gtzApiKey: e.target.value })} placeholder="•••••••• (leave blank to keep current)" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number</Label>
                  <Input value={form.gtzAccountNumber} onChange={(e) => set({ gtzAccountNumber: e.target.value })} placeholder="GTZconnect customer ID" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Username</Label>
                  <Input value={form.gtzUsername} onChange={(e) => set({ gtzUsername: e.target.value })} placeholder="GTZconnect username" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <Input type="password" value={form.gtzPassword} onChange={(e) => set({ gtzPassword: e.target.value })} placeholder="•••••••• (leave blank to keep current)" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Environment</Label>
                  <Select value={form.gtzEnvironment} onValueChange={(v) => set({ gtzEnvironment: v as "sandbox" | "production" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                      <SelectItem value="production">Production (live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Contact GlobalTranz at <a href="mailto:apisupport@globaltranz.com" className="underline">apisupport@globaltranz.com</a> to obtain API credentials.</p>
            </div>
          )}

          {/* ── Worldwide Express credentials ─────────────────────────────── */}
          {liveMode && form.liveProvider === "worldwideexpress" && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worldwide Express (WWEX) — OAuth2 Credentials</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client ID</Label>
                  <Input name="wwex-client-id" value={form.wwexClientId} onChange={(e) => set({ wwexClientId: e.target.value })} placeholder="WWEX Client ID" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Secret</Label>
                  <Input name="wwex-client-secret" type="password" value={form.wwexClientSecret} onChange={(e) => set({ wwexClientSecret: e.target.value })} placeholder="Enter a replacement secret" autoComplete="new-password" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number</Label>
                  <Input value={form.wwexAccountNumber} onChange={(e) => set({ wwexAccountNumber: e.target.value })} placeholder="WWEX account number" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Username (legacy)</Label>
                  <Input value={form.wwexUsername} onChange={(e) => set({ wwexUsername: e.target.value })} placeholder="SpeedShip username (optional)" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password (legacy)</Label>
                  <Input type="password" value={form.wwexPassword} onChange={(e) => set({ wwexPassword: e.target.value })} placeholder="•••••••• (leave blank to keep current)" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Environment</Label>
                  <Select value={form.wwexEnvironment} onValueChange={(v) => set({ wwexEnvironment: v as "sandbox" | "production" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                      <SelectItem value="production">Production (live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">
                    {form.wwexEnvironment === "sandbox" ? "Sandbox" : "Production"} OAuth token URL
                  </Label>
                  <Input
                    inputMode="url"
                    value={form.wwexEnvironment === "sandbox" ? form.wwexSandboxTokenUrl : form.wwexProductionTokenUrl}
                    onChange={(e) => set(form.wwexEnvironment === "sandbox"
                      ? { wwexSandboxTokenUrl: e.target.value }
                      : { wwexProductionTokenUrl: e.target.value })}
                    placeholder="Verified HTTPS token URL from your WWEX representative"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">
                    {form.wwexEnvironment === "sandbox" ? "Sandbox" : "Production"} rate URL
                  </Label>
                  <Input
                    inputMode="url"
                    value={form.wwexEnvironment === "sandbox" ? form.wwexSandboxRateUrl : form.wwexProductionRateUrl}
                    onChange={(e) => set(form.wwexEnvironment === "sandbox"
                      ? { wwexSandboxRateUrl: e.target.value }
                      : { wwexProductionRateUrl: e.target.value })}
                    placeholder="Verified HTTPS rate URL from your WWEX representative"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {hasWwexClientSecret
                    ? "A WWEX Client Secret is on file. Enter a replacement above, then save both client credentials together."
                    : "Enter both client credentials, then save them here before moving on."}
                  {" "}After saving, the secret field clears by design; it does not restore or display a prior secret.
                </p>
                <Button type="button" size="sm" className="shrink-0" onClick={handleSaveWwexCredentials} disabled={saveWwexCredentials.isPending}>
                  {saveWwexCredentials.isPending ? "Saving…" : "Save WWEX credentials"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Contact your WWEX account representative for the environment-specific token and rate URLs. The app will not send credentials to guessed or non-HTTPS hosts.</p>
            </div>
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
            Cabinets ship flat-pack (RTA) on freight pallets. Live quotes use each order's
            <strong> packaged weight, cube, and longest package dimension</strong>. Trim rides on the same complete-kitchen shipment without creating a separate pallet; the reported pallet length still covers every loaded item.
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
              <Label>Operations freight markup %</Label>
              <Input value={form.markupPct} onChange={(e) => set({ markupPct: e.target.value })} placeholder="15" />
              <p className="text-xs text-muted-foreground">
                Applied after the live Plan A carrier rate or an approved style Plan B fee. Delivery accessorials remain itemized.
              </p>
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
            <Label className="text-sm font-semibold">Pallet definitions</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Standard length (in)</Label>
                <Input value={form.standardPalletLengthIn} onChange={(e) => set({ standardPalletLengthIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Long-item length (in)</Label>
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

      <FreightTestLab />

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
          <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
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
                    <Input value={z.zoneName} onChange={(e) => updateZone(i, { zoneName: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[280px] space-y-2">
                      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
                        {parseZipPrefixes(z.zipPrefixes).length > 0 ? parseZipPrefixes(z.zipPrefixes).map((zip) => (
                          <span key={zip} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                            {zip}
                            <button type="button" className="rounded-full p-0.5 hover:bg-primary/15" onClick={() => removeZipFromZone(i, zip)} aria-label={`Remove ZIP code ${zip}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        )) : <span className="text-xs text-muted-foreground">No ZIP codes added</span>}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={zipDrafts[i] ?? ""}
                          onChange={(e) => setZipDrafts((current) => ({ ...current, [i]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addZipToZone(i); } }}
                          inputMode="numeric"
                          autoComplete="postal-code"
                          maxLength={5}
                          aria-label={`Add ZIP code to ${z.zoneName || "freight zone"}`}
                          placeholder="Add ZIP code"
                        />
                        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => addZipToZone(i)}>
                          <Plus className="mr-1 h-4 w-4" /> Add ZIP
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input value={z.rateDollars} onChange={(e) => updateZone(i, { rateDollars: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      setZones((current) => current.filter((_, zoneIndex) => zoneIndex !== i));
                      setZipDrafts({});
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <p className="text-xs text-muted-foreground">Add one ZIP code at a time. Shorter entries remain supported as leading ZIP prefixes; the most specific matching entry still wins.</p>
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

// ─── API Logs sub-component ───────────────────────────────────────────────────
// Exported separately so it can be used standalone or embedded in ShippingAdmin.
export function FreightApiLogsPanel() {
  const { data: logs, isLoading, refetch } = trpc.freight.adminGetApiLogs.useQuery({ limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Freight API Call Log
          </span>
          <Button variant="outline" size="sm" className="bg-background" onClick={() => refetch()}>Refresh</Button>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Last 50 live carrier API calls. Resets on server restart. Use this to debug rate requests and verify credentials.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (!logs || logs.length === 0) && (
          <p className="text-sm text-muted-foreground">No API calls logged yet. Switch to Live mode and request a freight quote to see entries here.</p>
        )}
        {logs && logs.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Broker</TableHead>
                  <TableHead className="text-xs">Route</TableHead>
                  <TableHead className="text-xs">Weight</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Accessorials</TableHead>
                  <TableHead className="text-xs">Result</TableHead>
                  <TableHead className="text-xs">ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(log.ts).toLocaleTimeString()}</TableCell>
                    <TableCell className="text-xs font-mono">{log.broker}</TableCell>
                    <TableCell className="text-xs font-mono">{log.fromZip} → {log.toZip}</TableCell>
                    <TableCell className="text-xs">{log.totalWeightLbs.toFixed(0)} lbs</TableCell>
                    <TableCell className="text-xs">{log.freightClass}</TableCell>
                    <TableCell className="text-xs">{log.accessorials.join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {log.ok ? (
                        <span className="text-emerald-600 font-medium">${(log.amountCents / 100).toFixed(2)} {log.carrier}</span>
                      ) : (
                        <span className="text-destructive" title={log.error}>✗ {(log.error ?? "error").slice(0, 40)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.durationMs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
