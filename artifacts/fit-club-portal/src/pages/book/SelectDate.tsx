import { useState } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth } from "date-fns";
import { Shell } from "@/components/layout/Shell";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useAvailableDates, useAppointmentTypes } from "@/hooks/useBookingApi";
import {
  ArrowLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId: p.get("locationId") ?? "",
    locationName: p.get("locationName") ?? "",
    appointmentTypeID: p.get("appointmentTypeID") ?? "",
    appointmentTypeName: p.get("appointmentTypeName") ?? "",
    certificate: p.get("certificate") ?? "",
  };
}

function toYMD(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SelectDate() {
  const [, setLocation] = useLocation();
  const params = getParams();

  // Resolve the appointment type name from URL param (set by Book.tsx or SelectService) →
  // API lookup (already cached) → neutral fallback.
  // This prevents a stale "Workout for 1" label if the param is absent.
  const { data: appointmentTypes = [] } = useAppointmentTypes();
  const appointmentTypeName =
    params.appointmentTypeName ||
    appointmentTypes.find((t) => String(t.id) === params.appointmentTypeID)?.name ||
    "Appointment";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Track the visible calendar month for availability fetching.
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const monthStr = format(currentMonth, "yyyy-MM");

  const {
    data: availableDates = [],
    isLoading,
    isError,
    refetch,
  } = useAvailableDates(
    params.locationId && params.appointmentTypeID
      ? {
          locationId: params.locationId,
          appointmentTypeID: Number(params.appointmentTypeID),
          month: monthStr,
        }
      : null,
  );

  const availableSet = new Set(availableDates);

  function handleMonthChange(month: Date) {
    setCurrentMonth(month);
    // Clear selection whenever the month changes — the selected date may
    // not be available in the new month.
    setSelectedDate(undefined);
  }

  function handleContinue() {
    if (!selectedDate) return;
    const ymd = toYMD(selectedDate);
    const dateDisplay = format(selectedDate, "EEEE, MMMM d");
    const next = new URLSearchParams({
      locationId: params.locationId,
      locationName: params.locationName,
      appointmentTypeID: params.appointmentTypeID,
      appointmentTypeName: appointmentTypeName,
      ...(params.certificate ? { certificate: params.certificate } : {}),
      date: ymd,
      dateDisplay,
    });
    setLocation(`/book/select-time?${next.toString()}`);
  }

  const noAvailability = !isLoading && !isError && availableDates.length === 0;

  return (
    <Shell>
      {/* ── Back ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/book")}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Book
        </Button>
      </div>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Select a Date
        </h1>
        <p className="text-muted-foreground mt-1">
          {params.locationName}
          {appointmentTypeName ? ` · ${appointmentTypeName}` : ""}
        </p>
      </div>

      {/* ── Layout ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

        {/* ── Calendar card ────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <span className="text-sm">Loading availability…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
              <AlertCircle className="w-7 h-7 text-destructive" />
              <span className="text-sm">Could not load availability.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : (
            <>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={currentMonth}
                onMonthChange={handleMonthChange}
                disabled={(date) => {
                  if (date < today) return true;
                  return !availableSet.has(toYMD(date));
                }}
                modifiers={{
                  available: (date) =>
                    date >= today && availableSet.has(toYMD(date)),
                }}
                modifiersClassNames={{
                  available:
                    "border border-primary/50 rounded-md text-primary font-semibold",
                }}
                className="w-full [--cell-size:2.75rem] sm:[--cell-size:3rem] mx-auto"
              />

              {noAvailability && (
                <div className="text-center pt-4 pb-2 text-sm text-muted-foreground space-y-2">
                  <p>No availability in {format(currentMonth, "MMMM yyyy")}.</p>
                  <button
                    onClick={() =>
                      handleMonthChange(
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                    className="text-primary underline-offset-4 hover:underline font-semibold text-sm"
                  >
                    Check next month →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Side panel ──────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-8">
          {/* Selected date summary */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Selected Date
                </p>
                {selectedDate ? (
                  <p className="text-base font-bold leading-snug">
                    {format(selectedDate, "EEEE, MMMM d")}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tap an available date on the calendar
                  </p>
                )}
              </div>
            </div>
          </div>

          <Button
            className="w-full gap-2 py-6 text-sm font-bold"
            disabled={!selectedDate}
            onClick={handleContinue}
          >
            Select Time
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Shell>
  );
}
