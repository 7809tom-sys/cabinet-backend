import { useRef, useState, useCallback, useEffect } from "react";
import {
  PlacedCabinet, RoomData, rotatedSize, snapPosition, hasCollision,
} from "@/lib/design";

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onDropNew?: (clientX: number, clientY: number, canvasRect: DOMRect, ppi: number) => void;
  showWallLayer: boolean;
}

export function PlanCanvas({
  room, cabinets, selectedUid, onSelect, onMove, onDropNew, showWallLayer,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [hoverSnap, setHoverSnap] = useState(false);

  const PADDING = 48;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - PADDING * 2;
      const availH = el.clientHeight - PADDING * 2;
      const fitPpi = Math.min(availW / room.width, availH / room.depth);
      setPpi(Math.max(1.5, Math.min(fitPpi, 8)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [room.width, room.depth]);

  const roomPxW = room.width * ppi;
  const roomPxH = room.depth * ppi;

  const handlePointerDown = (e: React.PointerEvent, p: PlacedCabinet) => {
    e.stopPropagation();
    onSelect(p.uid);
    setDragUid(p.uid);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragUid) return;
      const container = containerRef.current;
      if (!container) return;
      const cabinet = cabinets.find((c) => c.uid === dragUid);
      if (!cabinet) return;

      const roomEl = container.querySelector("[data-room]") as HTMLElement;
      if (!roomEl) return;
      const roomRect = roomEl.getBoundingClientRect();

      const px = e.clientX - roomRect.left - dragOffset.current.x;
      const py = e.clientY - roomRect.top - dragOffset.current.y;
      const rawX = px / ppi;
      const rawY = py / ppi;

      const candidate: PlacedCabinet = { ...cabinet, x: rawX, y: rawY };
      const snapped = snapPosition(
        candidate,
        room,
        cabinets.filter((c) => c.placement === cabinet.placement)
      );
      setHoverSnap(snapped.snappedWall);
      onMove(dragUid, snapped.x, snapped.y);
    },
    [dragUid, cabinets, ppi, room, onMove]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragUid) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
    }
    setDragUid(null);
    setHoverSnap(false);
  };

  const xTicks: number[] = [];
  for (let i = 0; i <= room.width; i += 12) xTicks.push(i);
  const yTicks: number[] = [];
  for (let i = 0; i <= room.depth; i += 12) yTicks.push(i);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#eef1f5] select-none touch-none"
      onClick={() => onSelect(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const roomEl = containerRef.current?.querySelector("[data-room]") as HTMLElement;
        if (roomEl && onDropNew) {
          onDropNew(e.clientX, e.clientY, roomEl.getBoundingClientRect(), ppi);
        }
      }}
    >
      <div
        data-room
        className="absolute bg-white shadow-inner"
        style={{
          width: roomPxW,
          height: roomPxH,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          border: "3px solid #1a2744",
          backgroundImage:
            "linear-gradient(#f1f4f8 1px, transparent 1px), linear-gradient(90deg, #f1f4f8 1px, transparent 1px)",
          backgroundSize: `${12 * ppi}px ${12 * ppi}px`,
        }}
      >
        {cabinets
          .filter((c) => (showWallLayer ? true : c.placement !== "wall"))
          .map((p) => {
            const { w, d } = rotatedSize(p);
            const isWall = p.placement === "wall";
            const isSelected = p.uid === selectedUid;
            const collides = hasCollision(
              p,
              cabinets.filter((c) => c.placement === p.placement)
            );
            return (
              <div
                key={p.uid}
                onPointerDown={(e) => handlePointerDown(e, p)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`absolute cursor-move transition-shadow ${
                  isSelected ? "z-20" : isWall ? "z-10" : "z-0"
                }`}
                style={{
                  left: p.x * ppi,
                  top: p.y * ppi,
                  width: w * ppi,
                  height: d * ppi,
                  background: isWall
                    ? "repeating-linear-gradient(45deg, rgba(176,141,87,0.18), rgba(176,141,87,0.18) 6px, rgba(176,141,87,0.30) 6px, rgba(176,141,87,0.30) 12px)"
                    : "#cdb38b",
                  border: isSelected
                    ? "2px solid #1a2744"
                    : collides
                    ? "2px solid #dc2626"
                    : isWall
                    ? "1.5px dashed #8a6d3b"
                    : "1.5px solid #a07d4a",
                  boxShadow: isSelected ? "0 0 0 3px rgba(212,167,90,0.5)" : undefined,
                  borderRadius: 2,
                }}
                title={`${p.masterCode} — ${p.description}`}
              >
                <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden px-0.5">
                  <span className="text-[9px] font-bold text-[#1a2744] leading-none truncate max-w-full">
                    {p.masterCode}
                  </span>
                  <span className="text-[7px] text-[#5a4a2f] leading-none mt-0.5">
                    {Math.round(p.width)}"
                  </span>
                </div>
                {!isWall && (
                  <div
                    className="absolute bottom-0 left-0 right-0 border-b-2 border-[#8a6d3b]/40"
                    style={{ height: 2 }}
                  />
                )}
              </div>
            );
          })}

        {xTicks.map((t) => (
          <div
            key={`x${t}`}
            className="absolute top-0 text-[8px] text-muted-foreground/60"
            style={{ left: t * ppi - 6, top: -16 }}
          >
            {t / 12}'
          </div>
        ))}
        {yTicks.map((t) => (
          <div
            key={`y${t}`}
            className="absolute text-[8px] text-muted-foreground/60"
            style={{ top: t * ppi - 4, left: -18 }}
          >
            {t / 12}'
          </div>
        ))}
      </div>

      {hoverSnap && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#1a2744] text-white text-xs px-3 py-1 rounded-full shadow-lg z-30">
          Snapped to wall
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-white/80 px-2 py-1 rounded">
        {room.width / 12}' × {room.depth / 12}' room
      </div>
    </div>
  );
}
