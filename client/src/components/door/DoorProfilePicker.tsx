import type { DoorProfileOption } from "@shared/doorProfiles";

/**
 * Inline picture picker: each option is a clickable thumbnail (small
 * cross-section drawing + short label). Clicking the selected one clears it
 * (back to "unset"), so nothing is ever forced to a guessed value.
 */
export default function DoorProfilePicker<Id extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: readonly DoorProfileOption<Id>[];
  value: string;
  onChange: (next: Id | "") => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-sm font-medium">{label}{!value && <span className="ml-2 text-xs font-normal text-muted-foreground">Unset</span>}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-option={option.id}
              onClick={() => onChange(selected ? "" : option.id)}
              className={`flex w-[5.25rem] flex-col items-center gap-1 rounded-md border p-1.5 text-center text-[11px] leading-tight transition ${selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600" : "border-border bg-background hover:bg-muted"}`}
            >
              <svg viewBox="0 0 24 16" className="h-9 w-full" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                <path d={option.svgPath} />
              </svg>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
