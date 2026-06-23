import { useState, useEffect } from "react";
import { Maximize, Pencil, Ruler, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RoomData, inchesToFeetInches, parseLengthToInches, clampRoomInches,
} from "@/lib/design";

interface Props {
  room: RoomData;
  onChange: (room: RoomData) => void;
  drawMode: boolean;
  onToggleDraw: () => void;
}

const PRESETS: { label: string; width: number; depth: number }[] = [
  { label: "10 × 8", width: 120, depth: 96 },
  { label: "10 × 10", width: 120, depth: 120 },
  { label: "12 × 10", width: 144, depth: 120 },
  { label: "12 × 12", width: 144, depth: 144 },
  { label: "16 × 12", width: 192, depth: 144 },
];

// Display inches as a clean tape-measure string, e.g. 126 -> 10' 6"
function toTapeString(totalInches: number): string {
  const { feet, inches } = inchesToFeetInches(totalInches);
  if (inches === 0) return `${feet}'`;
  return `${feet}' ${inches}"`;
}

export function RoomSizeControl({ room, onChange, drawMode, onToggleDraw }: Props) {
  const [open, setOpen] = useState(false);

  // Single tape-measure field per wall, seeded from the current room and kept in
  // sync whenever the room changes externally (mouse-draw / package preload).
  const [wStr, setWStr] = useState(() => toTapeString(room.width));
  const [dStr, setDStr] = useState(() => toTapeString(room.depth));

  useEffect(() => {
    setWStr(toTapeString(room.width));
    setDStr(toTapeString(room.depth));
  }, [room.width, room.depth]);

  const wParsed = parseLengthToInches(wStr);
  const dParsed = parseLengthToInches(dStr);
  const wValid = wParsed != null;
  const dValid = dParsed != null;

  const apply = () => {
    if (!wValid || !dValid) return;
    onChange({ width: clampRoomInches(wParsed!), depth: clampRoomInches(dParsed!) });
    setOpen(false);
  };

  const wDisp = inchesToFeetInches(room.width);
  const dDisp = inchesToFeetInches(room.depth);
  const fmt = (v: { feet: number; inches: number }) =>
    v.inches === 0 ? `${v.feet}'` : `${v.feet}'${v.inches}"`;

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Maximize className="h-3.5 w-3.5" />
            <span className="text-xs">Room: {fmt(wDisp)} × {fmt(dDisp)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Ruler className="h-4 w-4 mt-0.5 text-[#a87f33] shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">Measure your room</div>
                <p className="text-[11px] text-muted-foreground">
                  Grab a tape measure and enter each wall. Type any format — <span className="font-medium">10' 6"</span>, <span className="font-medium">126"</span>, or <span className="font-medium">120 1/2</span>.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <WallField
                label="Back wall (width)"
                value={wStr}
                onChange={setWStr}
                onEnter={apply}
                parsed={wParsed}
                valid={wValid}
              />
              <WallField
                label="Side wall (depth)"
                value={dStr}
                onChange={setDStr}
                onEnter={apply}
                parsed={dParsed}
                valid={dValid}
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Quick presets</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onChange({ width: p.width, depth: p.depth })}
                    className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted/60 transition-colors"
                  >
                    {p.label} ft
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={apply}
              disabled={!wValid || !dValid}
              className="w-full h-9 bg-[#1a2744] text-white hover:bg-[#243456] gap-1.5"
            >
              <Check className="h-4 w-4" /> Apply room size
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Tip: always double-check critical dimensions with your tape before ordering.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="sm"
        onClick={onToggleDraw}
        title="Draw the room outline with your mouse"
        className={`h-8 gap-1.5 ${drawMode ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]" : ""}`}
      >
        <Pencil className="h-3.5 w-3.5" /> Draw Room
      </Button>
    </div>
  );
}

function WallField({
  label, value, onChange, onEnter, parsed, valid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  parsed: number | null;
  valid: boolean;
}) {
  const showError = value.trim().length > 0 && !valid;
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        placeholder={`e.g. 10' 6"`}
        inputMode="text"
        className={`h-9 text-sm ${showError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
      />
      <div className="h-3.5 text-[10px] leading-none">
        {valid && parsed != null ? (
          <span className="text-emerald-600">= {Math.round(parsed * 100) / 100}" ({toTapeString(parsed)})</span>
        ) : showError ? (
          <span className="text-red-500">Couldn't read that — try 10' 6" or 126"</span>
        ) : null}
      </div>
    </div>
  );
}
