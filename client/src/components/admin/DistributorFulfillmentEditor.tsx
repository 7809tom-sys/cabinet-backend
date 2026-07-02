import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Truck, Mail, MapPin } from "lucide-react";

type FulfillmentMode = "email" | "netsuite_email" | "netsuite_api";

const MODE_HELP: Record<FulfillmentMode, string> = {
  email: "Email a purchase order (PDF-style text) plus a NetSuite-ready CSV to the distributor.",
  netsuite_email:
    "Same email delivery, framed as a NetSuite import — the attached CSV maps to a NetSuite Sales Order import.",
  netsuite_api:
    "Direct NetSuite API push (opt-in, coming soon). Until credentials are provided, we email the NetSuite CSV as a fallback.",
};

/**
 * Admin editor for a supply line's ORDER ROUTING + PICKUP settings:
 *  - orderEmail / ccEmails: where confirmed POs are sent (Send to Distributor)
 *  - fulfillmentMode: email vs netsuite_email vs netsuite_api (stub)
 *  - pickup: enabled, ZIP, address, radius (miles) — offered when the delivery
 *    ZIP is within the radius of the pickup/warehouse ZIP.
 */
export default function DistributorFulfillmentEditor() {
  const utils = trpc.useUtils();
  const { data: dists, isLoading } = trpc.distributorAdmin.adminList.useQuery();

  const [selectedId, setSelectedId] = useState<string>("");
  const [orderEmail, setOrderEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [mode, setMode] = useState<FulfillmentMode>("email");
  const [netsuiteAccountId, setNetsuiteAccountId] = useState("");
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupZip, setPickupZip] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupRadiusMiles, setPickupRadiusMiles] = useState("100");

  const selected = useMemo(
    () => dists?.find((d) => String(d.id) === selectedId),
    [dists, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setOrderEmail(selected.orderEmail ?? "");
    setCcEmails(selected.ccEmails ?? "");
    setMode(((selected.fulfillmentMode as FulfillmentMode) ?? "email") || "email");
    setNetsuiteAccountId(selected.netsuiteAccountId ?? "");
    setPickupEnabled(Boolean(selected.pickupEnabled));
    setPickupZip(selected.pickupZip ?? "");
    setPickupAddress(selected.pickupAddress ?? "");
    setPickupRadiusMiles(String(selected.pickupRadiusMiles ?? 100));
  }, [selected]);

  const save = trpc.distributorAdmin.updateFulfillment.useMutation({
    onSuccess: () => {
      toast.success("Fulfillment settings saved.");
      utils.distributorAdmin.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message || "Could not save settings"),
  });

  const radiusNum = Number(pickupRadiusMiles);
  const radiusValid = Number.isFinite(radiusNum) && radiusNum >= 1 && radiusNum <= 1000;
  const canSave = Boolean(selectedId) && !save.isPending && (!pickupEnabled || radiusValid);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" /> Distributor fulfillment & pickup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Set where confirmed orders are emailed for each supply line, whether a
          NetSuite-ready CSV is used, and whether local pickup is offered near
          the warehouse.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Loading lines…
          </div>
        ) : (
          <>
            <div className="space-y-1.5 max-w-sm">
              <Label>Cabinet line</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a line…" />
                </SelectTrigger>
                <SelectContent>
                  {dists?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.code} — {d.brandName || d.name}
                      {d.orderEmail ? "" : "  (no order email)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedId && (
              <>
                {/* Order routing */}
                <div className="rounded-lg border p-4 space-y-4">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Order routing
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Order-intake email</Label>
                      <Input
                        type="email"
                        value={orderEmail}
                        onChange={(e) => setOrderEmail(e.target.value)}
                        placeholder="orders@distributor.com"
                        maxLength={320}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CC emails (comma-separated)</Label>
                      <Input
                        value={ccEmails}
                        onChange={(e) => setCcEmails(e.target.value)}
                        placeholder="affiliate@x.com, sales@y.com"
                        maxLength={1024}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Delivery method</Label>
                      <Select value={mode} onValueChange={(v) => setMode(v as FulfillmentMode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email (PO + CSV)</SelectItem>
                          <SelectItem value="netsuite_email">NetSuite CSV import (email)</SelectItem>
                          <SelectItem value="netsuite_api">NetSuite API (opt-in, coming soon)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{MODE_HELP[mode]}</p>
                    </div>
                    {(mode === "netsuite_email" || mode === "netsuite_api") && (
                      <div className="space-y-1.5">
                        <Label>NetSuite account ID (optional)</Label>
                        <Input
                          value={netsuiteAccountId}
                          onChange={(e) => setNetsuiteAccountId(e.target.value)}
                          placeholder="e.g. 1234567"
                          maxLength={64}
                        />
                        {mode === "netsuite_api" && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Direct API push is not active yet — orders still send by email with the CSV attached.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pickup */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Local pickup
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {pickupEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch checked={pickupEnabled} onCheckedChange={setPickupEnabled} />
                    </div>
                  </div>
                  {pickupEnabled && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Pickup ZIP</Label>
                        <Input
                          value={pickupZip}
                          onChange={(e) => setPickupZip(e.target.value)}
                          placeholder="Defaults to warehouse ZIP"
                          maxLength={16}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Pickup address</Label>
                        <Input
                          value={pickupAddress}
                          onChange={(e) => setPickupAddress(e.target.value)}
                          placeholder="123 Warehouse Rd, City, ST"
                          maxLength={512}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Radius (miles)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          value={pickupRadiusMiles}
                          onChange={(e) => setPickupRadiusMiles(e.target.value)}
                        />
                        {!radiusValid && (
                          <p className="text-xs text-destructive">Enter 1–1000 miles.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    disabled={!canSave}
                    onClick={() =>
                      save.mutate({
                        distributorId: Number(selectedId),
                        orderEmail: orderEmail.trim(),
                        ccEmails: ccEmails.trim(),
                        fulfillmentMode: mode,
                        netsuiteAccountId: netsuiteAccountId.trim(),
                        pickupEnabled,
                        pickupZip: pickupZip.trim(),
                        pickupAddress: pickupAddress.trim(),
                        pickupRadiusMiles: radiusValid ? radiusNum : 100,
                      })
                    }
                  >
                    {save.isPending && <Spinner className="mr-2 h-4 w-4" />}
                    Save settings
                  </Button>
                  {selected && !selected.orderEmail && !orderEmail.trim() && (
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                      No order email — Send to Distributor will be blocked
                    </Badge>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
