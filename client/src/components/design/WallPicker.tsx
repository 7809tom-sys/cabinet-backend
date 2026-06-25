import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { WallSide } from "@/lib/design";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SiteStringKey } from "@/lib/i18n/site";

interface Props {
  onPick: (side: WallSide) => void;
  disabled?: boolean;
}

const BUTTONS: { side: WallSide; labelKey: SiteStringKey; Icon: typeof ArrowUp }[] = [
  { side: "top", labelKey: "dt_wall_back", Icon: ArrowUp },
  { side: "left", labelKey: "dt_wall_left", Icon: ArrowLeft },
  { side: "right", labelKey: "dt_wall_right", Icon: ArrowRight },
  { side: "bottom", labelKey: "dt_wall_front", Icon: ArrowDown },
];

// A compact wall selector shown when a cabinet is selected. Clicking a side
// snaps the cabinet flush to that wall, so users can place a cabinet on the
// wall they actually want instead of dragging and hoping it snaps.
export function WallPicker({ onPick, disabled }: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{t("dt_snap_to_wall")}</span>
      <div className="flex items-center gap-0.5">
        {BUTTONS.map(({ side, labelKey, Icon }) => {
          const label = t(labelKey);
          return (
            <button
              key={side}
              type="button"
              disabled={disabled}
              onClick={() => onPick(side)}
              title={t("dt_snap_to_x_wall", { wall: label.toLowerCase() })}
              className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[11px] font-medium text-[#1a2744] transition-colors hover:bg-[#1a2744] hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#1a2744]"
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
