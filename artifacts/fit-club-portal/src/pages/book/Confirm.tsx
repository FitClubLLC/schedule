import { useState } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { useCreateBooking } from "@/hooks/useBookingApi";
import { useUser } from "@clerk/react";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";

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
    datetime: p.get("datetime") ?? "",
    timeDisplay: p.get("timeDisplay") ?? "",
  };
}

function buildSelectTimeUrl(params: ReturnType<typeof getParams>) {
  const q = new URLSearchParams({
    locationId: params.locationId,
    locationName: params.locationName,
    appointmentTypeID: params.appointmentTypeID,
    appointmentTypeName: params.appointmentTypeName,
    ...(params.certificate ? { certificate: params.certificate } : {}),
    date: params.date,
    dateDisplay: params.dateDisplay,
  });
  return `/book/select-time?${q}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Confirm() {
  const [, setLocation] = useLocation();
  const params = getParams();
  const { user } = useUser();
  const { mutateAsync: createBooking, isPending } = useCreateBooking();
  const [submitError, setSubmitError] = useState("");

  // Identity comes from the authenticated Clerk session — the server derives
  // name/email server-side and ignores any client-submitted values. We include
  // them here only to satisfy the BookingPayload type; they are not used.
  const memberName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Member";
  const memberEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const hasCertificate = !!params.certificate?.trim();

  async function handleConfirm() {
    if (isPending) return;
    setSubmitError("");
    try {
      const appt = await createBooking({
        locationId: params.locationId,
        appointmentTypeID: Number(params.appointmentTypeID),
        datetime: params.datetime,
        // Included for type compliance; the backend ignores client-submitted
        // identity and re-derives it from the Clerk session.
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        email: memberEmail,
        ...(hasCertificate ? { certificate: params.certificate } : {}),
      });

      // Replace the confirm entry in browser history so pressing Back from
      // the confirmed screen cannot land the member back on a live submit form.
      const confirmed = new URLSearchParams({
        appointmentType: appt.type ?? params.appointmentTypeName,
        dateDisplay: params.dateDisplay,
        timeDisplay: params.timeDisplay,
        locationName: params.locationName,
        calendar: appt.calendar ?? params.locationName,
      });
      setLocation(`/book/confirmed?${confirmed.toString()}`, {
        replace: true,
      });
    } catch (err: any) {
      setSubmitError(
        err?.message ?? "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <Shell>
      {/* ── Back ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(buildSelectTimeUrl(params))}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Review Booking
        </h1>
        <p className="text-muted-foreground mt-1">
          Confirm your session details below
        </p>
      </div>

      <div className="max-w-lg space-y-4">
        {/* ── Session details ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Session
            </p>
          </div>
          <div className="divide-y divide-border">
            <DetailRow
              icon={<Clock className="w-4 h-4" />}
              label={params.appointmentTypeName}
              sub={params.locationName}
            />
            <DetailRow
              icon={<Calendar className="w-4 h-4" />}
              label={params.dateDisplay}
              sub={params.timeDisplay}
            />
            <DetailRow
              icon={<MapPin className="w-4 h-4" />}
              label="Location"
              sub={params.locationName}
            />
          </div>
        </div>

        {/* ── Member details ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Details
            </p>
          </div>
          <div className="divide-y divide-border">
            <DetailRow
              icon={<User className="w-4 h-4" />}
              label={memberName}
              sub={memberEmail}
            />
          </div>
        </div>

        {/* ── Certificate ─────────────────────────────────────────── */}
        {hasCertificate && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-400">
                Membership Applied
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Code: {params.certificate}
              </p>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {submitError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* ── Policy note ─────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground text-center px-4 leading-relaxed">
          Cancellations within 24 hours of the session may not receive a
          refund.
        </p>

        {/* ── Confirm button ──────────────────────────────────────── */}
        <Button
          className="w-full gap-2 py-6 text-sm font-bold"
          disabled={isPending}
          onClick={handleConfirm}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
            </>
          ) : (
            "Confirm Booking"
          )}
        </Button>
      </div>
    </Shell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{label}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
        )}
      </div>
    </div>
  );
}
