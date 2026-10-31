import { PREVIEW_BADGE_TEXT } from "@shared/distributorPreview";

/**
 * Marks a supplier, or one of its door styles, that is offline and only visible to admins.
 * Live suppliers never render this.
 */
export function AdminPreviewBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="admin-preview-badge"
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300 ${className}`}
    >
      {PREVIEW_BADGE_TEXT}
    </span>
  );
}
