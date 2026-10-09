import { useId, useRef, useState } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import { CabinetHandlesControl } from "./CabinetHandlesControl";
import { hardwareStyle, type HardwareStyleId } from "@/lib/hardware";

interface Props {
  value: HardwareStyleId;
  onChange: (value: HardwareStyleId) => void;
}

/** Same saved Designer choice, accessible even when the parent toolbar is off-screen. */
export function ThreeDHandlesControl({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      data-testid="three-d-handles-control"
      className="relative shrink-0"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        data-testid="three-d-handles-trigger"
        aria-label="Cabinet handles in 3D"
        aria-expanded={open}
        aria-controls={popupId}
        title={`Handles: ${hardwareStyle(value).label}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 items-center gap-1 rounded-md border bg-background/95 px-2 text-xs font-semibold text-[#1a2744] shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a87f33] active:scale-95"
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        Handles
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={popupId}
          data-testid="three-d-handles-popover"
          role="group"
          aria-label="Choose cabinet handles"
          className="absolute right-0 top-full z-40 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-lg border bg-background p-2 text-xs text-foreground shadow-lg"
        >
          <CabinetHandlesControl value={value} tablet onChange={(style) => { onChange(style); setOpen(false); buttonRef.current?.focus(); }} />
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {value === "none" ? "No handles selected. Choose a style to show handles on your cabinets." : `Current: ${hardwareStyle(value).label}.`}
            {" "}Finishing specification only; no added price.
          </p>
        </div>
      )}
    </div>
  );
}
