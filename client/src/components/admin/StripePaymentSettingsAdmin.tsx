import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { CreditCard, KeyRound, ShieldCheck, Webhook } from "lucide-react";

function statusLabel(configured: boolean): string {
  return configured ? "Configured" : "Needs setup";
}

function statusClass(configured: boolean): string {
  return configured
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

export default function StripePaymentSettingsAdmin() {
  const { data, isLoading, isError } = trpc.payments.adminGetStripeStatus.useQuery();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Stripe configuration status could not be loaded. No credentials were exposed.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Stripe Payment
              </CardTitle>
              <CardDescription className="mt-1">
                Hosted Stripe Checkout is configured server-side for CabinetDealz orders. This panel
                shows status only; secret keys are never displayed or sent to the browser.
              </CardDescription>
            </div>
            <Badge variant="outline" className={statusClass(data.configured)}>
              {statusLabel(data.configured)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" /> Server secret key
              </div>
              <Badge variant="outline" className={statusClass(data.secretKeyConfigured)}>
                {statusLabel(data.secretKeyConfigured)}
              </Badge>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" /> Publishable key
              </div>
              <Badge variant="outline" className={statusClass(data.publishableKeyConfigured)}>
                {statusLabel(data.publishableKeyConfigured)}
              </Badge>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Webhook className="h-4 w-4" /> Webhook secret
              </div>
              <Badge variant="outline" className={statusClass(data.webhookConfigured)}>
                {statusLabel(data.webhookConfigured)}
              </Badge>
            </div>
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <p className="font-medium">Checkout status</p>
            <p className="mt-1">
              {data.checkoutMode} · {data.environment === "unknown" ? "Environment not identifiable from the configured key prefix" : `${data.environment} environment`}.
            </p>
            <p className="mt-2 text-xs text-sky-900">
              To change credentials, use the secure project Secrets or Payment settings controls. Do
              not paste a Stripe secret key into chat, page copy, or client-side code.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
