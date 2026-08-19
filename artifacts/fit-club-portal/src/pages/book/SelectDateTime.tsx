import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth } from "date-fns";
import { Shell } from "@/components/layout/Shell";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useAvailableDates, useAvailableTimes, useAppointmentTypes } from "@/hooks/useBookingApi";
import { ArrowLeft, ChevronRight, Clock, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingProgress } from "@/components/book/BookingProgress";
import { formatStudioTime, studioHour } from "@/lib/studioTime";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimeSlot {
  time: string;
}

interface SlotGroup {
  label: string;
  slots: TimeSlot[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYMD(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Parse "YYYY-MM-DD" as a local-timezone Date without UTC-offset shifting.
 * parseISO("2026-08-20") yields midnight UTC, which can land on Aug 19 in
 * US timezones. This constructor stays in the local timezone.
 */
function parseDateParam(s: string): Date | undefined {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return undefined;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Bucket slots into Morning / Afternoon / Evening using the studio clock.
 * Only non-empty buckets are returned.
 */
function groupSlots(slots: TimeSlot[]): SlotGroup[] {
  const morning: TimeSlot[]   = [];
  const afternoon: TimeSlot[] = [];
  const evening: TimeSlot[]   = [];
  for (const slot of slots) {
    const hour = studioHour(slot.time);
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return [
    { label: "Morning",   slots: morning   },
    { label: "Afternoon", slots: afternoon },
    { label: "Evening",   slots: evening   },
  ].filter((g) => g.slots.length > 0);
}

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId:          p.get("locationId")          ?? "",
    locationName:        p.get("locationName")        ?? "",
    appointmentTypeID:   p.get("appointmentTypeID")   ?? "",
    appointmentTypeName: p.get("appointmentTypeName") ?? "",
    certificate:         p.get("certificate")         ?? "",
    /**
     * Where Back should navigate.
     * "select-service" → /book/select-service  (Service step was in the path)
     * anything else   → /book                  (direct from location cards)
     */
    from: p.get("from") ?? "book",
    /** Pre-selected date YYYY-MM-DD — restored when navigating back from Confirm. */
    date: p.get("date") ?? "",
    /** Pre-selected Acuity ISO datetime — restored when navigating back from Confirm. */
    datetime: p.get("datetime") ?? "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectDateTime() {
  const [, setLocation] = useLocation();
  const params = getParams();

  // ── Progress steps ──────────────────────────────────────────────────────────
  const hasServiceStep   = params.from === "select-service";
  const progressSteps    = hasServiceStep
    ? ["Location", "Service", "Date & Time", "Confirm"]
    : ["Location", "Date & Time", "Confirm"];
  const backLabel        = hasServiceStep ? "Back to Service" : "Back to Location";

  // ── Appointment type name ───────────────────────────────────────────────────
  // URL param → API lookup (cached) → neutral fallback.
  const { data: appointmentTypes = [] } = useAppointmentTypes();
  const appointmentTypeName =
    params.appointmentTypeName ||
    appointmentTypes.find((t) => String(t.id) === params.appointmentTypeID)?.name ||
    "Appointment";

  // ── Today reference ─────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Date state ──────────────────────────────────────────────────────────────
  const restoredDate = params.date ? parseDateParam(params.date) : undefined;
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    restoredDate ? startOfMonth(restoredDate) : startOfMonth(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(restoredDate);

  // ── Time state ──────────────────────────────────────────────────────────────
  const [selectedDatetime, setSelectedDatetime] = useState<string>(params.datetime);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const timePanelRef   = useRef<HTMLDivElement>(null);
  const prevDateKeyRef = useRef<string>(params.date);

  // ── Available-dates query ───────────────────────────────────────────────────
  const monthStr = format(currentMonth, "yyyy-MM");

  const {
    data: availableDates = [],
    isLoading: datesLoading,
    isError: datesError,
    refetch: refetchDates,
  } = useAvailableDates(
    params.locationId && params.appointmentTypeID
      ? {
          locationId:        params.locationId,
          appointmentTypeID: Number(params.appointmentTypeID),
          month:             monthStr,
        }
      : null,
  );

  // ── Available-times query ───────────────────────────────────────────────────
  const {
    data: slots = [],
    isLoading: timesLoading,
    isError: timesError,
    refetch: refetchTimes,
  } = useAvailableTimes(
    params.locationId && params.appointmentTypeID && selectedDate
      ? {
          locationId:        params.locationId,
          appointmentTypeID: Number(params.appointmentTypeID),
          date:              toYMD(selectedDate),
        }
      : null,
  );

  const availableSet = new Set(availableDates);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Clear the selected time when the date changes.
  // Skip clearing on initial mount when restoring state from Confirm
  // (prevDateKeyRef starts at params.date, matching the restored selectedDate).
  useEffect(() => {
    const newKey = selectedDate ? toYMD(selectedDate) : "";
    if (newKey !== prevDateKeyRef.current) {
      prevDateKeyRef.current = newKey;
      setSelectedDatetime("");
    }
  }, [selectedDate]);

  // Invalidate a restored time if the slot is no longer in the loaded list.
  useEffect(() => {
    if (timesLoading || !selectedDatetime) return;
    if (!slots.some((s) => s.time === selectedDatetime)) {
      setSelectedDatetime("");
    }
  }, [slots, timesLoading, selectedDatetime]);

  // On mobile: scroll the time panel into view after a date is selected.
  useEffect(() => {
    if (!selectedDate || !timePanelRef.current) return;
    if (window.innerWidth >= 1024) return;
    const id = setTimeout(() => {
      timePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(id);
  }, [selectedDate]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleMonthChange(month: Date) {
    setCurrentMonth(month);
    setSelectedDate(undefined);
  }

  function buildBackUrl(): string {
    if (params.from === "select-service") {
      const q = new URLSearchParams({
        locationId:   params.locationId,
        locationName: params.locationName,
        ...(params.certificate ? { certificate: params.certificate } : {}),
      });
      return `/book/select-service?${q}`;
    }
    return "/book";
  }

  function handleContinue() {
    if (!selectedDatetime || !selectedDate) return;
    const timeDisplay = formatStudioTime(selectedDatetime);
    const next = new URLSearchParams({
      locationId:          params.locationId,
      locationName:        params.locationName,
      appointmentTypeID:   params.appointmentTypeID,
      appointmentTypeName: appointmentTypeName,
      ...(params.certificate ? { certificate: params.certificate } : {}),
      date:        toYMD(selectedDate),
      dateDisplay: format(selectedDate, "EEEE, MMMM d"),
      datetime:    selectedDatetime,
      timeDisplay,
      from:        params.from,
    });
    setLocation(`/book/confirm?${next.toString()}`);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const noAvailability = !datesLoading && !datesError && availableDates.length === 0;
  const noTimes        = !timesLoading && !timesError && !!selectedDate && slots.length === 0;
  const groups         = groupSlots(slots);

  // Mobile CTA label
  const ctaLabel =
    selectedDatetime && selectedDate
      ? `Continue · ${format(selectedDate, "EEE, MMM d")} at ${formatStudioTime(selectedDatetime)}`
      : "Select a time to continue";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* pb-24 lg:pb-0: prevent sticky mobile CTA from obscuring content */}
      <div className="pb-24 lg:pb-0">

        {/* ── Back ─────────────────────────────────────────── */}
        <button
          onClick={() => setLocation(buildBackUrl())}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>

        {/* ── Progress ──────────────────────────────────────── */}
        <BookingProgress steps={progressSteps} currentStep="Date & Time" />

        {/* ── Screen header ─────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Choose Your Time
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {params.locationName}
            {appointmentTypeName && appointmentTypeName !== "Appointment"
              ? ` · ${appointmentTypeName}`
              : ""}
          </p>
        </div>

        {/* ── Cohesive two-panel container ──────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">

            {/* ── LEFT: Calendar ─────────────────────────── */}
            <div className="p-5 sm:p-6">
              {datesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm">Loading availability…</span>
                </div>
              ) : datesError ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                  <span className="text-sm">Could not load availability.</span>
                  <Button variant="outline" size="sm" onClick={() => refetchDates()}>
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
                    className="w-full [--cell-size:2.75rem] sm:[--cell-size:3rem] mx-auto"
                  />

                  {noAvailability && (
                    <div className="text-center pt-4 pb-1 text-sm text-muted-foreground space-y-2">
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

            {/* ── RIGHT: Time selection ───────────────────── */}
            <div
              ref={timePanelRef}
              className="p-5 border-t border-border lg:border-t-0 lg:border-l flex flex-col"
            >
              {/* No date selected */}
              {!selectedDate && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-muted-foreground flex-1">
                  <Clock className="w-6 h-6 opacity-30" />
                  <p className="text-sm">Select an available date to see times.</p>
                </div>
              )}

              {/* Date selected */}
              {selectedDate && (
                <div className="flex flex-col gap-5 flex-1">
                  {/* Date label */}
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                    {format(selectedDate, "EEEE, MMMM d").toUpperCase()}
                  </p>

                  {/* Loading */}
                  {timesLoading && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-sm">Loading times…</span>
                    </div>
                  )}

                  {/* Error */}
                  {timesError && (
                    <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                      <AlertCircle className="w-5 h-5 text-destructive" />
                      <span className="text-sm">Could not load times.</span>
                      <Button variant="outline" size="sm" onClick={() => refetchTimes()}>
                        Try Again
                      </Button>
                    </div>
                  )}

                  {/* No times */}
                  {noTimes && (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <Clock className="w-5 h-5 opacity-30" />
                      <span className="text-sm">No times available on this date.</span>
                    </div>
                  )}

                  {/* Time groups */}
                  {!timesLoading && !timesError && groups.length > 0 && (
                    <div className="space-y-5">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-2">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {group.slots.map((slot) => {
                              const isSelected = slot.time === selectedDatetime;
                              return (
                                <button
                                  key={slot.time}
                                  onClick={() => setSelectedDatetime(slot.time)}
                                  aria-pressed={isSelected}
                                  className={cn(
                                    "px-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors duration-150",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-transparent border-border hover:border-primary/40 hover:bg-white/[0.04] text-foreground",
                                  )}
                                >
                                  {formatStudioTime(slot.time)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Desktop Continue CTA */}
                  <div className="mt-auto pt-5 border-t border-border/50 hidden lg:block">
                    <Button
                      className="w-full gap-2 font-bold"
                      disabled={!selectedDatetime}
                      onClick={handleContinue}
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Desktop CTA when no date selected yet */}
              {!selectedDate && (
                <div className="pt-5 border-t border-border/50 mt-auto hidden lg:block">
                  <Button
                    className="w-full gap-2 font-bold"
                    disabled
                    aria-label="Select a date and time to continue"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky mobile CTA ────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-4 z-50 safe-area-bottom">
        <Button
          className="w-full gap-2 font-bold text-sm"
          disabled={!selectedDatetime}
          onClick={handleContinue}
          aria-live="polite"
        >
          {ctaLabel}
        </Button>
      </div>
    </Shell>
  );
}
