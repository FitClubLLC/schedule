import { useEffect } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetUpcomingAppointmentsQueryKey,
  getGetPastAppointmentsQueryKey,
  getGetAppointmentSummaryQueryKey,
} from "@workspace/api-client-react";
import { Calendar, Clock, MapPin, CheckCircle2 } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    appointmentType: p.get("appointmentType") ?? "Workout for 1",
    dateDisplay: p.get("dateDisplay") ?? "",
    timeDisplay: p.get("timeDisplay") ?? "",
    locationName: p.get("locationName") ?? "",
    calendar: p.get("calendar") ?? "",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Confirmed() {
  const [, setLocation] = useLocation();
  const params = getParams();
  const queryClient = useQueryClient();
  const displayLocation = params.calendar || params.locationName;

  // Invalidate appointment and certificate caches so the Sessions tab and
  // Dashboard summary reflect the newly-booked session immediately.
  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: getGetUpcomingAppointmentsQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getGetPastAppointmentsQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getGetAppointmentSummaryQueryKey(),
    });
    // Refresh member certificates so the remaining-session count is current.
    queryClient.invalidateQueries({ queryKey: ["booking", "certificates"] });
  }, []);

  return (
    <Shell>
      <div className="max-w-md mx-auto text-center pt-8 pb-16">
        {/* ── Success icon ─────────────────────────────────────────── */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
        </div>

        <h1 className="text-4xl font-display font-bold text-green-400 tracking-tight mb-2">
          You're Booked!
        </h1>
        <p className="text-muted-foreground mb-8">
          Your session has been confirmed.
        </p>

        {/* ── Summary card ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card text-left overflow-hidden mb-8">
          <div className="divide-y divide-border">
            <SummaryRow
              icon={<Clock className="w-4 h-4" />}
              value={params.appointmentType}
            />
            <SummaryRow
              icon={<Calendar className="w-4 h-4" />}
              value={
                params.dateDisplay && params.timeDisplay
                  ? `${params.dateDisplay} at ${params.timeDisplay}`
                  : params.dateDisplay || params.timeDisplay
              }
            />
            {displayLocation && (
              <SummaryRow
                icon={<MapPin className="w-4 h-4" />}
                value={displayLocation}
              />
            )}
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Button
            className="w-full gap-2 py-5 text-sm font-bold"
            onClick={() => setLocation("/appointments")}
          >
            <Calendar className="w-4 h-4" />
            View My Sessions
          </Button>
          <Button
            variant="outline"
            className="w-full py-5 text-sm font-bold"
            onClick={() => setLocation("/book")}
          >
            Book Another Session
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <p className="text-sm font-semibold text-left">{value}</p>
    </div>
  );
}
