import { useState } from "react";
import { Check, ImageOff, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Tab = "awaiting" | "attention";

const CHECKS = [
  ["color", "Color"],
  ["grain", "Grain / texture"],
  ["profile", "Profile"],
  ["proportions", "Proportions"],
  ["drawerFront", "Drawer front"],
] as const;

function Photo({ url, label }: { url: string | null | undefined; label: string }) {
  return (
    <figure className="flex flex-col gap-1">
      {url ? (
        <img src={url} alt={label} className="h-48 w-full rounded-md bg-muted object-contain ring-1 ring-border" />
      ) : (
        <div className="flex h-48 w-full items-center justify-center rounded-md bg-muted ring-1 ring-border">
          <ImageOff className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
      <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

type Card = NonNullable<ReturnType<typeof trpc.doorRenderingAudit.autoAudit.awaitingTom.useQuery>["data"]>[number];

function Scores({ card }: { card: Card }) {
  if (!card.attempt) return null;
  return (
    <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="door-model-scores">
      {CHECKS.map(([key, label]) => {
        const score = card.attempt!.scores[key];
        const note = card.attempt!.notes[key];
        return (
          <li key={key}>
            <span className="font-medium">{label}</span> {score ?? "-"}/10
            {note ? <span className="text-muted-foreground"> — {note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AwaitingCard({ card }: { card: Card }) {
  const utils = trpc.useUtils();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => {
    void utils.doorRenderingAudit.autoAudit.awaitingTom.invalidate();
    void utils.doorRenderingAudit.autoAudit.counts.invalidate();
  };
  const approve = trpc.doorRenderingAudit.autoAudit.approve.useMutation({
    onSuccess: () => { toast.success(`${card.styleName} is now live in the Designer`); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.doorRenderingAudit.autoAudit.reject.useMutation({
    onSuccess: () => { toast.success("Sent back for a new model"); setRejecting(false); setReason(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="awaiting-tom-card">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{card.styleName}</h3>
        <Badge variant="secondary">Attempt {card.attempt?.attemptNo ?? card.attemptCount}</Badge>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Photo url={card.doorSampleUrl} label="Source door sample photo" />
        <Photo url={card.attempt?.previews.straight} label="3D render, straight-on" />
        {card.drawerSampleUrl ? <Photo url={card.drawerSampleUrl} label="Source drawer sample photo" /> : null}
        <Photo url={card.attempt?.previews.threeQuarter} label="3D render, 3/4 view" />
        <Photo url={card.attempt?.previews.run} label="3D render, small cabinet run" />
      </div>
      <Scores card={card} />
      {rejecting ? (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this wrong? This goes back to the generator."
            maxLength={512}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={!reason.trim() || reject.isPending}
              onClick={() => reject.mutate({ styleId: card.styleId, reason: reason.trim() })}
            >
              Send back
            </Button>
            <Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button disabled={approve.isPending} onClick={() => approve.mutate({ styleId: card.styleId })}>
            <Check className="mr-1 h-4 w-4" /> Approve
          </Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>
            <X className="mr-1 h-4 w-4" /> Reject
          </Button>
        </div>
      )}
    </section>
  );
}

function AttentionCard({ card }: { card: Card }) {
  const utils = trpc.useUtils();
  const history = trpc.doorRenderingAudit.autoAudit.history.useQuery({ styleId: card.styleId });
  const retry = trpc.doorRenderingAudit.autoAudit.retry.useMutation({
    onSuccess: () => {
      toast.success("Started over");
      void utils.doorRenderingAudit.autoAudit.needsAttention.invalidate();
      void utils.doorRenderingAudit.autoAudit.counts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="space-y-3 rounded-lg border border-amber-500/40 p-4" data-testid="needs-attention-card">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{card.styleName}</h3>
        <Badge variant="outline">Flagged after {card.attemptCount} of {card.maxAttempts} attempts</Badge>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Photo url={card.doorSampleUrl} label="Source door sample photo" />
        <Photo url={card.attempt?.previews.straight} label="Last 3D render" />
      </div>
      <div>
        <p className="text-sm font-medium">Why it is flagged</p>
        <p className="whitespace-pre-line text-sm text-muted-foreground">{card.flaggedReasons || "No reason recorded."}</p>
      </div>
      {history.data?.attempts.length ? (
        <ol className="space-y-1 text-xs text-muted-foreground" data-testid="attempt-history">
          {history.data.attempts.map((a) => (
            <li key={a.id}>
              Attempt {a.attemptNo} ({a.trigger.replace("_", " ")}): {a.passed ? "passed" : "failed"}
              {a.reasons ? ` — ${a.reasons.split("\n")[0]}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <Button variant="outline" disabled={retry.isPending} onClick={() => retry.mutate({ styleId: card.styleId })}>
        <RotateCcw className="mr-1 h-4 w-4" /> Try again
      </Button>
    </section>
  );
}

export default function DoorModelAuditAdmin() {
  const [tab, setTab] = useState<Tab>("awaiting");
  const awaiting = trpc.doorRenderingAudit.autoAudit.awaitingTom.useQuery(undefined, { enabled: tab === "awaiting" });
  const attention = trpc.doorRenderingAudit.autoAudit.needsAttention.useQuery(undefined, { enabled: tab === "attention" });
  const counts = trpc.doorRenderingAudit.autoAudit.counts.useQuery();
  const active = tab === "awaiting" ? awaiting : attention;
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "awaiting", label: "Awaiting Tom", count: counts.data?.awaiting_tom ?? 0 },
    { key: "attention", label: "Needs attention", count: counts.data?.flagged ?? 0 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist">
        {tabs.map((t) => (
          <Button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            variant={tab === t.key ? "default" : "outline"}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({t.count})
          </Button>
        ))}
      </div>
      {active.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !active.data?.length ? (
        <p className="text-sm text-muted-foreground">
          {tab === "awaiting" ? "Nothing waiting for approval." : "Nothing needs attention."}
        </p>
      ) : (
        <div className="space-y-4">
          {active.data.map((card) =>
            tab === "awaiting"
              ? <AwaitingCard key={card.styleId} card={card} />
              : <AttentionCard key={card.styleId} card={card} />,
          )}
        </div>
      )}
    </div>
  );
}
