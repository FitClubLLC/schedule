import { useState } from "react";
import { useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { useAvailableTimes } from "@/hooks/useBookingApi";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId: p.get("locationId") ?? "",
    locationName: p.get("locationName") ?? "",
    appointmentTypeID: p.get("appointmentTypeID") ?? "",
    appointmentTypeName: p.get("appointmentTypeName") ?? "Workout for 1",
    certificate: p.get("certificate") ?? "",
    date: p.get("date") ?? "",
    dateDisplay: p.get("dateDisplay") ?? "",
  };
}

function buildSelectDateUrl(params: ReturnType<typeof getParams>) {
  const q = new URLSearchParams({
    locationId: params.locationId,
    locationName: params.locationName,
    appointmentTypeID: params.appointmentTypeID,
    appointmentTypeName: params.appointmentTypeName,
    ...(params.certificate ? { certificate: params.certificate } : {}),
  });
  return `/book/select-date?${q}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SelectTime() {
  const [, setLocation] = useLocation();
  const params = getParams();
  const [selectedDatetime, setSelectedDatetime] = useState<string>("");

  // React Query automatically scopes each (locationId, appointmentTypeID, date)
  // combination to its own cache entry. There is no stale-overwrite risk when
  // the user navigates back and picks a different date — each date gets its
  // own queryKey and the component re-renders with the correct data.
  const {
    data: slots = [],
    isLoading,
    isError,
    refetch,
  } = useAvailableTimes(
    params.locationId && params.appointmentTypeID && params.date
      ? {
          locationId: params.locationId,
          appointmentTypeID: Number(params.appointmentTypeID),
          date: params.date,
        }
      : null,
  );

  function handleContinue() {
    if (!selectedDatetime) return;
    const timeDisplay = format(parseISO(selectedDatetime), "h:mm a");
    const next = new URLSearchParams({
      locationId: params.locationId,
      locationName: params.locationName,
      appointmentTypeID: params.appointmentTypeID,
      appointmentTypeName: params.appointmentTypeName,
      ...(params.certificate ? { certificate: params.certificate } : {}),
      date: params.date,
      dateDisplay: params.dateDisplay,
      datetime: selectedDatetime,
      timeDisplay,
    });
    setLocation(`/book/confirm?${next.toString()}`);
  }

  return (
    <Shell>
      {/* ── Back ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(buildSelectDateUrl(params))}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Select a Time
        </h1>
        <p className="text-muted-foreground mt-1">
          {params.dateDisplay}
          {params.locationName ? ` · ${params.locationName}` : ""}
        </p>
      </div>

      <div className="max-w-2xl">
        {/* ── Slots card ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Available Times
          </p>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-sm">Loading available times…</span>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center py-14 gap-4 text-muted-foreground">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <span className="text-sm">
                Could not load times for this date.
              </span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          )}

          {!isLoading && !isError && slots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-4 text-muted-foreground">
              <Clock className="w-6 h-6" />
              <span className="text-sm">
                No times available on {params.dateDisplay}.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(buildSelectDateUrl(params))}
              >
                Pick Another Date
              </Button>
            </div>
          )}

          {!isLoading && !isError && slots.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {slots.map((slot) => {
                const isSelected = slot.time === selectedDatetime;
                return (
                  <button
                    key={slot.time}
                    onClick={() => setSelectedDatetime(slot.time)}
                    className={cn(
                      "px-2 py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-150",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary/50 hover:bg-primary/5 text-foreground",
                    )}
                  >
                    {format(parseISO(slot.time), "h:mm a")}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Continue ─────────────────────────────────────────────── */}
        <Button
          className="w-full gap-2 py-6 text-sm font-bold"
          disabled={!selectedDatetime}
          onClick={handleContinue}
        >
          Review Booking
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </Shell>
  );
}
