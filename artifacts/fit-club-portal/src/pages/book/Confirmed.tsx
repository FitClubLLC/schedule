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
    appointmentType: p.get("appointmentType") ?? "Appointment",
    dateDisplay:     p.get("dateDisplay")     ?? "",
    timeDisplay:     p.get("timeDisplay")     ?? "",
    locationName:    p.get("locationName")    ?? "",
    calendar:        p.get("calendar")        ?? "",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Confirmed() {
  const [, setLocation] = useLocation();
  const params          = getParams();
  const queryClient     = useQueryClient();
  const displayLocation = params.calendar || params.locationName;

  // Invalidate appointment and certificate caches so Sessions and Dashboard
  // reflect the newly-booked session immediately.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPastAppointmentsQueryKey()    });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey()  });
    queryClient.invalidateQueries({ queryKey: ["booking", "certificates"]         });
  }, []);

  return (
    <Shell>
      <div className="max-w-sm mx-auto text-center pt-10 pb-16">
        {/* ── Success icon ─────────────────────────────────────────── */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
        </div>

        {/* ── Headline ─────────────────────────────────────────────── */}
        <h1 className="text-3xl font-display font-bold text-green-400 tracking-tight">
          You're Booked!
        </h1>
        <p className="text-sm text-muted-foreground mt-2 mb-8">
          A confirmation is on its way.
        </p>

        {/* ── Session summary ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border divide-y divide-border text-left mb-8">
          {params.appointmentType && (
            <SummaryRow
              icon={<Clock className="w-3.5 h-3.5" />}
              value={params.appointmentType}
            />
          )}
          {params.dateDisplay && (
            <SummaryRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              value={params.dateDisplay}
            />
          )}
          {params.timeDisplay && (
            <SummaryRow
              icon={<Clock className="w-3.5 h-3.5 opacity-0" />}
              value={params.timeDisplay}
              muted
            />
          )}
          {displayLocation && (
            <SummaryRow
              icon={<MapPin className="w-3.5 h-3.5" />}
              value={displayLocation}
            />
          )}
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
  muted = false,
}: {
  icon: React.ReactNode;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className={muted ? "text-transparent" : "text-muted-foreground shrink-0"}>
        {icon}
      </span>
      <p className={muted ? "text-sm text-muted-foreground" : "text-sm font-semibold text-foreground"}>
        {value}
      </p>
    </div>
  );
}
