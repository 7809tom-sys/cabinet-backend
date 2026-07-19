import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FridgeAbove = "bridge" | "none";
export type FridgePanels = "left" | "right" | "both" | "none";

/** Minimal cabinet shape needed by the dialog. */
export interface SurroundCabinet {
  id: number;
  masterCode: string;
  description: string;
  width: string | null;
  height: string | null;
  depth: string | null;
}

export interface FridgeSurroundChoice {
  above: FridgeAbove;
  /** The specific bridge cabinet chosen by the user (id). Null when above !== "bridge". */
  bridgeCabinetId: number | null;
  /** The chosen bridge height in inches (12, 18, or 24). Null when above !== "bridge". */
  bridgeHeight: number | null;
  /** The chosen bridge depth in inches (12 or 24). Null when above !== "bridge". */
  bridgeDepth: number | null;
  /** The chosen bridge width in inches. Null when above !== "bridge". */
  bridgeWidth: number | null;
  panels: FridgePanels;
  /** The specific end panel chosen by the user (id). Null when panels === "none". */
  endPanelId: number | null;
  /** The chosen end panel depth in inches (24–36). Null when panels === "none". */
  panelDepth: number | null;
  /**
   * The auto-calculated panel height in inches.
   * = 72 (standard fridge height) + bridgeHeight.
   * Null when panels === "none" or above === "none".
   */
  panelHeight: number | null;
  smooth: boolean;
  /** Chosen fridge width in inches (e.g. 30, 33, 36). */
  fridgeWidth: number;
  /** Chosen fridge height in inches (e.g. 66, 70, 72, 78, 84). */
  fridgeHeight: number;
  /** Chosen fridge depth in inches (e.g. 24, 27, 30, 33, 36). */
  fridgeDepth: number;
}

export interface RefrigeratorOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fridge width in inches — used to seed the bridge width. */
  fridgeWidthInches?: number;
  /** All deep 24" refrigerator wall cabinets available for this style. */
  deepAbove?: SurroundCabinet[];
  /** All bridge wall cabinets available for this style (will be filtered to ≤ fridge width). */
  bridgeAbove?: SurroundCabinet[];
  /** All end panels available for this style. */
  endPanels?: SurroundCabinet[];
  /** True when the style has a buyable smooth skin/refrigerator panel. */
  hasSmoothPanel?: boolean;
  /** Apply the chosen surround. */
  onApply: (choice: FridgeSurroundChoice) => void;
  /** Keep just the refrigerator (no surround). */
  onSkip: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRIDGE_WIDTHS = [24, 27, 30, 33, 36, 42];
const FRIDGE_HEIGHTS = [66, 70, 72, 78, 84];
const FRIDGE_DEPTHS = [24, 27, 30, 33, 36];

const BRIDGE_HEIGHT_OPTIONS = [12, 15, 18, 21, 24] as const;
type BridgeHeight = typeof BRIDGE_HEIGHT_OPTIONS[number];

const BRIDGE_DEPTH_OPTIONS = [12, 24] as const;
type BridgeDepth = typeof BRIDGE_DEPTH_OPTIONS[number];

// Bridge cabinet widths — all distributors carry 30", 33", 36" fridge cabinets
const BRIDGE_WIDTH_OPTIONS = [30, 33, 36];

// End panel depth options (inches)
const PANEL_DEPTH_OPTIONS = [24, 26, 28, 30, 32, 34, 36];

// Fridge height used for panel height calculation
const FRIDGE_STANDARD_H = 72;

// ─── Helper: panel height from bridge height ──────────────────────────────────
function calcPanelHeight(bridgeH: BridgeHeight): number {
  return FRIDGE_STANDARD_H + bridgeH;
}

