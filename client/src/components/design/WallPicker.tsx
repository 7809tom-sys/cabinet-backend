import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { WallSide } from "@/lib/design";

interface Props {
  onPick: (side: WallSide) => void;
  disabled?: boolean;
}

const BUTTONS: { side: WallSide; label: string; Icon: typeof ArrowUp }[] = [
  { side: "top", label: "Back", Icon: ArrowUp },
  { side: "left", label: "Left", Icon: ArrowLeft },
  { side: "right", label: "Right", Icon: ArrowRight },
  { side: "bottom", label: "Front", Icon: ArrowDown },
];

// A compact wall selector shown when a cabinet is selected. Clicking a side
// snaps the cabinet flush to that wall, so users can place a cabinet on the
// wall they actually want instead of dragging and hoping it snaps.
export function WallPicker({ onPick, disabled }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Snap to wall:</span>
      <div className="flex items-center gap-0.5">
        {BUTTONS.map(({ side, label, Icon }) => (
          <button
            key={side}
            type="button"
            disabled={disabled}
            onClick={() => onPick(side)}
            title={`Snap to ${label.toLowerCase()} wall`}
            className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[11px] font-medium text-[#1a2744] transition-colors hover:bg-[#1a2744] hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#1a2744]"
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
