import { useState } from "react";
import { AlertTriangle, Calculator, PackageCheck, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type SimulationMode = "pallet_preview" | "saved_configuration" | "plan_b";
type SimulationResult = inferRouterOutputs<AppRouter>["freight"]["adminSimulateFreight"];

type SampleLine = {
  key: string;
  cabinetId: number;
  masterCode: string;
  description: string;
  styleId: number;
  styleName: string;
  distributorId: number;
  distributorName: string;
  originZip: string | null;
  planBFeeCents: number | null;
  packageWeightLbs: number | null;
  packageDimensionsIn: { length: number; width: number; height: number } | null;
  qty: number;
};

const money = (cents: number | null | undefined) =>
  cents == null ? "Not configured" : `$${(cents / 100).toFixed(2)}`;

const modeLabel: Record<SimulationMode, string> = {
  pallet_preview: "Pallet preview",
  saved_configuration: "Saved Plan A / automatic fallback",
  plan_b: "Plan B only",
};

export default function FreightTestLab() {
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<SampleLine[]>([]);
  const [destinationZip, setDestinationZip] = useState("30303");
  const [subtotal, setSubtotal] = useState("5000.00");
  const [deliveryType, setDeliveryType] = useState<"business" | "residential">("business");
  const [liftgate, setLiftgate] = useState(false);
  const [insideDelivery, setInsideDelivery] = useState(false);
  const [limitedAccess, setLimitedAccess] = useState(false);
  const [mode, setMode] = useState<SimulationMode>("pallet_preview");
  const [resultsByMode, setResultsByMode] = useState<Partial<Record<SimulationMode, SimulationResult>>>({});

  const normalizedSearch = search.trim();
  const searchQuery = trpc.freight.adminSearchSimulationItems.useQuery(
    { query: normalizedSearch },
    { enabled: normalizedSearch.length >= 2, staleTime: 30_000 },
  );
  const simulate = trpc.freight.adminSimulateFreight.useMutation({
    onSuccess: (result) => {
      setResultsByMode((current) => ({ ...current, [result.mode]: result }));
      toast.success(`${modeLabel[result.mode]} complete. No order or payment was created.`);
    },
    onError: (error) => toast.error(error.message),
  });

  function invalidateResults() {
    setResultsByMode({});
  }

  function addLine(result: NonNullable<typeof searchQuery.data>[number]) {
    const key = `${result.cabinetId}:${result.styleId}:${result.distributorId}`;
    setLines((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) => line.key === key ? { ...line, qty: line.qty + 1 } : line);
      }
      return [...current, {
        key,
        cabinetId: result.cabinetId,
        masterCode: result.masterCode,
        description: result.description,
        styleId: result.styleId,
        styleName: result.styleName,
        distributorId: result.distributorId,
        distributorName: result.distributorName,
        originZip: result.originZip,
        planBFeeCents: result.planBFeeCents,
        packageWeightLbs: result.packageWeightLbs,
        packageDimensionsIn: result.packageDimensionsIn,
        qty: 1,
      }];
    });
    invalidateResults();
    setSearch("");
  }

  function runSimulation() {
    if (lines.length === 0) {
      toast.error("Add at least one real catalog item to the sample order.");
      return;
    }
    if (!/^\d{5}$/.test(destinationZip.trim())) {
      toast.error("Enter a valid 5-digit destination ZIP.");
      return;
    }
    simulate.mutate({
      destinationZip: destinationZip.trim(),
      merchandiseSubtotalCents: Math.max(0, Math.round((Number(subtotal) || 0) * 100)),
      mode,
      accessorials: {
        residential: deliveryType === "residential",
        liftgate,
        insideDelivery,
        limitedAccess,
      },
      items: lines.map((line) => ({
        cabinetId: line.cabinetId,
        masterCode: line.masterCode,
        styleId: line.styleId,
        distributorId: line.distributorId,
        qty: line.qty,
      })),
    });
  }

  const result = resultsByMode[mode];
  const planAResult = resultsByMode.saved_configuration;
  const planBResult = resultsByMode.plan_b;

  return (
    <Card className="border-amber-300/70 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Calculator className="h-5 w-5 text-amber-700" /> Freight Test Lab
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
            Test only
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Build a sample order from real catalog items, inspect each style-origin pallet, and test saved Plan A or Plan B pricing before going live. This tool never creates an order, checkout, signed customer quote, or payment.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3" aria-labelledby="freight-test-items-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="freight-test-items-heading" className="font-semibold">1. Sample order items</h3>
              <p className="text-xs text-muted-foreground">Search by cabinet code, description, distributor SKU, platform SKU, or door style.</p>
            </div>
            <span className="text-sm font-medium">{lines.reduce((sum, line) => sum + line.qty, 0)} unit(s)</span>
          </div>

          <div className="relative max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search real catalog items, for example B24 or W3030"
              className="pl-9"
              aria-label="Search real catalog items for freight simulation"
            />
            {normalizedSearch.length >= 2 && (
              <div className="mt-2 max-h-72 overflow-y-auto border bg-popover text-popover-foreground">
                {searchQuery.isLoading && <p className="p-3 text-sm text-muted-foreground">Searching catalog…</p>}
                {!searchQuery.isLoading && searchQuery.data?.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No active style/SKU combinations match that search.</p>
                )}
                {searchQuery.data?.map((item) => (
                  <button
                    key={`${item.cabinetId}:${item.styleId}:${item.distributorId}`}
                    type="button"
                    onClick={() => addLine(item)}
                    className="flex w-full items-start justify-between gap-4 border-t px-3 py-2 text-left first:border-t-0 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{item.masterCode} · {item.styleName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                      <span className="block text-xs text-muted-foreground">{item.distributorName} · origin {item.originZip ?? "missing"}</span>
                    </span>
                    <Plus className="mt-1 h-4 w-4 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="border border-dashed p-5 text-sm text-muted-foreground">
              No sample items yet. Add real catalog/style combinations above; the lab does not use invented products or weights.
            </div>
          ) : (
            <div className="overflow-x-auto border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabinet / style</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead className="w-28">Qty</TableHead>
                    <TableHead className="w-12"><span className="sr-only">Remove</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell className="min-w-64">
                        <div className="font-medium">{line.masterCode} · {line.styleName}</div>
                        <div className="text-xs text-muted-foreground">{line.distributorName}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{line.originZip ?? <span className="text-destructive">Missing ZIP</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {line.packageDimensionsIn
                          ? `${line.packageDimensionsIn.length} × ${line.packageDimensionsIn.width} × ${line.packageDimensionsIn.height} in`
                          : "Configured fallback cube"}
                        <div className="text-muted-foreground">{line.packageWeightLbs != null ? `${line.packageWeightLbs} lbs` : "Configured fallback weight"}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={999}
                          value={line.qty}
                          onChange={(event) => {
                            const qty = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1)));
                            setLines((current) => current.map((item) => item.key === line.key ? { ...item, qty } : item));
                            invalidateResults();
                          }}
                          aria-label={`Quantity for ${line.masterCode} ${line.styleName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setLines((current) => current.filter((item) => item.key !== line.key));
                            invalidateResults();
                          }}
                          aria-label={`Remove ${line.masterCode} ${line.styleName}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="freight-test-settings-heading">
          <div>
            <h3 id="freight-test-settings-heading" className="font-semibold">2. Destination and test path</h3>
            <p className="text-xs text-muted-foreground">Pallet preview makes no carrier call. Saved setup uses the currently saved estimator or live provider. Plan B uses only style fallback fees.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Destination ZIP</Label>
              <Input value={destinationZip} onChange={(event) => { setDestinationZip(event.target.value); invalidateResults(); }} inputMode="numeric" maxLength={5} />
            </div>
            <div className="space-y-1.5">
              <Label>Sample merchandise subtotal ($)</Label>
              <Input value={subtotal} onChange={(event) => { setSubtotal(event.target.value); invalidateResults(); }} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery type</Label>
              <Select
                value={deliveryType}
                onValueChange={(value) => {
                  const next = value as "business" | "residential";
                  setDeliveryType(next);
                  if (next === "residential") setLiftgate(true);
                  invalidateResults();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="residential">Residential</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Simulation path</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as SimulationMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pallet_preview">Pallet preview only</SelectItem>
                  <SelectItem value="saved_configuration">Saved Plan A / automatic fallback</SelectItem>
                  <SelectItem value="plan_b">Plan B fees only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 border p-3 text-sm">
              <Switch checked={liftgate} onCheckedChange={(checked) => { setLiftgate(checked); invalidateResults(); }} /> Lift gate
            </label>
            <label className="flex items-center gap-2 border p-3 text-sm">
              <Switch checked={insideDelivery} onCheckedChange={(checked) => { setInsideDelivery(checked); invalidateResults(); }} /> Inside delivery
            </label>
            <label className="flex items-center gap-2 border p-3 text-sm">
              <Switch checked={limitedAccess} onCheckedChange={(checked) => { setLimitedAccess(checked); invalidateResults(); }} /> Limited access
            </label>
          </div>
          <Button type="button" onClick={runSimulation} disabled={simulate.isPending || lines.length === 0}>
            {simulate.isPending ? "Running test…" : `Run ${modeLabel[mode]}`}
          </Button>
          {(planAResult || planBResult) && (
            <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2" aria-label="Plan A and Plan B comparison">
              <div className="border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved Plan A / automatic fallback</div>
                <div className="mt-1 text-xl font-semibold">
                  {planAResult?.quote?.available ? money(planAResult.quote.totalCents) : "Not run or unavailable"}
                </div>
                {planAResult?.quote && !planAResult.quote.available && <p className="mt-1 text-xs text-destructive">{planAResult.quote.reason}</p>}
              </div>
              <div className="border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan B only</div>
                <div className="mt-1 text-xl font-semibold">
                  {planBResult?.quote?.available ? money(planBResult.quote.totalCents) : "Not run or unavailable"}
                </div>
                {planBResult?.quote && !planBResult.quote.available && <p className="mt-1 text-xs text-destructive">{planBResult.quote.reason}</p>}
              </div>
            </div>
          )}
        </section>

        {result && (
          <section className="space-y-4 border-t pt-5" aria-labelledby="freight-test-results-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="freight-test-results-heading" className="flex items-center gap-2 font-semibold">
                  <PackageCheck className="h-4 w-4 text-emerald-700" /> Test result
                </h3>
                <p className="text-xs text-muted-foreground">{result.note}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{modeLabel[result.mode]}</div>
                <div>{result.provider} {result.providerEnvironment ? `· ${result.providerEnvironment}` : ""}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="border p-3"><div className="text-xs text-muted-foreground">Units</div><div className="text-xl font-semibold">{result.totalUnits}</div></div>
              <div className="border p-3"><div className="text-xs text-muted-foreground">Origin groups</div><div className="text-xl font-semibold">{result.groups.length}</div></div>
              <div className="border p-3"><div className="text-xs text-muted-foreground">Loaded weight</div><div className="text-xl font-semibold">{result.totalBillableWeightLbs.toFixed(0)} lbs</div></div>
              <div className="border p-3"><div className="text-xs text-muted-foreground">Kitchen floor</div><div className="text-xl font-semibold">{result.isKitchen ? "Eligible" : "No"}</div></div>
            </div>

            <div className="space-y-3">
              {result.groups.map((group) => (
                <div key={group.key} className="border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{group.label}</div>
                      <div className="text-xs text-muted-foreground">Origin {group.originZip} · {group.palletCount} pallet(s) · {group.totalCubicFt.toFixed(2)} cu ft</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold uppercase tracking-wide">{group.source.replace("_", " ")}</div>
                      <div>Plan B: {money(group.planBFeeCents)}</div>
                      {group.baseAmountCents != null && <div>Selected base: {money(group.baseAmountCents)}</div>}
                    </div>
                  </div>
                  {group.liveError && (
                    <div className="mt-3 flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{group.liveError}</span>
                    </div>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pallet</TableHead>
                          <TableHead>Dimensions</TableHead>
                          <TableHead>Loaded weight</TableHead>
                          <TableHead>Contents</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.pallets.map((pallet, index) => (
                          <TableRow key={`${group.key}:pallet:${index}`}>
                            <TableCell>#{index + 1}</TableCell>
                            <TableCell className="whitespace-nowrap">{pallet.lengthIn} × {pallet.widthIn} × {pallet.heightIn} in</TableCell>
                            <TableCell className="whitespace-nowrap font-medium">{pallet.weightLbs} lbs</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{pallet.contentsWeightLbs} lbs · {pallet.contentsCubicFt.toFixed(2)} cu ft</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>

            {result.quote && (
              <div className={`border p-4 ${result.quote.available ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-destructive/40 bg-destructive/5"}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {result.quote.available ? <ShieldCheck className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {result.quote.available ? "Simulated freight total" : "Simulation could not produce a price"}
                </div>
                {!result.quote.available && <p className="mt-2 text-sm text-destructive">{result.quote.reason}</p>}
                {result.quote.available && (
                  <div className="mt-3 space-y-2 text-sm">
                    {result.quote.lines.map((line, index) => (
                      <div key={`${line.label}:${index}`} className="flex justify-between gap-4"><span>{line.label}</span><span>{money(line.amountCents)}</span></div>
                    ))}
                    <div className="flex justify-between gap-4 border-t pt-2"><span>Operations markup</span><span>{money(result.quote.markupCents)}</span></div>
                    {result.quote.damageFeeCents > 0 && <div className="flex justify-between gap-4"><span>Damage coverage</span><span>{money(result.quote.damageFeeCents)}</span></div>}
                    <div className="flex justify-between gap-4 border-t pt-2 text-lg font-semibold"><span>Test total</span><span>{money(result.quote.totalCents)}</span></div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
