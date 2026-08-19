import { useState } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateBooking, useAppointmentTypes } from "@/hooks/useBookingApi";
import { useUser } from "@clerk/react";
import { ArrowLeft, Check, AlertCircle, Loader2 } from "lucide-react";
import { BookingProgress } from "@/components/book/BookingProgress";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId:          p.get("locationId")          ?? "",
    locationName:        p.get("locationName")        ?? "",
    appointmentTypeID:   p.get("appointmentTypeID")   ?? "",
    appointmentTypeName: p.get("appointmentTypeName") ?? "",
    certificate:         p.get("certificate")         ?? "",
    date:                p.get("date")                ?? "",
    dateDisplay:         p.get("dateDisplay")         ?? "",
    datetime:            p.get("datetime")            ?? "",
    timeDisplay:         p.get("timeDisplay")         ?? "",
    /** Passed through from SelectDateTime so back-navigation goes to the correct screen. */
    from: p.get("from") ?? "book",
  };
}

function buildSelectDateTimeUrl(
  params: ReturnType<typeof getParams>,
  resolvedTypeName: string,
) {
  const q = new URLSearchParams({
    locationId:          params.locationId,
    locationName:        params.locationName,
    appointmentTypeID:   params.appointmentTypeID,
    appointmentTypeName: resolvedTypeName,
    ...(params.certificate ? { certificate: params.certificate } : {}),
    date:     params.date,
    datetime: params.datetime,
    from:     params.from,
  });
  return `/book/select-datetime?${q}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Confirm() {
  const [, setLocation] = useLocation();
  const params = getParams();
  const { user } = useUser();
  const clerkFirstName = user?.firstName?.trim() ?? "";
  const clerkLastName = user?.lastName?.trim() ?? "";
  const needsName = !clerkFirstName;
  const [bookingFirstName, setBookingFirstName] = useState("");
  const [bookingLastName, setBookingLastName] = useState(clerkLastName);

  // Resolve appointment type name: URL param → API lookup → neutral fallback.
  const { data: appointmentTypes = [] } = useAppointmentTypes();
  const appointmentTypeName =
    params.appointmentTypeName ||
    appointmentTypes.find((t) => String(t.id) === params.appointmentTypeID)?.name ||
    "Appointment";

  const { mutateAsync: createBooking, isPending } = useCreateBooking();
  const [submitError, setSubmitError] = useState("");

  const hasCertificate = !!params.certificate?.trim();

  // Progress steps
  const hasServiceStep = params.from === "select-service";
  const progressSteps  = hasServiceStep
    ? ["Location", "Service", "Date & Time", "Confirm"]
    : ["Location", "Date & Time", "Confirm"];

  async function handleConfirm() {
    if (isPending) return;
    setSubmitError("");
    try {
      const appt = await createBooking({
        locationId:        params.locationId,
        appointmentTypeID: Number(params.appointmentTypeID),
        datetime:          params.datetime,
        firstName: clerkFirstName || bookingFirstName.trim(),
        lastName:  clerkLastName || bookingLastName.trim(),
        email:     user?.primaryEmailAddress?.emailAddress ?? "",
        ...(hasCertificate ? { certificate: params.certificate } : {}),
      });

      // Replace the confirm entry in browser history so Back from Confirmed
      // cannot land the member on a live submit form.
      const confirmed = new URLSearchParams({
        appointmentType: appt.type ?? appointmentTypeName,
        dateDisplay:     params.dateDisplay,
        timeDisplay:     params.timeDisplay,
        locationName:    params.locationName,
        calendar:        appt.calendar ?? params.locationName,
      });
      setLocation(`/book/confirmed?${confirmed.toString()}`, { replace: true });
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
    }
  }

  // Session summary rows
  const summaryRows = [
    { label: "Service",  value: appointmentTypeName   },
    { label: "Date",     value: params.dateDisplay     },
    { label: "Time",     value: params.timeDisplay     },
    { label: "Location", value: params.locationName    },
  ].filter((row) => !!row.value);

  return (
    <Shell>
      {/* ── Back ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setLocation(buildSelectDateTimeUrl(params, appointmentTypeName))}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Date &amp; Time
      </button>

      {/* ── Progress ─────────────────────────────────────────────── */}
      <BookingProgress steps={progressSteps} currentStep="Confirm" />

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Confirm Booking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review your session details below.
        </p>
      </div>

      <div className="max-w-md space-y-4">
        {/* ── Session summary ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border divide-y divide-border">
          {summaryRows.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-6 px-5 py-3.5"
            >
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase shrink-0">
                {label}
              </p>
              <p className="text-sm font-semibold text-foreground text-right">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Certificate banner ───────────────────────────────────── */}
        {hasCertificate && (
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-400">Membership Applied</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Code: {params.certificate}
              </p>
            </div>
          </div>
        )}

        {/* ── Submit error ─────────────────────────────────────────── */}
        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* ── Missing profile name ─────────────────────────────────── */}
        {needsName && (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Add your name to complete booking</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your first name is required for the studio reservation.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="booking-first-name" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  First Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="booking-first-name"
                  value={bookingFirstName}
                  onChange={(event) => setBookingFirstName(event.target.value)}
                  autoComplete="given-name"
                  placeholder="First name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="booking-last-name" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Last Name <span className="text-muted-foreground font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <Input
                  id="booking-last-name"
                  value={bookingLastName}
                  onChange={(event) => setBookingLastName(event.target.value)}
                  autoComplete="family-name"
                  placeholder="Last name"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Cancellation policy ──────────────────────────────────── */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed px-2">
          Cancellations within 24 hours of the session may not receive a refund.
        </p>

        {/* ── Confirm CTA ──────────────────────────────────────────── */}
        <Button
          className="w-full gap-2 py-6 text-sm font-bold"
          disabled={isPending || (!clerkFirstName && !bookingFirstName.trim())}
          onClick={handleConfirm}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming…
            </>
          ) : (
            "Confirm Booking"
          )}
        </Button>
      </div>
    </Shell>
  );
}
