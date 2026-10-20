import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";
import { PopupDragGrip } from "./PopupDragGrip";
import { clampPopupSessionPosition, popupSessionPositionKey, readPopupSessionPosition, writePopupSessionPosition } from "./popupSessionPosition";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    []
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  hideOverlay = false,
  onEscapeKeyDown,
  style,
  onPointerDownCapture,
  onPointerMove,
  onPointerUp,
  popupPositionKey,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** Use only for explicitly non-modal tools that must leave an underlying workspace interactive. */
  hideOverlay?: boolean;
  /** Optional stable identity for remembering this popup’s position within the browser session. */
  popupPositionKey?: string;
}) {
  const { isComposing } = useDialogComposition();
  const dragOriginRef = React.useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const dragOffsetRef = React.useRef(dragOffset);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);
  const contentAriaLabel = props["aria-label"];
  const setContentRef = React.useCallback((element: HTMLDivElement | null) => {
    contentRef.current = element;
    setContentElement(element);
  }, []);

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
    if (!contentElement) return;
    const title = contentElement.querySelector("[data-slot='dialog-title']")?.textContent;
    const key = popupSessionPositionKey({
      kind: "dialog",
      explicitKey: popupPositionKey,
      testId: contentElement.getAttribute("data-testid"),
      ariaLabel: typeof contentAriaLabel === "string" ? contentAriaLabel : null,
      title,
    });
    const remembered = readPopupSessionPosition(key);
    if (remembered) setRememberedOffset(remembered);
  }, [contentAriaLabel, contentElement, popupPositionKey, setRememberedOffset]);

  const handleEscapeKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      // Check both the native isComposing property and our context state
      // This handles Safari's timing issues with composition events
      const isCurrentlyComposing = (e as any).isComposing || isComposing();

      // If IME is composing, prevent dialog from closing
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }

      // Call user's onEscapeKeyDown if provided
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  const handlePointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDownCapture?.(event);
    if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof HTMLElement)) return;
    const handle = event.target.closest("[data-dialog-drag-handle]");
    const interactive = event.target.closest("button, a, input, textarea, select, [role='button']");
    if (!handle || interactive) return;
    dragOriginRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: dragOffsetRef.current.x, startY: dragOffsetRef.current.y };
    // Pointer Capture keeps the drag alive when the pointer leaves the popup.
    // It is unavailable in a few embedded/web-test environments, where normal
    // bubbling still supplies the move events we can use safely.
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }, [onPointerDownCapture]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setRememberedOffset({ x: origin.startX + event.clientX - origin.x, y: origin.startY + event.clientY - origin.y });
  }, [onPointerMove, setRememberedOffset]);

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerUp?.(event);
    if (dragOriginRef.current?.pointerId !== event.pointerId) return;
    dragOriginRef.current = null;
    const title = contentRef.current?.querySelector("[data-slot='dialog-title']")?.textContent;
    const key = popupSessionPositionKey({
      kind: "dialog",
      explicitKey: popupPositionKey,
      testId: contentRef.current?.getAttribute("data-testid"),
      ariaLabel: typeof contentAriaLabel === "string" ? contentAriaLabel : null,
      title,
    });
    writePopupSessionPosition(key, dragOffsetRef.current);
  }, [contentAriaLabel, onPointerUp, popupPositionKey]);

  return (
    <DialogPortal data-slot="dialog-portal">
      {!hideOverlay && <DialogOverlay />}
      <DialogPrimitive.Content
        ref={setContentRef}
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
	        // Tailwind v4 implements the centering utilities through the individual
	        // CSS translate property. Preserve that -50% center offset while adding
	        // a drag delta; replacing it with only pixel values made every dialog
	        // open with its top-left corner at the screen center.
	        style={{ ...style, translate: `calc(-50% + ${dragOffset.x}px) calc(-50% + ${dragOffset.y}px)` }}
        onEscapeKeyDown={handleEscapeKeyDown}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      data-dialog-drag-handle="true"
      title="Drag this popup"
      className={cn("flex cursor-grab flex-col gap-2 select-none text-center active:cursor-grabbing sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      data-dialog-drag-handle="true"
      title="Drag this popup"
      className={cn("flex cursor-grab select-none items-center gap-1.5 text-lg leading-none font-semibold active:cursor-grabbing", className)}
      {...props}
    >
      <PopupDragGrip />
      {children}
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
};
