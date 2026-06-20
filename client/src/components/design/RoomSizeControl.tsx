import { useState, useEffect } from "react";
import { Maximize, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RoomData, feetInchesToInches, inchesToFeetInches,
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

export function RoomSizeControl({ room, onChange, drawMode, onToggleDraw }: Props) {
  const [open, setOpen] = useState(false);

  // Local feet/inches fields, seeded from the current room and kept in sync
  // whenever the room changes externally (e.g. mouse-draw or package preload).
  const wInit = inchesToFeetInches(room.width);
  const dInit = inchesToFeetInches(room.depth);
  const [wFt, setWFt] = useState(String(wInit.feet));
  const [wIn, setWIn] = useState(String(wInit.inches));
  const [dFt, setDFt] = useState(String(dInit.feet));
  const [dIn, setDIn] = useState(String(dInit.inches));

  useEffect(() => {
    const w = inchesToFeetInches(room.width);
    const d = inchesToFeetInches(room.depth);
    setWFt(String(w.feet)); setWIn(String(w.inches));
    setDFt(String(d.feet)); setDIn(String(d.inches));
  }, [room.width, room.depth]);

  const apply = () => {
    const width = feetInchesToInches(parseInt(wFt || "0", 10), parseInt(wIn || "0", 10));
    const depth = feetInchesToInches(parseInt(dFt || "0", 10), parseInt(dIn || "0", 10));
    onChange({ width, depth });
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
        <PopoverContent className="w-72" align="start">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Room size</div>
              <p className="text-[11px] text-muted-foreground">Enter your kitchen's wall dimensions.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Width (along back wall)</Label>
                <div className="flex items-center gap-1">
                  <Input value={wFt} onChange={(e) => setWFt(e.target.value.replace(/[^0-9]/g, ""))} className="h-8 text-xs" inputMode="numeric" />
                  <span className="text-[11px] text-muted-foreground">ft</span>
                  <Input value={wIn} onChange={(e) => setWIn(e.target.value.replace(/[^0-9]/g, ""))} className="h-8 text-xs" inputMode="numeric" />
                  <span className="text-[11px] text-muted-foreground">in</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Depth (side wall)</Label>
                <div className="flex items-center gap-1">
                  <Input value={dFt} onChange={(e) => setDFt(e.target.value.replace(/[^0-9]/g, ""))} className="h-8 text-xs" inputMode="numeric" />
                  <span className="text-[11px] text-muted-foreground">ft</span>
                  <Input value={dIn} onChange={(e) => setDIn(e.target.value.replace(/[^0-9]/g, ""))} className="h-8 text-xs" inputMode="numeric" />
                  <span className="text-[11px] text-muted-foreground">in</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
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

            <Button onClick={apply} className="w-full h-8 bg-[#1a2744] text-white hover:bg-[#243456]">
              Apply size
            </Button>
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
