import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { readReferralCode, setReferralCode as persistReferralCode } from "@/hooks/useReferral";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  CheckCircle2, AlertTriangle, Trash2, Plus, Minus, Search, Loader2, Pencil, Lock,
} from "lucide-react";
import { CabinetImage } from "@/components/CabinetImage";

// A single working line in the review table. Derived from the matcher output
// but locally editable (qty, swap an unmatched code, remove).
export type ReviewLine = {
  rawCode: string;
  normalized: string;
  qty: number;
  cabinetId: number | null;
  masterCode: string | null;
  description: string | null;
  matched: boolean;
  confidence: "exact" | "normalized" | "fuzzy" | "none";
  // Split-pantry auto-pairing: when set, this line is the TOP auto-added for the
  // split-pantry BOTTOM at the given cabinetId. Used to keep the pair in sync.
  pantryTopFor?: number | null;
  pantryTotalHeight?: 84 | 90 | 96 | null;
};

type StyleOption = {
  styleId: number;
  name: string;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  coversAll: boolean;
  coverage: number;
};

type Tier = "Wholesale" | "Contractor";

interface Props {
  lines: ReviewLine[];
  source: "ocr" | "csv" | "design" | "manual";
  onLinesChange: (next: ReviewLine[]) => void;
  onReset: () => void;
}

// Extract the dimension digits from a raw code so the Fix picker can pre-search
// by size. "W2496" -> "2496", "WP-24-96" -> "2496", "W 24 96" -> "2496".
// Falls back to the raw code itself when no usable digit run is present.
function dimensionSeed(rawCode?: string | null): string {
  const raw = (rawCode || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  // 3+ digits almost always encodes a dimension (e.g. 2496, 3042, 2742).
  return digits.length >= 3 ? digits : raw;
}

// ─── Inline cabinet search for fixing an unmatched line ─────────────────────────
function CabinetSearchPicker({
  onPick,
  initialTerm = "",
}: {
  onPick: (c: { id: number; masterCode: string; description: string }) => void;
  initialTerm?: string;
}) {
  const [term, setTerm] = useState(initialTerm);
  const [debounced, setDebounced] = useState(initialTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isLoading } = trpc.cabinets.list.useQuery(
    { search: debounced || undefined, limit: 50, offset: 0 },
    { enabled: debounced.length >= 1 }
  );
  const items = data?.items ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search by code or description…"
          className="pl-8 h-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {isLoading && debounced ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
        </div>
      ) : items.length > 0 ? (
        <div className="relative z-20 max-h-72 overflow-auto rounded-md border border-border divide-y divide-border bg-popover">
          {items.length >= 2 && (
            <p className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/50 sticky top-0">
              {items.length} matches — pick the exact cabinet (e.g. pantry vs. decorative panel)
            </p>
          )}
          {items.map((c) => {
            const cab = c as { id: number; masterCode: string; description?: string | null };
            return (
              <button
                key={cab.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick({
                    id: cab.id,
                    masterCode: cab.masterCode,
                    description: cab.description ?? cab.masterCode,
                  });
                }}
                className="relative z-10 block w-full text-left px-3 py-2 hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="font-mono text-sm font-semibold">{cab.masterCode}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {cab.description ?? "—"}
                </span>
              </button>
            );
          })}
        </div>
      ) : debounced ? (
        <p className="text-sm text-muted-foreground py-2">No cabinets found for "{debounced}".</p>
      ) : (
        <p className="text-sm text-muted-foreground py-2">Type to search the catalog.</p>
      )}
    </div>
  );
}

function confidenceBadge(line: ReviewLine) {
  if (!line.matched) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-400/60 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
        <AlertTriangle className="h-3 w-3" /> Needs review
      </Badge>
    );
  }
  if (line.confidence === "exact" || line.confidence === "normalized") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400/60 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
        <CheckCircle2 className="h-3 w-3" /> Matched
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-blue-400/60 text-blue-600 bg-blue-50 dark:bg-blue-950/30">
      <CheckCircle2 className="h-3 w-3" /> Best guess
    </Badge>
  );
}

