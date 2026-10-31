import { AlertTriangle, X } from "lucide-react";
import { CABINET_CONFLICT_NOTICE_TEXT, cabinetConflictAdminHref } from "@/lib/cabinetConflictNotice";

/**
 * Admin-only, dismissible, non-blocking notice (no modal, no overlay, the canvas
 * stays interactive). Keyed on the master code.
 */
export default function CabinetConflictNotice({ masterCode, onDismiss }: { masterCode: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      data-testid="cabinet-conflict-notice"
      data-master-code={masterCode}
      className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-mono font-medium">{masterCode}</p>
          <p>{CABINET_CONFLICT_NOTICE_TEXT}</p>
          <a className="mt-1 inline-block font-medium underline" href={cabinetConflictAdminHref(masterCode)} target="_blank" rel="noopener noreferrer">
            Open in Admin &gt; Cabinet Conflict
          </a>
        </div>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="rounded p-0.5 hover:bg-amber-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
