import { cn } from "@/lib/utils";

interface BookingProgressProps {
  /** Ordered list of step labels for this booking path. */
  steps: string[];
  /** Label of the step the member is currently on. */
  currentStep: string;
  className?: string;
}

/**
 * Compact booking progress indicator.
 *
 * Desktop: breadcrumb-style  Location › Service › Date & Time › Confirm
 * Mobile:  progress bar segments + current step name
 *
 * Only shows steps relevant to the member's actual path (Service step is
 * omitted when the member wasn't asked to choose a service).
 */
export function BookingProgress({
  steps,
  currentStep,
  className,
}: BookingProgressProps) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <nav aria-label="Booking progress" className={cn("mb-6", className)}>
      {/* ── Desktop: text breadcrumb ── */}
      <ol className="hidden md:flex items-center gap-1 text-xs" aria-label="Booking steps">
        {steps.map((step, i) => {
          const isPast    = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <li key={step} className="flex items-center gap-1">
              {i > 0 && (
                <span
                  className="text-muted-foreground/25 select-none mx-0.5"
                  aria-hidden="true"
                >
                  ›
                </span>
              )}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "transition-colors",
                  isCurrent
                    ? "text-foreground font-semibold"
                    : isPast
                    ? "text-muted-foreground/55"
                    : "text-muted-foreground/35",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ── Mobile: progress bars ── */}
      <div className="flex md:hidden items-center gap-1" aria-hidden="true">
        {steps.map((step, i) => (
          <div
            key={step}
            className={cn(
              "h-0.5 rounded-full flex-1 transition-all duration-300",
              i < currentIndex
                ? "bg-primary/40"
                : i === currentIndex
                ? "bg-primary"
                : "bg-border",
            )}
          />
        ))}
      </div>
    </nav>
  );
}
