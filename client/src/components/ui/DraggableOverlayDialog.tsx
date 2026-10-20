import * as React from "react";

import { cn } from "@/lib/utils";

type DraggableOverlayDialogProps = Omit<React.ComponentProps<"div">, "style" | "children"> & {
  children: React.ReactNode;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  overlayClassName?: string;
  onBackdropClick?: () => void;
};

/**
 * A small bridge for legacy Designer popups that were composed from plain divs
 * instead of the shared Dialog primitive. Only descendants marked with
 * `data-popup-drag-handle="true"` start a drag, so their buttons and form
 * controls remain normal controls.
 */
export function DraggableOverlayDialog({
  children,
  className,
  contentClassName,
  contentStyle,
  overlayClassName,
  onBackdropClick,
  onPointerDownCapture,
  ...contentProps
}: DraggableOverlayDialogProps) {
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const dragOriginRef = React.useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const clampOffset = React.useCallback((x: number, y: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height || typeof window === "undefined") return { x, y };
    const inset = 12;
    const baseLeft = window.innerWidth / 2 - rect.width / 2;
    const baseTop = window.innerHeight / 2 - rect.height / 2;
    return {
      x: Math.min(Math.max(x, inset - baseLeft), window.innerWidth - inset - rect.width - baseLeft),
      y: Math.min(Math.max(y, inset - baseTop), window.innerHeight - inset - rect.height - baseTop),
    };
  }, []);

  const handlePointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDownCapture?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const handle = target.closest("[data-popup-drag-handle='true']");
    const interactive = target.closest("button, a, input, textarea, select, [role='button']");
    if (!handle || interactive) return;
    dragOriginRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: dragOffset.x,
      startY: dragOffset.y,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }, [dragOffset.x, dragOffset.y, onPointerDownCapture]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setDragOffset(clampOffset(origin.startX + event.clientX - origin.x, origin.startY + event.clientY - origin.y));
  }, [clampOffset]);

  const stopDragging = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragOriginRef.current?.pointerId === event.pointerId) dragOriginRef.current = null;
  }, []);

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true">
      <div
        aria-hidden="true"
        className={cn("absolute inset-0 bg-black/50", overlayClassName)}
        onClick={onBackdropClick}
      />
      <div
        ref={contentRef}
        {...contentProps}
        className={cn("fixed top-1/2 left-1/2", className, contentClassName)}
        style={{ ...contentStyle, translate: `calc(-50% + ${dragOffset.x}px) calc(-50% + ${dragOffset.y}px)` }}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        {children}
      </div>
    </div>
  );
}
