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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FridgeAbove = "deep" | "bridge" | "none";
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
  panels: FridgePanels;
  /** The specific end panel chosen by the user (id). Null when panels === "none". */
  endPanelId: number | null;
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
  /** Fridge width in inches — used to filter bridge cabinets. */
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

// Standard fridge widths (inches)
const FRIDGE_WIDTHS = [24, 27, 30, 33, 36, 42];
// Standard fridge heights (inches)
const FRIDGE_HEIGHTS = [66, 70, 72, 78, 84];
// Standard fridge depths (inches)
const FRIDGE_DEPTHS = [24, 27, 30, 33, 36];
// Allowed bridge cabinet heights — exactly 12", 18", 24"
const BRIDGE_HEIGHT_OPTIONS = [12, 18, 24] as const;
type BridgeHeight = typeof BRIDGE_HEIGHT_OPTIONS[number];

// A small pill-style single-select control.
function OptionPills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
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
          </button>
        );
      })}
    </div>
  );
}

// A compact inline dimension selector row
function DimSelector({
  label,
  value,
  options,
  onChange,
  unit = '"',
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
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

export function RefrigeratorOptionsDialog({
  open,
  onOpenChange,
  fridgeWidthInches,
  deepAbove = [],
  bridgeAbove = [],
  endPanels = [],
  hasSmoothPanel = false,
  onApply,
  onSkip,
}: RefrigeratorOptionsDialogProps) {
  const { t } = useLanguage();

  // ── Fridge size state ──────────────────────────────────────────────────────
  const [fridgeW, setFridgeW] = useState<number>(fridgeWidthInches ?? 36);
  const [fridgeH, setFridgeH] = useState<number>(70);
  const [fridgeD, setFridgeD] = useState<number>(30);

  // ── Bridge height selection (12", 18", or 24") ─────────────────────────────
  const [bridgeHeightChoice, setBridgeHeightChoice] = useState<BridgeHeight>(12);

  const hasDeepAbove = deepAbove.length > 0;

  // For each of the 3 bridge height options, find the best-matching catalog
  // cabinet (closest width ≤ fridge width). Used to check availability.
  const bridgeByHeight = useMemo(() => {
    const result: Record<BridgeHeight, SurroundCabinet | null> = { 12: null, 18: null, 24: null };
    for (const targetH of BRIDGE_HEIGHT_OPTIONS) {
      const candidates = bridgeAbove.filter((c) => {
        const w = parseFloat(String(c.width ?? "0"));
        const h = parseFloat(String(c.height ?? "0"));
        return w <= fridgeW + 0.5 && Math.abs(h - targetH) < 1.5;
      });
      if (candidates.length === 0) continue;
      // Prefer exact width match, then closest ≤ fridge width
      result[targetH] = [...candidates].sort(
        (a, b) =>
          Math.abs(parseFloat(String(a.width ?? "0")) - fridgeW) -
          Math.abs(parseFloat(String(b.width ?? "0")) - fridgeW)
      )[0];
    }
    return result;
  }, [bridgeAbove, fridgeW]);

  const hasBridgeAbove = BRIDGE_HEIGHT_OPTIONS.some((h) => bridgeByHeight[h] !== null);

  // Best-match end panel
  const bestPanel = useMemo(() => {
    if (!endPanels.length) return null;
    return endPanels[0];
  }, [endPanels]);

  const [above, setAbove] = useState<FridgeAbove>("none");
  const [panels, setPanels] = useState<FridgePanels>("none");
  const [selectedPanelId, setSelectedPanelId] = useState<string>("");
  const [smooth, setSmooth] = useState(false);

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setFridgeW(fridgeWidthInches ?? 36);
      setFridgeH(70);
      setFridgeD(30);
      setBridgeHeightChoice(12);
      const defaultAbove: FridgeAbove = hasDeepAbove ? "deep" : hasBridgeAbove ? "bridge" : "none";
      setAbove(defaultAbove);
      setPanels("none");
      setSelectedPanelId(bestPanel ? String(bestPanel.id) : "");
      setSmooth(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // When panels changes away from "none", pre-select best panel.
  useEffect(() => {
    if (panels !== "none" && !selectedPanelId && bestPanel) {
      setSelectedPanelId(String(bestPanel.id));
    }
  }, [panels, selectedPanelId, bestPanel]);

  // The chosen bridge cabinet (auto-selected by height + fridge width)
  const chosenBridge = above === "bridge" ? bridgeByHeight[bridgeHeightChoice] : null;

  const handleApply = () => {
    onApply({
      above,
      bridgeCabinetId: chosenBridge ? chosenBridge.id : null,
      bridgeHeight: above === "bridge" ? bridgeHeightChoice : null,
      panels,
      endPanelId: panels !== "none" && selectedPanelId ? parseInt(selectedPanelId, 10) : null,
      smooth,
      fridgeWidth: fridgeW,
      fridgeHeight: fridgeH,
      fridgeDepth: fridgeD,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dt_fridge_title")}</DialogTitle>
          <DialogDescription>{t("dt_fridge_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Section 1: Refrigerator size ─────────────────────────────── */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refrigerator Size
            </p>
            <DimSelector label="Width" value={fridgeW} options={FRIDGE_WIDTHS} onChange={setFridgeW} />
            <DimSelector label="Height" value={fridgeH} options={FRIDGE_HEIGHTS} onChange={setFridgeH} />
            <DimSelector label="Depth" value={fridgeD} options={FRIDGE_DEPTHS} onChange={setFridgeD} />
          </div>

          {/* ── Section 2: Cabinet above the refrigerator ────────────────── */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("dt_fridge_above_label")}</Label>
            <OptionPills<FridgeAbove>
              value={above}
              onChange={setAbove}
              options={[
                { value: "deep", label: t("dt_fridge_above_deep"), disabled: !hasDeepAbove },
                { value: "bridge", label: t("dt_fridge_above_bridge"), disabled: !hasBridgeAbove },
                { value: "none", label: t("dt_fridge_above_none") },
              ]}
            />

            {/* Bridge height selector — simple 3-button row */}
            {above === "bridge" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Cabinet height above refrigerator
                </p>
                <div className="flex gap-2">
                  {BRIDGE_HEIGHT_OPTIONS.map((h) => {
                    const cab = bridgeByHeight[h];
                    const active = bridgeHeightChoice === h;
                    const disabled = cab === null;
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={disabled}
                        onClick={() => setBridgeHeightChoice(h)}
                        className={cn(
                          "flex-1 rounded-lg border py-3 text-sm font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                          disabled && "cursor-not-allowed opacity-40 hover:bg-background hover:text-foreground"
                        )}
                        aria-pressed={active}
                      >
                        {h}"
                      </button>
                    );
                  })}
                </div>
                {chosenBridge && (
                  <p className="text-[11px] text-muted-foreground">
                    Will use: <span className="font-medium text-foreground">{chosenBridge.masterCode}</span>
                    {" "}— sized to match {fridgeW}" fridge width
                  </p>
                )}
                {!chosenBridge && (
                  <p className="text-[11px] text-amber-600">
                    No {bridgeHeightChoice}" bridge cabinet available for this style. Try a different height.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Section 3: Refrigerator end panels ───────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("dt_fridge_panels_label")}</Label>
            <OptionPills<FridgePanels>
              value={panels}
              onChange={setPanels}
              options={[
                { value: "left", label: t("dt_fridge_panel_left"), disabled: !endPanels.length },
                { value: "right", label: t("dt_fridge_panel_right"), disabled: !endPanels.length },
                { value: "both", label: t("dt_fridge_panel_both"), disabled: !endPanels.length },
                { value: "none", label: t("dt_fridge_panel_none") },
              ]}
            />

            {panels !== "none" && endPanels.length > 0 && (
              <div className="mt-2 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Panel style ({endPanels.length} available)
                </Label>
                <Select value={selectedPanelId} onValueChange={setSelectedPanelId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select end panel…" />
                  </SelectTrigger>
                  <SelectContent>
                    {endPanels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.description ?? `${c.masterCode}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ── Section 4: Optional smooth refrigerator panel ────────────── */}
          {hasSmoothPanel && (
            <label className="flex cursor-pointer items-center gap-2">
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
          <Button
            onClick={handleApply}
            disabled={
              (above === "bridge" && !chosenBridge) ||
              (panels !== "none" && endPanels.length > 0 && !selectedPanelId)
            }
          >
            {t("dt_fridge_apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
