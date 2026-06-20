import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  X,
  MousePointerClick,
  Move,
  Ruler,
  PencilLine,
  PanelsTopLeft,
  RotateCw,
} from "lucide-react";

const DISMISS_KEY = "cd_design_tip_dismissed_v1";

/** Short rotating one-liners shown in the tip strip above the canvas. */
const TIPS: string[] = [
  "Pick a wall (Back / Left / Right / Front) — the highlighted wall is where new items land.",
  "Drag a highlighted wall in or out on the canvas to resize the room on that side.",
  "Click \"Room\" to type exact width & depth, or \"Draw Room\" to sketch it with your mouse.",
  "Select a placed cabinet, then use \"Snap to wall\" to move it to another wall.",
  "Only cabinets available from your selected line & door style are shown.",
];

/** A single step in the Help guide. */
function HelpStep({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1a2744] text-[#e0b56e]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/**
 * On-page help for the design tool: a dismissable rotating tip strip plus a
 * "?" button that opens a full step-by-step guide dialog.
 */
export function DesignHelp() {
  const [dismissed, setDismissed] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);

  // Read first-time dismissal state from localStorage on mount.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // Rotate the tip every few seconds while the strip is visible.
  useEffect(() => {
    if (dismissed) return;
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore storage errors */
    }
  };

  const helpButton = useMemo(
    () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 bg-background"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How to use the Kitchen Designer</DialogTitle>
            <DialogDescription>
              A quick guide to laying out your kitchen to scale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <HelpStep icon={<PanelsTopLeft className="h-4 w-4" />} title="1. Choose a wall">
              Use the <strong>Wall</strong> selector (Back / Left / Right / Front). The
              chosen wall is highlighted on the floor plan — that's where new items go.
            </HelpStep>
            <HelpStep icon={<MousePointerClick className="h-4 w-4" />} title="2. Add cabinets & items">
              Click any cabinet, appliance, or door/window from the left panel. It drops
              onto the highlighted wall and lines up next to what's already there.
            </HelpStep>
            <HelpStep icon={<Move className="h-4 w-4" />} title="3. Resize the room by a wall">
              Drag a highlighted wall inward or outward on the canvas to grow or shrink the
              room on that side. A live feet/inches readout follows your drag.
            </HelpStep>
            <HelpStep icon={<Ruler className="h-4 w-4" />} title="4. Set exact measurements">
              Click <strong>Room</strong> to type the precise width and depth in feet and
              inches. Your room redraws to scale instantly.
            </HelpStep>
            <HelpStep icon={<PencilLine className="h-4 w-4" />} title="5. Or draw it freehand">
              Click <strong>Draw Room</strong>, then drag on the empty canvas to sketch the
              room outline. Release to set the size (snapped to the nearest inch).
            </HelpStep>
            <HelpStep icon={<RotateCw className="h-4 w-4" />} title="6. Adjust placed items">
              Select any cabinet to <strong>Rotate</strong>, <strong>Delete</strong>, or use
              <strong> Snap to wall</strong> to move it to a different wall.
            </HelpStep>
          </div>
        </DialogContent>
      </Dialog>
    ),
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!dismissed && (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-[#e0b56e]/40 bg-[#e0b56e]/10 px-3 py-1.5">
          <HelpCircle className="h-4 w-4 shrink-0 text-[#e0b56e]" />
          <p
            key={tipIndex}
            className="truncate text-xs text-foreground/90 animate-in fade-in duration-300"
          >
            {TIPS[tipIndex]}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss tip"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {helpButton}
    </div>
  );
}