// ─── Small reusable pill selector ────────────────────────────────────────────
function OptionPills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string; disabled?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
              o.disabled && "cursor-not-allowed opacity-40 hover:bg-background hover:text-foreground"
            )}
            aria-pressed={active}
          >
            {o.label}
            {o.sub && <span className="block text-[10px] opacity-70">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Compact dimension button row ────────────────────────────────────────────
function DimSelector({
  label,
  value,
  options,
  onChange,
  unit = '"',
  note,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
              value === o
                ? "border-primary bg-primary text-primary-foreground font-semibold"
                : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {o}{unit}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function RefrigeratorOptionsDialog({
  open,
  onOpenChange,
  fridgeWidthInches,
  deepAbove = [],
  endPanels = [],
  hasSmoothPanel = false,
  onApply,
  onSkip,
}: RefrigeratorOptionsDialogProps) {
  const { t } = useLanguage();

  // ── Fridge size ────────────────────────────────────────────────────────────
  const [fridgeW, setFridgeW] = useState<number>(fridgeWidthInches ?? 36);
  const [fridgeH, setFridgeH] = useState<number>(72);
  const [fridgeD, setFridgeD] = useState<number>(30);

  // ── Over-fridge cabinet ────────────────────────────────────────────────────
  const [above, setAbove] = useState<FridgeAbove>("none");
  const [bridgeHeightChoice, setBridgeHeightChoice] = useState<BridgeHeight>(12);
  const [bridgeDepthChoice, setBridgeDepthChoice] = useState<BridgeDepth>(12);
  // Bridge width is independent of fridge width — always 30/33/36
  const [bridgeWidthChoice, setBridgeWidthChoice] = useState<number>(36);

  // ── End panels ─────────────────────────────────────────────────────────────
  const [panels, setPanels] = useState<FridgePanels>("none");
  const [panelDepth, setPanelDepth] = useState<number>(24);
  const [selectedPanelId, setSelectedPanelId] = useState<string>("");

  // ── Smooth panel ───────────────────────────────────────────────────────────
  const [smooth, setSmooth] = useState(false);

  // ── SKU dimension parser ──────────────────────────────────────────
  // Handles four over-fridge cabinet SKU formats:
  //  1. Clark & Sons 12" deep:     W-WW-HH      e.g. W-36-18   → {w:36,h:18,d:12}
  //  2. Clark & Sons 24" deep:     WRWWHH        e.g. WR3615    → {w:36,h:15,d:24}
  //  3. Skyline/USCD 24" deep:     W[WW][HH]24   e.g. W361524   → {w:36,h:15,d:24}
  //  4. Skyline/Milestone 12" deep: W[WW][HH]    e.g. W3615     → {w:36,h:15,d:12}
  const parseSkuDims = (code: string) => {
    const c = code.replace(/^[^W]*W/, "W");
    // Format 1: Clark & Sons 12" deep  W-WW-HH
    const mDash = c.match(/^W-(\d{2})-(\d{2})$/);
    if (mDash) return { w: parseInt(mDash[1], 10), h: parseInt(mDash[2], 10), d: 12 };
    // Format 2: Clark & Sons 24" deep  WRWWHH
    const mR = c.match(/^WR(\d{2})(\d{2})$/);
    if (mR) return { w: parseInt(mR[1], 10), h: parseInt(mR[2], 10), d: 24 };
    // Format 3: Skyline/USCD 24" deep  W[WW][HH]24 (8 chars, last 2 = depth)
    const m8 = c.match(/^W(\d{2})(\d{2})(\d{2})$/);
    if (m8) return { w: parseInt(m8[1], 10), h: parseInt(m8[2], 10), d: parseInt(m8[3], 10) };
    // Format 4: Skyline/Milestone 12" deep  W[WW][HH] (4 chars)
    const m4 = c.match(/^W(\d{2})(\d{2})$/);
    if (m4) return { w: parseInt(m4[1], 10), h: parseInt(m4[2], 10), d: 12 };
    return null;
  };

  // ── Derived: best-match bridge cabinet ────────────────────────────────────
  const bridgeByDims = useMemo(() => {
    const result: Record<BridgeHeight, Record<BridgeDepth, SurroundCabinet | null>> = {
      12: { 12: null, 24: null },
      15: { 12: null, 24: null },
      18: { 12: null, 24: null },
      21: { 12: null, 24: null },
      24: { 12: null, 24: null },
    };
    for (const targetH of BRIDGE_HEIGHT_OPTIONS) {
      for (const targetD of BRIDGE_DEPTH_OPTIONS) {
        const candidates = deepAbove.filter((c) => {
          const sku = parseSkuDims(c.masterCode);
          const storedW = parseFloat(String(c.width ?? ""));
          const storedH = parseFloat(String(c.height ?? ""));
          const storedD = parseFloat(String(c.depth ?? ""));
          const w = storedW || (sku ? sku.w : 0);
          const h = storedH || (sku ? sku.h : 0);
          const d = storedD || (sku ? sku.d : 0);
          return (
            w <= bridgeWidthChoice + 0.5 &&
            Math.abs(h - targetH) < 1.5 &&
            Math.abs(d - targetD) < 1.5
          );
        });
        if (!candidates.length) continue;
        result[targetH][targetD] = [...candidates].sort((a, b) => {
          const sa = parseSkuDims(a.masterCode);
          const sb = parseSkuDims(b.masterCode);
          const storedWA = parseFloat(String(a.width ?? ""));
          const storedWB = parseFloat(String(b.width ?? ""));
          const wa = storedWA || (sa ? sa.w : 0);
          const wb = storedWB || (sb ? sb.w : 0);
          return Math.abs(wa - bridgeWidthChoice) - Math.abs(wb - bridgeWidthChoice);
        })[0];
      }
    }
    return result;
  }, [deepAbove, bridgeWidthChoice]);

  // Always allow Add Cabinet — if catalog has no exact match we place a generic one.
  const hasBridgeAbove = true;

  const chosenBridge = above === "bridge" ? bridgeByDims[bridgeHeightChoice][bridgeDepthChoice] : null;

  // Auto-calculated panel height: use the actual fridgeH the user selected, not a hardcoded constant.
  const panelHeight = above === "bridge" && panels !== "none"
    ? fridgeH + bridgeHeightChoice
    : null;

  // Best-match end panel
  const bestPanel = useMemo(() => endPanels[0] ?? null, [endPanels]);

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      const w = fridgeWidthInches ?? 36;
      setFridgeW(w);
      setFridgeH(72);
      setFridgeD(30);
      setBridgeHeightChoice(12);
      setBridgeDepthChoice(12);
      setBridgeWidthChoice(36);
      setAbove("none");
      setPanels("none");
      setPanelDepth(24);
      setSelectedPanelId(bestPanel ? String(bestPanel.id) : "");
      setSmooth(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select best panel when panels changes away from none
  useEffect(() => {
    if (panels !== "none" && !selectedPanelId && bestPanel) {
      setSelectedPanelId(String(bestPanel.id));
    }
  }, [panels, selectedPanelId, bestPanel]);

  const handleApply = () => {
    onApply({
      above,
      bridgeCabinetId: chosenBridge ? chosenBridge.id : null,
      bridgeHeight: above === "bridge" ? bridgeHeightChoice : null,
      bridgeDepth: above === "bridge" ? bridgeDepthChoice : null,
      bridgeWidth: above === "bridge" ? bridgeWidthChoice : null,
      panels,
      endPanelId: panels !== "none" && selectedPanelId ? parseInt(selectedPanelId, 10) : null,
      panelDepth: panels !== "none" ? panelDepth : null,
      panelHeight,
      smooth,
      fridgeWidth: fridgeW,
      fridgeHeight: fridgeH,
      fridgeDepth: fridgeD,
    });
  };

  // Always allow apply — missing catalog matches use generic placement.
  const canApply = true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dt_fridge_title")}</DialogTitle>
          <DialogDescription>{t("dt_fridge_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── 1. Refrigerator Size ─────────────────────────────────────── */}
          <Section title="Refrigerator Size">
            <DimSelector
              label="Width"
              value={fridgeW}
              options={FRIDGE_WIDTHS}
              onChange={(w) => {
                setFridgeW(w);
                // Auto-snap bridge cabinet width to the closest available option (30/33/36)
                const snapped = BRIDGE_WIDTH_OPTIONS.reduce((best, opt) =>
                  Math.abs(opt - w) < Math.abs(best - w) ? opt : best,
                  BRIDGE_WIDTH_OPTIONS[0]
                );
                setBridgeWidthChoice(snapped);
              }}
            />
            <DimSelector label="Height" value={fridgeH} options={FRIDGE_HEIGHTS} onChange={setFridgeH} />
            <DimSelector label="Depth" value={fridgeD} options={FRIDGE_DEPTHS} onChange={setFridgeD} />
          </Section>

          {/* ── 2. Over-Fridge Cabinet ───────────────────────────────────── */}
          <Section title="Over-Fridge Cabinet">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Cabinet sits at 72″ above floor (bottom of cabinet = top of fridge space)
              </p>
              <OptionPills<FridgeAbove>
                value={above}
                onChange={(v) => {
                  setAbove(v);
                  // Auto-select first available height+depth so user never opens to an error
                  if (v === "bridge") {
                    for (const h of BRIDGE_HEIGHT_OPTIONS) {
                      for (const d of BRIDGE_DEPTH_OPTIONS) {
                        if (bridgeByDims[h as BridgeHeight][d as BridgeDepth]) {
                          setBridgeHeightChoice(h as BridgeHeight);
                          setBridgeDepthChoice(d as BridgeDepth);
                          return;
                        }
                      }
                    }
                  }
                }}
                options={[
                  {
                    value: "bridge",
                    label: "Add Cabinet",
                    disabled: !hasBridgeAbove,
                  },
                  { value: "none", label: "No Cabinet" },
                ]}
              />
            </div>

            {above === "bridge" && (
              <div className="space-y-3 pt-1">

                {/* Cabinet Width */}
                <DimSelector
                  label="Width"
                  value={bridgeWidthChoice}
                  options={BRIDGE_WIDTH_OPTIONS}
                  onChange={setBridgeWidthChoice}
                />

                {/* Cabinet Height */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Height</span>
                  <div className="flex gap-2">
                    {BRIDGE_HEIGHT_OPTIONS.map((h) => {
                      const active = bridgeHeightChoice === h;
                      const hasAny = BRIDGE_DEPTH_OPTIONS.some((d) => bridgeByDims[h as BridgeHeight][d as BridgeDepth] != null);
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setBridgeHeightChoice(h)}
                          title={!hasAny ? `No ${h}" cabinet available for this style` : undefined}
                          className={cn(
                            "flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : !hasAny
                                ? "border-border bg-background text-muted-foreground/40 line-through"
                                : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                          aria-pressed={active}
                        >
                          {h}"
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cabinet Depth */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Depth</span>
                  <div className="flex gap-2">
                    {([
                      { value: 12 as BridgeDepth, label: '12″ Deep' },
                      { value: 24 as BridgeDepth, label: '24″ Deep' },
                    ]).map((o) => {
                      const active = bridgeDepthChoice === o.value;
                      const hasDepth = bridgeByDims[bridgeHeightChoice][o.value] != null;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setBridgeDepthChoice(o.value)}
                          title={!hasDepth ? `No ${o.value}" deep cabinet available for this height` : undefined}
                          className={cn(
                            "flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : !hasDepth
                                ? "border-border bg-background text-muted-foreground/40 line-through"
                                : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                          aria-pressed={active}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Matched SKU / warning */}
                {chosenBridge ? (
                  <p className="text-[11px] text-muted-foreground">
                    Will use:{" "}
                    <span className="font-medium text-foreground">{chosenBridge.masterCode}</span>
                    {" "}— {bridgeHeightChoice}″ H × {bridgeDepthChoice}″ D × {bridgeWidthChoice}″ W
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600">
                    No {bridgeHeightChoice}″ × {bridgeDepthChoice}″ cabinet available for this style. Try a different combination.
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* ── 3. Fridge End Panels ─────────────────────────────────────── */}
          <Section title="Fridge End Panels">
            <div className="space-y-1.5">
              {above === "bridge" && panels !== "none" && panelHeight && (
                <p className="text-xs text-muted-foreground">
                  Panel height will be <span className="font-semibold text-foreground">{panelHeight}″</span>
                  {" "}(72″ fridge + {bridgeHeightChoice}″ cabinet)
                </p>
              )}
              {above === "none" && panels !== "none" && (
                <p className="text-xs text-amber-600">
                  Panel height is based on the over-fridge cabinet. Select a cabinet above to set panel height automatically.
                </p>
              )}
              <OptionPills<FridgePanels>
                value={panels}
                onChange={setPanels}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                  { value: "both", label: "Both" },
                  { value: "none", label: "None" },
                ]}
              />
            </div>

            {panels !== "none" && (
              <div className="space-y-3 pt-1">
                {/* Panel Depth */}
                <DimSelector
                  label="Panel Depth"
                  value={panelDepth}
                  options={PANEL_DEPTH_OPTIONS}
                  onChange={setPanelDepth}
                />

                {/* Panel style selector */}
                {endPanels.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Panel style ({endPanels.length} available)
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {endPanels.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedPanelId(String(c.id))}
                          className={cn(
                            "rounded border px-2.5 py-1 text-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                            selectedPanelId === String(c.id)
                              ? "border-primary bg-primary text-primary-foreground font-semibold"
                              : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          {c.masterCode}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {endPanels.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    No end panels found for this style. Panels will be placed as generic fillers.
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* ── 4. Optional smooth refrigerator panel ────────────────────── */}
          {hasSmoothPanel && (
            <label className="flex cursor-pointer items-center gap-2 px-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                checked={smooth}
                onChange={(e) => setSmooth(e.target.checked)}
              />
              <span className="text-sm">{t("dt_fridge_smooth_label")}</span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="bg-background" onClick={onSkip}>
            {t("dt_fridge_skip")}
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {t("dt_fridge_apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
