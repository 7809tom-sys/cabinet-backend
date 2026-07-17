import { useEffect, useState } from "react";
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

export type FridgeAbove = "deep" | "bridge" | "none";
export type FridgePanels = "left" | "right" | "both" | "none";

export interface FridgeSurroundChoice {
  above: FridgeAbove;
  panels: FridgePanels;
  smooth: boolean;
}

export interface RefrigeratorOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the style has a buyable deep 24" refrigerator wall cabinet. */
  hasDeepAbove?: boolean;
  /** True when the style has a buyable shallow bridge wall cabinet. */
  hasBridgeAbove?: boolean;
  /** True when the style has a buyable refrigerator end panel. */
  hasEndPanels?: boolean;
  /** True when the style has a buyable smooth skin/refrigerator panel. */
  hasSmoothPanel?: boolean;
  /** Apply the chosen surround. */
  onApply: (choice: FridgeSurroundChoice) => void;
  /** Keep just the refrigerator (no surround). */
  onSkip: () => void;
}

// A small pill-style single-select control (keeps the dialog dependency-light;
// no radix radio group needed for these short option sets).
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

export function RefrigeratorOptionsDialog({
  open,
  onOpenChange,
  hasDeepAbove = true,
  hasBridgeAbove = true,
  hasEndPanels = true,
  hasSmoothPanel = true,
  onApply,
  onSkip,
}: RefrigeratorOptionsDialogProps) {
  const { t } = useLanguage();
  const [above, setAbove] = useState<FridgeAbove>("none");
  const [panels, setPanels] = useState<FridgePanels>("none");
  const [smooth, setSmooth] = useState(false);

  // Reset the form each time the dialog opens for a freshly dropped fridge.
  useEffect(() => {
    if (open) {
      setAbove(hasDeepAbove ? "deep" : hasBridgeAbove ? "bridge" : "none");
      setPanels("none");
      setSmooth(false);
    }
  }, [open, hasDeepAbove, hasBridgeAbove]);

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
          <Button onClick={() => onApply({ above, panels, smooth })}>
            {t("dt_fridge_apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
