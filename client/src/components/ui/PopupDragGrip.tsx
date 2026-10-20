import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

export function PopupDragGrip({ className }: { className?: string }) {
  return (
    <span
      data-popup-drag-grip="true"
      title="Drag to move"
      aria-hidden="true"
      className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/55", className)}
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}
