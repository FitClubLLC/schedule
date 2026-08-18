import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth, parseISO } from "date-fns";
import { Shell } from "@/components/layout/Shell";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useAvailableDates, useAvailableTimes, useAppointmentTypes } from "@/hooks/useBookingApi";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Loader2,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
 * Parse a "YYYY-MM-DD" string into a local-timezone Date without UTC-offset
 * shifting (parseISO("2026-08-20") yields midnight UTC, which can land on
 * Aug 19 in US timezones).
 */
function parseDateParam(s: string): Date | undefined {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return undefined;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Group time slots into Morning / Afternoon / Evening buckets using the
 * local hour of the ISO datetime string Acuity returns.
 * Only groups with ≥1 slot are included in the output.
 */
function groupSlots(slots: TimeSlot[]): SlotGroup[] {
  const morning: TimeSlot[] = [];
  const afternoon: TimeSlot[] = [];
  const evening: TimeSlot[] = [];
  for (const slot of slots) {
    const hour = parseISO(slot.time).getHours();
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return [
    { label: "Morning", slots: morning },
    { label: "Afternoon", slots: afternoon },
    { label: "Evening", slots: evening },
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
     * Where the Back button should go.
     * "select-service" → /book/select-service  (member came via service selector)
     * anything else   → /book                  (member came directly from location cards)
     */
    from: p.get("from") ?? "book",
    /** Pre-selected date (YYYY-MM-DD) — restored when navigating back from Confirm. */
    date: p.get("date") ?? "",
    /** Pre-selected Acuity datetime ISO string — restored when navigating back from Confirm. */
    datetime: p.get("datetime") ?? "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectDateTime() {
  const [, setLocation] = useLocation();
  const params = getParams();

  // ── Resolve appointment type name ───────────────────────────────────────────
  // URL param (set by caller) → API lookup (cached) → neutral fallback.
  const { data: appointmentTypes = [] } = useAppointmentTypes();
  const appointmentTypeName =
    params.appointmentTypeName ||
    appointmentTypes.find((t) => String(t.id) === params.appointmentTypeID)?.name ||
    "Appointment";

  // ── Today reference ─────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  // ── Date state ──────────────────────────────────────────────────────────────
  // Restore from URL param when the member navigates back from Confirm.
  const restoredDate = params.date ? parseDateParam(params.date) : undefined;

  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    restoredDate ? startOfMonth(restoredDate) : startOfMonth(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(restoredDate);

  // ── Time state ──────────────────────────────────────────────────────────────
  // Restore from URL param when the member navigates back from Confirm so
  // their previous time selection is immediately visible.
  const [selectedDatetime, setSelectedDatetime] = useState<string>(params.datetime);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const timePanelRef = useRef<HTMLDivElement>(null);
  // Track the previously selected date so we can detect actual changes.
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
  // Only fires after the member has selected a date.
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
  // Skip clearing on initial mount if we're restoring state from Confirm
  // (prevDateKeyRef starts at params.date, same as selectedDate).
  useEffect(() => {
    const newKey = selectedDate ? toYMD(selectedDate) : "";
    if (newKey !== prevDateKeyRef.current) {
      prevDateKeyRef.current = newKey;
      setSelectedDatetime("");
    }
  }, [selectedDate]);

  // Invalidate a restored time selection if the slot is no longer available
  // (e.g. another member booked it while this member was reviewing).
  useEffect(() => {
    if (timesLoading || !selectedDatetime) return;
    if (!slots.some((s) => s.time === selectedDatetime)) {
      setSelectedDatetime("");
    }
  }, [slots, timesLoading, selectedDatetime]);

  // On mobile, scroll the time panel into view after a date is selected.
  // Only fires when selectedDate changes (not on every slot reload).
  useEffect(() => {
    if (!selectedDate || !timePanelRef.current) return;
    if (window.innerWidth >= 1024) return; // desktop uses two-column layout
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
    const timeDisplay = format(parseISO(selectedDatetime), "h:mm a");
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
      // Pass 'from' forward so Confirm can build the correct back URL.
      from: params.from,
    });
    setLocation(`/book/confirm?${next.toString()}`);
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const noAvailability = !datesLoading && !datesError && availableDates.length === 0;
  const noTimes        = !timesLoading && !timesError && !!selectedDate && slots.length === 0;
  const groups         = groupSlots(slots);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* pb-24 lg:pb-0 — prevents the sticky mobile CTA from obscuring content */}
      <div className="pb-24 lg:pb-0">

        {/* ── Back ────────────────────────────────────────────────── */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(buildBackUrl())}
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        {/* ── Booking context strip ────────────────────────────────── */}
        <div className="flex items-center gap-6 mb-8 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase leading-none mb-0.5">
                Location
              </p>
              <p className="text-sm font-semibold text-foreground leading-snug">
                {params.locationName || "—"}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase leading-none mb-0.5">
                Service
              </p>
              <p className="text-sm font-semibold text-foreground leading-snug">
                {appointmentTypeName}
              </p>
            </div>
          </div>
        </div>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">
            Select Date &amp; Time
          </h1>
          <p className="text-muted-foreground mt-1">
            Choose an available date, then select a time.
          </p>
        </div>

        {/* ── Two-column layout ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── LEFT: Calendar ──────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            {datesLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <span className="text-sm">Loading availability…</span>
              </div>
            ) : datesError ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                <AlertCircle className="w-7 h-7 text-destructive" />
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
                  modifiers={{
                    available: (date) =>
                      date >= today && availableSet.has(toYMD(date)),
                    today: (date) => toYMD(date) === todayYMD,
                  }}
                  modifiersClassNames={{
                    available: "border border-primary/50 rounded-md text-primary font-semibold",
                    today:     "ring-1 ring-primary/60 ring-inset",
                  }}
                  className="w-full [--cell-size:2.75rem] sm:[--cell-size:3rem] mx-auto"
                />

                {noAvailability && (
                  <div className="text-center pt-4 pb-2 text-sm text-muted-foreground space-y-2">
                    <p>No availability in {format(currentMonth, "MMMM yyyy")}.</p>
                    <button
                      onClick={() =>
                        handleMonthChange(
                          new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
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

          {/* ── RIGHT: Time selection ────────────────────────────── */}
          <div ref={timePanelRef} className="lg:sticky lg:top-8 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 min-h-[180px]">

              {/* No date selected yet */}
              {!selectedDate && (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-center text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">Choose a date</p>
                  <p className="text-sm">Select an available date to see appointment times.</p>
                </div>
              )}

              {/* Date selected — show times */}
              {selectedDate && (
                <>
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-4">
                    {format(selectedDate, "EEEE, MMMM d").toUpperCase()}
                  </p>

                  {timesLoading && (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-sm">Loading times…</span>
                    </div>
                  )}

                  {timesError && (
                    <div className="flex flex-col items-center justify-center py-10 gap-4 text-muted-foreground">
                      <AlertCircle className="w-6 h-6 text-destructive" />
                      <span className="text-sm">Could not load times for this date.</span>
                      <Button variant="outline" size="sm" onClick={() => refetchTimes()}>
                        Try Again
                      </Button>
                    </div>
                  )}

                  {noTimes && (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                      <Clock className="w-6 h-6" />
                      <span className="text-sm">No times available on this date.</span>
                    </div>
                  )}

                  {!timesLoading && !timesError && groups.length > 0 && (
                    <div className="space-y-5">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-2">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {group.slots.map((slot) => {
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
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Desktop CTA — hidden on mobile (sticky bar handles it) */}
            <Button
              className="w-full gap-2 py-6 text-sm font-bold hidden lg:flex"
              disabled={!selectedDatetime}
              onClick={handleContinue}
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Sticky mobile CTA ────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-4 z-50">
        <Button
          className="w-full gap-2 py-6 text-sm font-bold"
          disabled={!selectedDatetime}
          onClick={handleContinue}
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </Shell>
  );
}
