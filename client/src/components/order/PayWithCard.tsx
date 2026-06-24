import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { CreditCard, Lock, CheckCircle2, Truck, Loader2 } from "lucide-react";

// Minimal typing for the Accept.js global injected by the gateway script.
type AcceptResponse = {
  messages: { resultCode: string; message: Array<{ code: string; text: string }> };
  opaqueData?: { dataDescriptor: string; dataValue: string };
};
declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        data: {
          authData: { clientKey: string; apiLoginID: string };
          cardData: { cardNumber: string; month: string; year: string; cardCode: string; zip?: string };
        },
        cb: (res: AcceptResponse) => void,
      ) => void;
    };
  }
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PayWithCardProps {
  orderRequestId: number;
  payerName?: string;
  payerEmail?: string;
  /** Optional preset freight (cents) when the team has already attached a quote. */
  presetFreightCents?: number;
  onPaid?: (info: { transactionId: string | null; amountCents: number }) => void;
}

/**
 * Upfront card payment via Authorize.Net Accept.js. The card is tokenized in the
 * browser (raw PAN never reaches our server); we send only the opaque nonce.
 * Payment is gated on a freight amount being attached — the input below captures
 * the freight the team quoted for this order, and the server recomputes the
 * authoritative grand total (cabinets + fees + freight) before charging.
 */
export default function PayWithCard({
  orderRequestId,
  payerName,
  payerEmail,
  presetFreightCents,
  onPaid,
}: PayWithCardProps) {
  const { data: config, isLoading } = trpc.payments.publicConfig.useQuery();
  const [scriptReady, setScriptReady] = useState(false);

  const [freightDollars, setFreightDollars] = useState(
    presetFreightCents ? (presetFreightCents / 100).toFixed(2) : "",
  );
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState<{ transactionId: string | null; amountCents: number; last4: string | null } | null>(null);

  const scriptElRef = useRef<HTMLScriptElement | null>(null);

  // Load the environment-specific Accept.js script once we know the config.
  useEffect(() => {
    if (!config?.enabled || !config.acceptJsUrl) return;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${config.acceptJsUrl}"]`);
    if (existing) {
      setScriptReady(true);
      return;
    }
    const el = document.createElement("script");
    el.src = config.acceptJsUrl;
    el.async = true;
    el.onload = () => setScriptReady(true);
    el.onerror = () => toast.error("Could not load the secure payment library.");
    document.body.appendChild(el);
    scriptElRef.current = el;
    // Intentionally not removing on unmount — the gateway script is safe to keep.
  }, [config]);

  const charge = trpc.payments.charge.useMutation();

  const freightCents = Math.round((parseFloat(freightDollars) || 0) * 100);
  const freightOk = freightCents > 0;

  const handlePay = useCallback(() => {
    if (!config?.enabled) return;
    if (!freightOk) {
      toast.error("Enter the shipping amount quoted for this order before paying.");
      return;
    }
    if (!window.Accept) {
      toast.error("Secure payment library is still loading. Please try again in a moment.");
      return;
    }
    if (!cardNumber || !expMonth || !expYear || !cvc) {
      toast.error("Enter your full card details.");
      return;
    }
    setProcessing(true);
    window.Accept.dispatchData(
      {
        authData: { clientKey: config.clientKey, apiLoginID: config.apiLoginId },
        cardData: {
          cardNumber: cardNumber.replace(/\s+/g, ""),
          month: expMonth.padStart(2, "0"),
          year: expYear.length === 2 ? expYear : expYear.slice(-2),
          cardCode: cvc,
          zip: zip || undefined,
        },
      },
      (res) => {
        if (res.messages.resultCode !== "Ok" || !res.opaqueData) {
          setProcessing(false);
          const msg = res.messages.message?.[0]?.text ?? "Your card could not be verified.";
          toast.error("Card error", { description: msg });
          return;
        }
        charge.mutate(
          {
            orderRequestId,
            opaqueData: {
              dataDescriptor: res.opaqueData.dataDescriptor,
              dataValue: res.opaqueData.dataValue,
            },
            freightCents,
            payer: { name: payerName, email: payerEmail },
          },
          {
            onSuccess: (r) => {
              setProcessing(false);
              setPaid({ transactionId: r.transactionId, amountCents: r.amountCents, last4: r.cardLast4 });
              toast.success("Payment approved", { description: `Charged ${fmt(r.amountCents)}` });
              onPaid?.({ transactionId: r.transactionId, amountCents: r.amountCents });
            },
            onError: (e) => {
              setProcessing(false);
              toast.error("Payment declined", { description: e.message });
            },
          },
        );
      },
    );
  }, [config, freightOk, freightCents, cardNumber, expMonth, expYear, cvc, zip, charge, orderRequestId, payerName, payerEmail, onPaid]);

  if (isLoading) {
    return <div className="flex justify-center py-6"><Spinner /></div>;
  }

  // Payments not configured/enabled — render nothing (team will invoice manually).
  if (!config?.enabled) return null;

  if (paid) {
    return (
      <Card className="border-emerald-200">
        <CardContent className="pt-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <h3 className="font-serif text-xl font-bold mb-1">Payment received</h3>
          <p className="text-muted-foreground">
            We charged {fmt(paid.amountCents)}{paid.last4 ? ` to the card ending ••${paid.last4}` : ""}.
          </p>
          {paid.transactionId && (
            <p className="text-xs text-muted-foreground mt-2">Transaction #{paid.transactionId}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Pay in full
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-emerald-600" />
          Secured by Authorize.Net. Your card details are tokenized in your browser and never touch our servers.
          {config.environment === "sandbox" && (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">SANDBOX</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Freight gate */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
          <Label htmlFor="freight" className="flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> Shipping quoted for this order
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <Input
              id="freight"
              inputMode="decimal"
              value={freightDollars}
              onChange={(e) => setFreightDollars(e.target.value)}
              placeholder="0.00"
              className="max-w-[160px]"
              disabled={Boolean(presetFreightCents)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Freight is quoted live on your order. Payment unlocks once the shipping amount is attached, so your
            total includes shipping (no surprise bills).
          </p>
        </div>

        <fieldset disabled={!freightOk || !scriptReady} className="space-y-4 disabled:opacity-50">
          <div className="space-y-1.5">
            <Label htmlFor="card">Card number</Label>
            <Input id="card" inputMode="numeric" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" autoComplete="cc-number" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="m">Month</Label>
              <Input id="m" inputMode="numeric" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} placeholder="MM" maxLength={2} autoComplete="cc-exp-month" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="y">Year</Label>
              <Input id="y" inputMode="numeric" value={expYear} onChange={(e) => setExpYear(e.target.value)} placeholder="YYYY" maxLength={4} autoComplete="cc-exp-year" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cvc">CVC</Label>
              <Input id="cvc" inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123" maxLength={4} autoComplete="cc-csc" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zip">Billing ZIP</Label>
            <Input id="zip" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" className="max-w-[160px]" autoComplete="postal-code" />
          </div>
        </fieldset>

        <Button onClick={handlePay} disabled={processing || !freightOk || !scriptReady} className="w-full gap-2 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90">
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {processing ? "Processing…" : freightOk ? "Pay now" : "Enter shipping to continue"}
        </Button>
        {!scriptReady && <p className="text-center text-xs text-muted-foreground">Loading secure payment form…</p>}
      </CardContent>
    </Card>
  );
}
