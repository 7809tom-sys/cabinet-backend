import * as React from "react";

import { cn } from "@/lib/utils";
import { clampPopupSessionPosition, popupSessionPositionKey, readPopupSessionPosition, writePopupSessionPosition } from "./popupSessionPosition";

type DraggableOverlayDialogProps = Omit<React.ComponentProps<"div">, "style" | "children"> & {
  children: React.ReactNode;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  overlayClassName?: string;
  onBackdropClick?: () => void;
  /** Optional stable identity for remembering this popup’s position within the browser session. */
  popupPositionKey?: string;
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
  popupPositionKey,
  ...contentProps
}: DraggableOverlayDialogProps) {
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const dragOffsetRef = React.useRef(dragOffset);
  const dragOriginRef = React.useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const contentAriaLabel = contentProps["aria-label"];

  const clampOffset = React.useCallback((position: { x: number; y: number }) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height || typeof window === "undefined") return position;
    return clampPopupSessionPosition(position, rect.width, rect.height, window.innerWidth, window.innerHeight);
  }, []);

  const setRememberedOffset = React.useCallback((position: { x: number; y: number }) => {
    const clamped = clampOffset(position);
    dragOffsetRef.current = clamped;
    setDragOffset(clamped);
    return clamped;
  }, [clampOffset]);

  React.useLayoutEffect(() => {
    const title = contentRef.current?.querySelector("[data-popup-drag-handle='true']")?.textContent;
    const key = popupSessionPositionKey({
      kind: "overlay-dialog",
      explicitKey: popupPositionKey,
      testId: contentRef.current?.getAttribute("data-testid"),
      ariaLabel: typeof contentAriaLabel === "string" ? contentAriaLabel : null,
      title,
    });
    const remembered = readPopupSessionPosition(key);
    if (remembered) setRememberedOffset(remembered);
  }, [contentAriaLabel, popupPositionKey, setRememberedOffset]);

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
      startX: dragOffsetRef.current.x,
      startY: dragOffsetRef.current.y,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }, [onPointerDownCapture]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setRememberedOffset({ x: origin.startX + event.clientX - origin.x, y: origin.startY + event.clientY - origin.y });
  }, [setRememberedOffset]);

  const stopDragging = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragOriginRef.current?.pointerId !== event.pointerId) return;
    dragOriginRef.current = null;
    const title = contentRef.current?.querySelector("[data-popup-drag-handle='true']")?.textContent;
    const key = popupSessionPositionKey({
      kind: "overlay-dialog",
      explicitKey: popupPositionKey,
      testId: contentRef.current?.getAttribute("data-testid"),
      ariaLabel: typeof contentAriaLabel === "string" ? contentAriaLabel : null,
      title,
    });
    writePopupSessionPosition(key, dragOffsetRef.current);
  }, [contentAriaLabel, popupPositionKey]);

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
