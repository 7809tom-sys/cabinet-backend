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
  panels: FridgePanels;
  /** The specific end panel chosen by the user (id). Null when panels === "none". */
  endPanelId: number | null;
  smooth: boolean;
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

/** Format a cabinet option label: "30"W × 12"H – W3012" */
function cabinetLabel(c: SurroundCabinet): string {
  const w = c.width ? `${parseFloat(c.width)}"W` : "";
  const h = c.height ? ` × ${parseFloat(c.height)}"H` : "";
  const code = c.masterCode ? ` – ${c.masterCode}` : "";
  return `${w}${h}${code}`;
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

  const hasDeepAbove = deepAbove.length > 0;
  const hasEndPanels = endPanels.length > 0;

  // Filter bridge cabinets: only show those whose width ≤ fridge width.
  // If fridge width is unknown, show all. Sort by width ascending.
  const filteredBridge = useMemo(() => {
    const fw = fridgeWidthInches ?? Infinity;
    return [...bridgeAbove]
      .filter((c) => {
        const w = parseFloat(String(c.width ?? "0"));
        return !isNaN(w) && w <= fw + 0.5; // +0.5" tolerance for rounding
      })
      .sort((a, b) => {
        const wa = parseFloat(String(a.width ?? "0"));
        const wb = parseFloat(String(b.width ?? "0"));
        return wa - wb;
      });
  }, [bridgeAbove, fridgeWidthInches]);

  const hasBridgeAbove = filteredBridge.length > 0;

  // Best-match bridge: prefer exact width match, then closest ≤ fridge width.
  const bestBridge = useMemo(() => {
    if (!filteredBridge.length) return null;
    const fw = fridgeWidthInches ?? 0;
    return [...filteredBridge].sort(
      (a, b) =>
        Math.abs(parseFloat(String(a.width ?? "0")) - fw) -
        Math.abs(parseFloat(String(b.width ?? "0")) - fw)
    )[0];
  }, [filteredBridge, fridgeWidthInches]);

  // Best-match end panel: prefer depth closest to fridge depth (24").
  const bestPanel = useMemo(() => {
    if (!endPanels.length) return null;
    return endPanels[0]; // already sorted by width from server
  }, [endPanels]);

  const [above, setAbove] = useState<FridgeAbove>("none");
  const [selectedBridgeId, setSelectedBridgeId] = useState<string>("");
  const [panels, setPanels] = useState<FridgePanels>("none");
  const [selectedPanelId, setSelectedPanelId] = useState<string>("");
  const [smooth, setSmooth] = useState(false);

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (open) {
      const defaultAbove: FridgeAbove = hasDeepAbove ? "deep" : hasBridgeAbove ? "bridge" : "none";
      setAbove(defaultAbove);
      setSelectedBridgeId(bestBridge ? String(bestBridge.id) : "");
      setPanels("none");
      setSelectedPanelId(bestPanel ? String(bestPanel.id) : "");
      setSmooth(false);
    }
  }, [open, hasDeepAbove, hasBridgeAbove, bestBridge, bestPanel]);

  // When above changes to "bridge", ensure a bridge is pre-selected.
  useEffect(() => {
    if (above === "bridge" && !selectedBridgeId && bestBridge) {
      setSelectedBridgeId(String(bestBridge.id));
    }
  }, [above, selectedBridgeId, bestBridge]);

  // When panels changes away from "none", pre-select best panel.
  useEffect(() => {
    if (panels !== "none" && !selectedPanelId && bestPanel) {
      setSelectedPanelId(String(bestPanel.id));
    }
  }, [panels, selectedPanelId, bestPanel]);

  const handleApply = () => {
    onApply({
      above,
      bridgeCabinetId: above === "bridge" && selectedBridgeId ? parseInt(selectedBridgeId, 10) : null,
      panels,
      endPanelId: panels !== "none" && selectedPanelId ? parseInt(selectedPanelId, 10) : null,
      smooth,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dt_fridge_title")}</DialogTitle>
          <DialogDescription>{t("dt_fridge_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Cabinet above the refrigerator */}
          <div className="space-y-2">
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

            {/* Bridge cabinet dropdown — shown only when "bridge" is selected */}
            {above === "bridge" && filteredBridge.length > 0 && (
              <div className="mt-2 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {fridgeWidthInches
                    ? `Bridge cabinets ≤ ${fridgeWidthInches}" wide (${filteredBridge.length} available)`
                    : `Bridge cabinets (${filteredBridge.length} available)`}
                </Label>
                <Select value={selectedBridgeId} onValueChange={setSelectedBridgeId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select bridge cabinet…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBridge.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {cabinetLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Refrigerator end panels */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("dt_fridge_panels_label")}</Label>
            <OptionPills<FridgePanels>
              value={panels}
              onChange={setPanels}
              options={[
                { value: "left", label: t("dt_fridge_panel_left"), disabled: !hasEndPanels },
                { value: "right", label: t("dt_fridge_panel_right"), disabled: !hasEndPanels },
                { value: "both", label: t("dt_fridge_panel_both"), disabled: !hasEndPanels },
                { value: "none", label: t("dt_fridge_panel_none") },
              ]}
            />

            {/* End panel dropdown — shown when a panel side is selected */}
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
                        {c.description ?? cabinetLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Optional smooth refrigerator panel */}
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
              (above === "bridge" && filteredBridge.length > 0 && !selectedBridgeId) ||
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