export function OrderReview({ lines, source, onLinesChange, onReset }: Props) {
  const { user, isAuthenticated } = useAuth();
  const [tier, setTier] = useState<Tier>("Contractor");
  const [styleId, setStyleId] = useState<number | null>(null);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);

  // Contact + submit state
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  // Referral attribution captured from a storefront visit or ?ref= link.
  const [referralCode, setReferralCode] = useState<string | null>(() => readReferralCode());
  const referralInfo = trpc.affiliates.byCode.useQuery(
    { code: referralCode ?? "" },
    { enabled: !!referralCode, retry: false }
  );
  // Manual referral-code entry (shown only when no code was auto-captured).
  const [refInput, setRefInput] = useState("");
  const refLookup = trpc.affiliates.byCode.useQuery(
    { code: refInput.trim() },
    { enabled: refInput.trim().length >= 3, retry: false }
  );
  function applyManualReferral() {
    const code = refInput.trim();
    if (!code || !refLookup.data) return;
    persistReferralCode(code);
    setReferralCode(code);
    setRefInput("");
    toast.success(`Referral applied · ${refLookup.data.storeName}`);
  }

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    if (user?.name && !name) setName(user.name);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedCabinetIds = useMemo(
    () => lines.filter((l) => l.matched && l.cabinetId != null).map((l) => l.cabinetId as number),
    [lines]
  );

  // ─── Touch-up kit checkout suggestion ─────────────────────────────────
  // We always suggest a touch-up kit at checkout (it's an Accessory). The prompt
  // appears once the order has at least one matched cabinet and the kit isn't
  // already a line; "Add" inserts it as a normal review line so it prices,
  // totals, and submits like any other item.
  const touchUpKitQuery = trpc.orders.touchUpKit.useQuery(undefined, { retry: false });
  const touchUpKit = touchUpKitQuery.data ?? null;
  const hasTouchUpKit = useMemo(
    () =>
      touchUpKit != null &&
      lines.some((l) => l.cabinetId === touchUpKit.id || (l.masterCode ?? "").toUpperCase() === "TUK"),
    [lines, touchUpKit]
  );
  const hasMatchedCabinet = matchedCabinetIds.length > 0;
  function addTouchUpKit() {
    if (!touchUpKit || hasTouchUpKit) return;
    const kitLine: ReviewLine = {
      rawCode: touchUpKit.masterCode,
      normalized: touchUpKit.masterCode,
      qty: 1,
      cabinetId: touchUpKit.id,
      masterCode: touchUpKit.masterCode,
      description: touchUpKit.description,
      matched: true,
      confidence: "exact",
    };
    onLinesChange([...lines, kitLine]);
    toast.success("Touch-up kit added to your order.");
  }
  const stableCabinetIds = useMemo(
    () => Array.from(new Set(matchedCabinetIds)).sort((a, b) => a - b),
    [matchedCabinetIds]
  );

  // Add (or bump the qty of) a recommended accessory as a normal review line so
  // it prices, totals, and submits like any other item.
  function addRecommended(rec: { id: number; masterCode: string; description: string }) {
    const existingIdx = lines.findIndex((l) => l.cabinetId === rec.id);
    if (existingIdx !== -1) {
      onLinesChange(
        lines.map((l, i) => (i === existingIdx ? { ...l, qty: l.qty + 1 } : l))
      );
      toast.success(`Added another ${rec.masterCode} (qty ${lines[existingIdx].qty + 1}).`);
      return;
    }
    const recLine: ReviewLine = {
      rawCode: rec.masterCode,
      normalized: rec.masterCode,
      qty: 1,
      cabinetId: rec.id,
      masterCode: rec.masterCode,
      description: rec.description,
      matched: true,
      confidence: "exact",
    };
    onLinesChange([...lines, recLine]);
    toast.success(`${rec.masterCode} added to your order.`);
  }

  // Door styles that can fulfill the matched cabinets.
  const stylesQuery = trpc.orders.stylesForCabinets.useQuery(
    { cabinetIds: stableCabinetIds },
    { enabled: stableCabinetIds.length > 0, retry: false }
  );
  const styleOptions = (stylesQuery.data ?? []) as StyleOption[];

  // Auto-select the first style that covers everything once styles load.
  useEffect(() => {
    if (styleId == null && styleOptions.length > 0) {
      const best = styleOptions.find((s) => s.coversAll) ?? styleOptions[0];
      setStyleId(best.styleId);
    }
  }, [styleOptions, styleId]);

  const selectedStyle = styleOptions.find((s) => s.styleId === styleId) ?? null;

  // ─── Checkout recommendations (style-scoped accessories) ──────────────────
  // Cart-aware accessory suggestions for the chosen door style. Items already on
  // the order are excluded server-side so we never duplicate-suggest.
  const recommendQuery = trpc.orders.recommendAddOns.useQuery(
    { styleId: styleId ?? 0, cabinetIds: stableCabinetIds, tier },
    { enabled: styleId != null && stableCabinetIds.length > 0, retry: false }
  );
  const recommendGroups = useMemo(() => {
    const d = recommendQuery.data;
    if (!d) return [] as { key: string; label: string; blurb: string; items: NonNullable<typeof recommendQuery.data>["molding"] }[];
    return [
      { key: "touchUpKit", label: "Touch-up kit", blurb: "Finish-matched kit for nicks & scratches during install.", items: d.touchUpKit },
      { key: "molding", label: "Crown & trim molding", blurb: "Finish wall & tall cabinets to the ceiling line.", items: d.molding },
      { key: "endPanels", label: "Decorative end panels", blurb: "Cover exposed cabinet sides in the matching finish.", items: d.endPanels },
      { key: "fillers", label: "Fillers & scribes", blurb: "Close gaps at walls and between cabinets.", items: d.fillers },
      { key: "rollOutTrays", label: "Roll-out shelves", blurb: "Add pull-out shelves inside base cabinets.", items: d.rollOutTrays },
    ].filter((g) => g.items.length > 0);
  }, [recommendQuery.data]);

  // ─── Split-pantry auto-pairing ────────────────────────────────────────────
  // Faircrest split pantries are two pieces: a 54" bottom (UCBxx54) + a matching
  // same-width top (Wxx..24). When a bottom is in the order, auto-add its top in
  // the SAME door style. Removing the bottom removes its auto-added top.
  const bottomsQuery = trpc.pantry.listBottoms.useQuery(undefined, { retry: false });
  const bottomIdSet = useMemo(
    () => new Set((bottomsQuery.data ?? []).map((b) => b.cabinetId)),
    [bottomsQuery.data]
  );
  const reconciling = useRef(false);
  useEffect(() => {
    if (reconciling.current) return;
    if (styleId == null) return;
    if (bottomIdSet.size === 0) return;

    // Bottom lines currently in the order (matched split-pantry bottoms).
    const bottomLines = lines.filter(
      (l) => l.matched && l.cabinetId != null && bottomIdSet.has(l.cabinetId)
    );
    const bottomIds = new Set(bottomLines.map((l) => l.cabinetId as number));

    // Remove orphaned auto-tops whose bottom is gone.
    const orphanIdx = lines.findIndex(
      (l) => l.pantryTopFor != null && !bottomIds.has(l.pantryTopFor)
    );
    if (orphanIdx !== -1) {
      onLinesChange(lines.filter((_, i) => i !== orphanIdx));
      return;
    }

    // Find a bottom that still needs its top added.
    const needs = bottomLines.find(
      (b) => !lines.some((l) => l.pantryTopFor === (b.cabinetId as number))
    );
    if (!needs) return;

    reconciling.current = true;
    const totalHeight = (needs.pantryTotalHeight ?? 84) as 84 | 90 | 96;
    utils.pantry.pairForBottom
      .fetch({ bottomCabinetId: needs.cabinetId as number, totalHeight, styleId })
      .then((top) => {
        if (top) {
          const topLine: ReviewLine = {
            rawCode: top.masterCode,
            normalized: top.masterCode,
            qty: needs.qty,
            cabinetId: top.cabinetId,
            masterCode: top.masterCode,
            description: top.description,
            matched: true,
            confidence: "exact",
            pantryTopFor: needs.cabinetId as number,
            pantryTotalHeight: totalHeight,
          };
          // Insert the top right after its bottom for readability.
          const idx = lines.findIndex((l) => l.cabinetId === needs.cabinetId);
          const next = [...lines];
          next.splice(idx + 1, 0, topLine);
          onLinesChange(next);
          toast.success("Split pantry completed", {
            description: `Added the matching ${top.width}" top (${top.masterCode}) to reach ${top.totalHeight}".`,
          });
        }
      })
      .finally(() => {
        reconciling.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, bottomIdSet, styleId]);

  // Live pricing for the matched cabinets under the chosen style + tier.
  const priceQuery = trpc.orders.priceLines.useQuery(
    { cabinetIds: stableCabinetIds, styleId: styleId ?? 0, tier },
    { enabled: stableCabinetIds.length > 0 && styleId != null, retry: false }
  );
  const priceMap = useMemo(() => {
    const m = new Map<number, number | null>();
    (priceQuery.data?.prices ?? []).forEach((p) => m.set(p.cabinetId, p.unitPrice));
    return m;
  }, [priceQuery.data]);
  // Owner-only wholesale-floor cost per cabinet (server returns null for non-admins).
  const costMap = useMemo(() => {
    const m = new Map<number, number | null>();
    (priceQuery.data?.prices ?? []).forEach((p) => m.set(p.cabinetId, p.myCost));
    return m;
  }, [priceQuery.data]);

  const pricedLines = useMemo(() => {
    return lines.map((l) => {
      const unit =
        l.matched && l.cabinetId != null ? priceMap.get(l.cabinetId) ?? null : null;
      const linePrice = unit != null ? Number((unit * l.qty).toFixed(2)) : null;
      const unitCost =
        l.matched && l.cabinetId != null ? costMap.get(l.cabinetId) ?? null : null;
      const lineCost = unitCost != null ? Number((unitCost * l.qty).toFixed(2)) : null;
      return { ...l, unitPrice: unit, linePrice, unitCost, lineCost };
    });
  }, [lines, priceMap, costMap]);

  const total = pricedLines.reduce((sum, l) => sum + (l.linePrice ?? 0), 0);
  // Owner-only roll-up: total cost + gross margin across all priced lines.
  const isOwner = user?.role === "admin";
  const ownerCost = pricedLines.reduce((sum, l) => sum + (l.lineCost ?? 0), 0);
  const ownerHasCost = isOwner && pricedLines.some((l) => l.lineCost != null);
  const ownerMargin = Number((total - ownerCost).toFixed(2));
  const ownerMarginPct = total > 0 ? Math.round((ownerMargin / total) * 1000) / 10 : null;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const matchedCount = lines.filter((l) => l.matched).length;
  const unmatchedCount = lines.length - matchedCount;
  const pricedCount = pricedLines.filter((l) => l.unitPrice != null).length;

  // ─── Line mutations (local) ───────────────────────────────────────────────
  function updateLine(idx: number, patch: Partial<ReviewLine>) {
    onLinesChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    const removed = lines[idx];
    // Removing a split-pantry bottom also removes its auto-added top.
    if (removed?.cabinetId != null) {
      const bid = removed.cabinetId;
      onLinesChange(
        lines.filter((l, i) => i !== idx && l.pantryTopFor !== bid)
      );
      return;
    }
    onLinesChange(lines.filter((_, i) => i !== idx));
  }
  function setQty(idx: number, qty: number) {
    const clamped = Math.max(1, Math.min(999, Math.round(qty || 1)));
    const line = lines[idx];
    // Keep a split-pantry top's qty in lock-step with its bottom.
    if (line?.cabinetId != null) {
      const bid = line.cabinetId;
      onLinesChange(
        lines.map((l, i) =>
          i === idx || l.pantryTopFor === bid ? { ...l, qty: clamped } : l
        )
      );
      return;
    }
    updateLine(idx, { qty: clamped });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  // Persist a manual Fix/swap so the same raw code auto-resolves next time.
  // Fire-and-forget: a failed save never blocks the local swap.
  const saveAlias = trpc.orders.saveAlias.useMutation();
  const createReq = trpc.orders.createRequest.useMutation({
    onSuccess: (res) => {
      setSubmittedId(res.id);
      if (isAuthenticated) utils.orders.myRequests.invalidate();
      toast.success("Order request submitted", {
        description: "Our team will review and send it to the supply line.",
      });
    },
    onError: (e) => toast.error("Could not submit", { description: e.message }),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  function handleSubmit() {
    if (lines.length === 0) {
      toast.error("Add at least one cabinet before submitting.");
      return;
    }
    if (!emailValid) {
      toast.error("Enter a valid email so we can confirm your order.");
      return;
    }
    createReq.mutate({
      originatorName: name || undefined,
      originatorEmail: email,
      originatorPhone: phone || undefined,
      zip: zip || undefined,
      source,
      styleId: selectedStyle?.styleId ?? null,
      styleName: selectedStyle?.name ?? null,
      tier,
      notes: notes || undefined,
      referralCode: referralCode ?? undefined,
      submit: true,
      lineItems: pricedLines.map((l) => ({
        cabinetId: l.cabinetId,
        masterCode: l.masterCode ?? (l.normalized || l.rawCode),
        rawCode: l.rawCode,
        description: l.description ?? l.masterCode ?? l.rawCode,
        qty: l.qty,
        unitPrice: l.unitPrice,
        linePrice: l.linePrice,
        styleId: selectedStyle?.styleId ?? null,
        doorStyle: selectedStyle?.name ?? null,
        tier,
        matched: l.matched,
      })),
    });
  }

  // ─── Confirmation screen ──────────────────────────────────────────────────
  const confirmReq = trpc.orders.confirm.useMutation();
  if (submittedId != null) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="font-serif text-2xl font-bold mb-2">Order request received</h3>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          We've logged your {itemCount}-piece order. Our team reviews every request and routes it to
          the supply line for fulfillment. You'll get a confirmation at{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => {
              confirmReq.mutate(
                { id: submittedId },
                {
                  onSuccess: () => toast.success("Thanks — your order is confirmed."),
                  onError: (e) => toast.error(e.message),
                }
              );
            }}
            disabled={confirmReq.isPending || confirmReq.isSuccess}
            className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
          >
            {confirmReq.isSuccess ? "Confirmed" : confirmReq.isPending ? "Confirming…" : "Confirm this order"}
          </Button>
          <Button variant="outline" onClick={onReset}>
            Start another order
          </Button>
        </div>
      </div>
    );
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Badge variant="secondary" className="gap-1">{lines.length} lines</Badge>
        <Badge variant="secondary" className="gap-1">{itemCount} pieces</Badge>
        <Badge variant="outline" className="gap-1 border-emerald-400/60 text-emerald-600">
          {matchedCount} matched
        </Badge>
        {unmatchedCount > 0 && (
          <Badge variant="outline" className="gap-1 border-amber-400/60 text-amber-600">
            {unmatchedCount} need review
          </Badge>
        )}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={onReset}>Clear & start over</Button>
        </div>
      </div>

      {/* Style + tier controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Door style</Label>
          {stableCabinetIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Match at least one cabinet to pick a style.</p>
          ) : stylesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading styles…
            </div>
          ) : styleOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published styles cover these cabinets yet.</p>
          ) : (
            <Select value={styleId ? String(styleId) : undefined} onValueChange={(v) => setStyleId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Choose a door style" /></SelectTrigger>
              <SelectContent>
                {styleOptions.map((s) => (
                  <SelectItem key={s.styleId} value={String(s.styleId)}>
                    {s.name}
                    {!s.coversAll ? " (partial coverage)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Pricing tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Contractor">Contractor</SelectItem>
              <SelectItem value="Wholesale">Wholesale</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Line item table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[120px]">Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[120px]">Qty</TableHead>
              <TableHead className="w-[100px] text-right">Unit</TableHead>
              <TableHead className="w-[110px] text-right">Line</TableHead>
              <TableHead className="w-[44px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricedLines.map((l, idx) => (
              <TableRow key={`${l.rawCode}-${idx}`} className={!l.matched ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                <TableCell className="font-mono text-sm font-semibold">
                  <div className="flex items-center gap-2.5">
                    {/* Shared cabinet artwork — same CabinetImage used in the catalog,
                        detail page, cart, and Design Tool palette. Falls back to an
                        accurate to-scale drawing when no catalog image is mapped. */}
                    {l.matched && (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                        <CabinetImage
                          cabinet={{ masterCode: l.masterCode ?? l.rawCode, description: l.description }}
                          className="h-full w-auto max-w-full"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      {l.masterCode ?? l.rawCode}
                      {l.matched && l.masterCode && l.rawCode && l.masterCode.toUpperCase() !== l.rawCode.toUpperCase() && (
                        <span className="block text-[10px] font-normal text-muted-foreground">from "{l.rawCode}"</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {l.description ?? <span className="text-muted-foreground italic">Unrecognized code</span>}
                  {l.pantryTopFor != null && (
                    <Badge variant="secondary" className="ml-2 text-[10px] align-middle">
                      Split-pantry top (auto-added)
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {fixingIndex === idx ? null : confidenceBadge(l)}
                  {!l.matched && fixingIndex !== idx && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setFixingIndex(idx)}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Fix
                    </Button>
                  )}
                  {l.matched && fixingIndex !== idx && l.pantryTopFor == null && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-muted-foreground ml-2"
                      onClick={() => setFixingIndex(idx)}
                    >
                      swap
                    </Button>
                  )}
                  {l.pantryTopFor != null && (
                    <span className="block text-[10px] text-muted-foreground">Controlled by its pantry base</span>
                  )}
                  {fixingIndex === idx && (
                    <div className="mt-1">
                      <CabinetSearchPicker
                        initialTerm={dimensionSeed(l.rawCode)}
                        onPick={(c) => {
                          // Remember this manual fix so the raw code resolves
                          // automatically next time (keyed by the raw code as
                          // typed/scanned, not the catalog master code).
                          const rawForAlias = (l.rawCode || "").trim();
                          if (rawForAlias) {
                            saveAlias.mutate({ rawCode: rawForAlias, cabinetId: c.id });
                          }
                          updateLine(idx, {
                            cabinetId: c.id,
                            masterCode: c.masterCode,
                            description: c.description,
                            matched: true,
                            confidence: "normalized",
                            normalized: c.masterCode,
                          });
                          setFixingIndex(null);
                          toast.success("Code fixed & remembered", {
                            description: `"${rawForAlias}" will now match ${c.masterCode} automatically.`,
                          });
                        }}
                      />
                      <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setFixingIndex(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(idx, l.qty - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={l.qty}
                      onChange={(e) => setQty(idx, Number(e.target.value))}
                      className="h-7 w-12 text-center px-1"
                    />
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(idx, l.qty + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {l.unitPrice != null ? `$${l.unitPrice.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {l.linePrice != null ? `$${l.linePrice.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={l.pantryTopFor != null}
                    title={l.pantryTopFor != null ? "Remove the pantry base to remove this top" : "Remove"}
                    onClick={() => removeLine(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Recommended for your order — style-scoped accessory cross-sell, one-click add */}
      {hasMatchedCabinet && selectedStyle && recommendGroups.length > 0 && (
        <div className="rounded-xl border border-[var(--color-gold)]/50 bg-[var(--color-gold)]/[0.06] p-5 space-y-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Recommended for your order</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Finishing touches available in {selectedStyle.name}. One click adds them to your order.
            </p>
          </div>
          {recommendGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{group.label}</p>
                <p className="text-xs text-muted-foreground">{group.blurb}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.slice(0, 6).map((item) => {
                  const onOrderQty = lines.find((l) => l.cabinetId === item.id)?.qty ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={item.description}>
                          <span className="font-semibold">{item.masterCode}</span>
                          <span className="text-muted-foreground"> · {item.description}</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {item.unitPrice != null ? `$${item.unitPrice.toFixed(2)}` : "Price on request"}
                          {onOrderQty > 0 && (
                            <span className="ml-2 text-[var(--color-gold)]">In order × {onOrderQty}</span>
                          )}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90 border-transparent"
                        onClick={() => addRecommended(item)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fallback touch-up kit suggestion when the richer panel can't load yet */}
      {touchUpKit && hasMatchedCabinet && !hasTouchUpKit && recommendGroups.length === 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-dashed border-[var(--color-gold)]/60 bg-[var(--color-gold)]/10 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/20">
            <Plus className="h-4 w-4 text-[var(--color-navy)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Don&apos;t forget a touch-up kit</p>
            <p className="text-xs text-muted-foreground">
              A finish-matched touch-up kit handles nicks &amp; scratches during install — we recommend adding one to every order.
            </p>
          </div>
          <Button
            size="sm"
            onClick={addTouchUpKit}
            className="shrink-0 gap-1.5 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add {touchUpKit.masterCode}
          </Button>
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Estimated total{" "}
            {pricedCount < matchedCount && (
              <span className="text-amber-600">(some lines not yet priced)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedStyle ? `${selectedStyle.name} · ${tier}` : "Select a door style to price"}
          </p>
        </div>
        <p className="font-serif text-2xl font-bold tabular-nums">
          {total > 0 ? `$${total.toFixed(2)}` : "—"}
        </p>
      </div>

      {/* Owner-only cost & margin (never shown to non-admins) */}
      {ownerHasCost && (
        <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-50/60 px-5 py-3 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500">
            <Lock className="h-3 w-3" /> Owner view · not shown to customers
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">My cost</p>
              <p className="font-semibold tabular-nums">${ownerCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gross margin</p>
              <p className="font-semibold tabular-nums">${ownerMargin.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Margin %</p>
              <p className="font-semibold tabular-nums">{ownerMarginPct != null ? `${ownerMarginPct}%` : "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Contact + submit */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-serif text-lg font-semibold">Submit this order</h3>
        <p className="text-sm text-muted-foreground -mt-2">
          We'll review your request and route it to the supply line. All orders are confirmed with the originator before fulfillment.
        </p>
        {referralInfo.data ? (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-gold)] shrink-0" />
            <span className="text-foreground">
              Referred by <span className="font-semibold">{referralInfo.data.storeName}</span>
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="ord-ref">Referral code <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                id="ord-ref"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                placeholder="e.g. FIRSTCLASS"
                className="uppercase"
              />
              <Button
                type="button"
                variant="outline"
                className="bg-card shrink-0"
                disabled={refInput.trim().length < 3 || !refLookup.data}
                onClick={applyManualReferral}
              >
                Apply
              </Button>
            </div>
            {refInput.trim().length >= 3 && !refLookup.isFetching && (
              refLookup.data ? (
                <p className="text-xs text-[var(--color-gold)]">Found: {refLookup.data.storeName}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No store matches that code.</p>
              )
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ord-name">Name</Label>
            <Input id="ord-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ord-email">Email <span className="text-destructive">*</span></Label>
            <Input id="ord-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ord-phone">Phone</Label>
            <Input id="ord-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(optional)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ord-zip">Delivery ZIP</Label>
            <Input id="ord-zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="(optional)" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ord-notes">Notes</Label>
          <Textarea id="ord-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know — finishes, hardware, deadlines…" rows={3} />
        </div>
        {unmatchedCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {unmatchedCount} line{unmatchedCount > 1 ? "s" : ""} couldn't be matched automatically. You can still submit — our team will help identify them — or use "Fix" to map them now.
            </span>
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={createReq.isPending}
          size="lg"
          className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
        >
          {createReq.isPending ? "Submitting…" : `Submit order request${total > 0 ? ` · $${total.toFixed(2)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}

// Re-export Tabs primitives so the page can compose them alongside this component
// without re-importing in multiple places.
export { Tabs, TabsList, TabsTrigger, TabsContent };
