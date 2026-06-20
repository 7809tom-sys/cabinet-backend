import { PlacedCabinet, RoomData, STD, elevationBox, rotatedSize } from "@/lib/design";
import { useRef, useEffect, useState } from "react";

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  wall: "front" | "back" | "left" | "right";
}

export function ElevationView({ room, cabinets, selectedUid, onSelect, wall }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;
  const WALL_TOTAL_HEIGHT = 96;

  const horizontal = wall === "front" || wall === "back";
  const planSpan = horizontal ? room.width : room.depth;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - PADDING * 2;
      const availH = el.clientHeight - PADDING * 2;
      const fitPpi = Math.min(availW / planSpan, availH / WALL_TOTAL_HEIGHT);
      setPpi(Math.max(1.5, Math.min(fitPpi, 7)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planSpan]);

  const wallPxW = planSpan * ppi;
  const wallPxH = WALL_TOTAL_HEIGHT * ppi;

  const sorted = [...cabinets].sort((a, b) => {
    const order = { tall: 0, base: 1, wall: 2 };
    return order[a.placement] - order[b.placement];
  });

  return (
    <div
      ref={ref}
      className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#dde6f0] to-[#eef1f5] select-none"
      onClick={() => onSelect(null)}
    >
      <div
        className="absolute"
        style={{
          width: wallPxW,
          height: wallPxH,
          left: "50%",
          bottom: PADDING,
          transform: "translateX(-50%)",
          background: "linear-gradient(to bottom, #f7f9fc 0%, #eef2f7 100%)",
          borderLeft: "2px solid #1a2744",
          borderRight: "2px solid #1a2744",
          borderTop: "2px solid #1a2744",
        }}
      >
        <div className="absolute left-0 right-0 bottom-0 border-b-[3px] border-[#1a2744]" />
        <div
          className="absolute left-0 right-0 border-b border-dashed border-[#b08d57]/40"
          style={{ bottom: STD.COUNTERTOP_HEIGHT * ppi }}
        />

        {sorted.map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom, height } = elevationBox(p);
          const isWall = p.placement === "wall";
          const isSelected = p.uid === selectedUid;

          return (
            <div
              key={p.uid}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p.uid);
              }}
              className="absolute cursor-pointer flex flex-col items-center justify-center overflow-hidden"
              style={{
                left: posAlong * ppi,
                width: sizeAlong * ppi,
                bottom: bottom * ppi,
                height: height * ppi,
                background: isWall ? "#d8c39c" : "#cdb38b",
                border: isSelected ? "2px solid #1a2744" : "1.5px solid #a07d4a",
                boxShadow: isSelected ? "0 0 0 3px rgba(212,167,90,0.5)" : undefined,
              }}
              title={`${p.masterCode} — ${p.description}`}
            >
              <div className="w-full h-full relative">
                <div className="absolute inset-[3px] border border-[#8a6d3b]/40 rounded-[1px]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-[#1a2744] truncate px-0.5">
                    {p.masterCode}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {sorted
          .filter((p) => p.placement === "base")
          .map((p) => {
            const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
            const posAlong = horizontal ? p.x : p.y;
            return (
              <div
                key={`ct-${p.uid}`}
                className="absolute bg-[#3a3a3a]"
                style={{
                  left: posAlong * ppi - 1,
                  width: sizeAlong * ppi + 2,
                  bottom: STD.COUNTERTOP_HEIGHT * ppi,
                  height: Math.max(2, STD.COUNTERTOP_THICKNESS * ppi),
                }}
              />
            );
          })}
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-medium text-[#1a2744] bg-white/80 px-3 py-1 rounded-full">
        Front Elevation
      </div>

      {cabinets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Place cabinets in the plan view to see them here
        </div>
      )}
    </div>
  );
}
