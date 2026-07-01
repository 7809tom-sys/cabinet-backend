import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, ShieldCheck, Send, KeyRound, CheckCircle2, XCircle } from "lucide-react";

interface Form {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  enabled: boolean;
}

export default function EmailSettingsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.emailSettings.getEmailSettings.useQuery();
  const [form, setForm] = useState<Form | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        smtpHost: data.smtpHost ?? "",
        smtpPort: String(data.smtpPort ?? 465),
        smtpUser: data.smtpUser ?? "",
        smtpPass: "", // never prefill password
        smtpFrom: data.smtpFrom ?? "",
        enabled: data.enabled ?? false,
      });
      if (!testEmail && data.smtpUser) setTestEmail(data.smtpUser);
    }
  }, [data]);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = trpc.emailSettings.saveEmailSettings.useMutation({
    onSuccess: () => {
      toast.success("Email settings saved");
      utils.emailSettings.getEmailSettings.invalidate();
    },
    onError: (e) => toast.error("Could not save", { description: e.message }),
  });

  const testConnection = trpc.emailSettings.testEmailConnection.useMutation({
    onMutate: () => setTesting(true),
    onSettled: () => setTesting(false),
    onSuccess: (res) => {
      if (res.ok) toast.success("Test email sent successfully!");
      else toast.error("Test failed", { description: res.error ?? "Unknown error" });
    },
    onError: (e) => toast.error("Test failed", { description: e.message }),
  });

  if (isLoading || !form) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  const hasPassword = data?.hasPassword ?? false;
  const isConfigured = !!(data?.smtpHost && data?.smtpUser && hasPassword);

  function onSave() {
    if (!form) return;
    save.mutate({
      smtpHost: form.smtpHost.trim(),
      smtpPort: parseInt(form.smtpPort, 10) || 465,
      smtpUser: form.smtpUser.trim(),
      smtpFrom: form.smtpFrom.trim() || form.smtpUser.trim(),
      enabled: form.enabled,
      ...(form.smtpPass.trim() ? { smtpPass: form.smtpPass.trim() } : {}),
    });
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Email / SMTP</CardTitle>
            </div>
            <Badge
              className={
                isConfigured && form.enabled
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }
            >
              {isConfigured && form.enabled ? "Active" : isConfigured ? "Configured (disabled)" : "Not configured"}
            </Badge>
          </div>
          <CardDescription>
            Configure your Titan (or any SMTP) email account for outbound mail — order confirmations,
            quote replies, and test emails. Credentials are stored securely in the database; you never
            need to touch environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Enable email sending</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When off, no transactional emails are sent even if credentials are saved.
              </p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>

          {/* SMTP fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>SMTP Host</Label>
              <Input
                placeholder="smtp.titan.email"
                value={form.smtpHost}
                onChange={(e) => set({ smtpHost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>SMTP Port</Label>
              <Input
                type="number"
                placeholder="465"
                value={form.smtpPort}
                onChange={(e) => set({ smtpPort: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">465 = SSL · 587 = TLS/STARTTLS</p>
            </div>
            <div className="space-y-1.5">
              <Label>Username (email address)</Label>
              <Input
                placeholder="sales@cabinetdealz.com"
                value={form.smtpUser}
                onChange={(e) => set({ smtpUser: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Password
                {hasPassword && !form.smtpPass && (
                  <span className="text-xs text-emerald-600 font-normal">(saved — leave blank to keep)</span>
                )}
              </Label>
              <Input
                type="password"
                placeholder={hasPassword ? "••••••••" : "Enter password"}
                value={form.smtpPass}
                onChange={(e) => set({ smtpPass: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>From address (optional)</Label>
              <Input
                placeholder="Cabinet Dealz &lt;sales@cabinetdealz.com&gt;"
                value={form.smtpFrom}
                onChange={(e) => set({ smtpFrom: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Defaults to username if left blank.</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test connection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Test Connection</CardTitle>
          </div>
          <CardDescription>
            Send a test email using the <strong>saved</strong> credentials to verify the connection works.
            Save your settings first before testing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              disabled={!testEmail || testing || !isConfigured}
              onClick={() => testConnection.mutate({ toEmail: testEmail })}
            >
              {testing ? <Spinner className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test Email
            </Button>
          </div>
          {!isConfigured && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />
              Configure and save SMTP credentials above before testing.
            </p>
          )}
          {isConfigured && (
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Credentials are saved. Enter an email address and click Send Test Email.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Titan quick-reference */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <p className="text-sm font-medium mb-2">Titan Email SMTP Quick Reference</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Host</span>
            <span>smtp.titan.email</span>
            <span className="font-medium text-foreground">Port (SSL)</span>
            <span>465</span>
            <span className="font-medium text-foreground">Port (STARTTLS)</span>
            <span>587</span>
            <span className="font-medium text-foreground">Username</span>
            <span>Your full email address (e.g. sales@cabinetdealz.com)</span>
            <span className="font-medium text-foreground">Password</span>
            <span>Your Titan mailbox password</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            These are your Titan Email settings for cabinetdealz.com. Enter the mailbox password for the
            address above, Save, then use Send Test Email to confirm it works. If you use 587, sending uses
            STARTTLS; 465 uses SSL.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
