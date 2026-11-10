import { Button } from "@/components/ui/button";

/** Shown in place of salesperson tools until the four Job Boarding steps are done. */
export function JobBoardingLock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "rounded-md border bg-muted/40 p-4" : "container max-w-lg py-16"}>
      <h1 className="font-serif text-2xl font-bold">Job Boarding is not finished</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Salesperson tools stay closed until your information, non-compete, W-9, and government ID are complete.
      </p>
      <a href="/job-boarding" className="mt-4 inline-block">
        <Button>Open Job Boarding</Button>
      </a>
    </div>
  );
}
