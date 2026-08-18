import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Clock, Loader2, AlertCircle } from "lucide-react";
import {
  useAcuityConfig,
  useMemberCertificates,
  useCertificateCheck,
  useAppointmentTypes,
  type AppointmentType,
} from "@/hooks/useBookingApi";
import { getEligibleTypeIds } from "@/lib/bookingEligibility";
import { BookingProgress } from "@/components/book/BookingProgress";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId:   p.get("locationId")   ?? "",
    locationName: p.get("locationName") ?? "",
    certificate:  p.get("certificate")  ?? "",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SelectService() {
  const [, setLocation] = useLocation();
  const params = getParams();

  // All queries are cached (staleTime ≥ 2 min) so they return instantly when
  // the member has already visited the Book screen in this session.
  const { data: acuityConfig,     isLoading: configLoading } = useAcuityConfig();
  const { data: memberCerts = [], isLoading: certsLoading  } = useMemberCertificates();
  const { data: certCheck                                   } = useCertificateCheck(params.certificate);
  const { data: appointmentTypes = [], isLoading: typesLoading } = useAppointmentTypes();

  const isLoading = configLoading || certsLoading || typesLoading;

  // ── Eligibility ──────────────────────────────────────────────────────────
  const locationConfig = acuityConfig?.locations.find((l) => l.id === params.locationId);

  const eligibleTypeIds =
    acuityConfig && locationConfig
      ? getEligibleTypeIds(
          locationConfig.appointmentTypeIDs,
          acuityConfig.appointmentTypes.workoutFor1,
          memberCerts,
          certCheck ?? null,
        )
      : [];

  // Enrich eligible IDs with full metadata from the appointment-types endpoint.
  const eligibleTypes: AppointmentType[] = eligibleTypeIds
    .map((id) => appointmentTypes.find((t) => String(t.id) === id))
    .filter((t): t is AppointmentType => !!t);

  // ── Navigation ───────────────────────────────────────────────────────────
  function handleSelect(type: AppointmentType) {
    const sp = new URLSearchParams({
      locationId:          params.locationId,
      locationName:        params.locationName,
      appointmentTypeID:   String(type.id),
      appointmentTypeName: type.name,
      ...(params.certificate ? { certificate: params.certificate } : {}),
      from: "select-service",
    });
    setLocation(`/book/select-datetime?${sp.toString()}`);
  }

  function handleBack() {
    const sp = new URLSearchParams(
      params.certificate ? { certificate: params.certificate } : {},
    );
    const qs = sp.toString();
    setLocation(qs ? `/book?${qs}` : "/book");
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* Back */}
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Location
      </button>

      {/* Progress */}
      <BookingProgress
        steps={["Location", "Service", "Date & Time", "Confirm"]}
        currentStep="Service"
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Choose Your Session
        </h1>
        {params.locationName && (
          <p className="text-sm text-muted-foreground mt-1">{params.locationName}</p>
        )}
      </div>

      {/* Service cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading services…
        </div>
      ) : eligibleTypes.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 max-w-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-sm text-muted-foreground">
            No services available at this location. Please check your membership
            package or contact the studio.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-lg">
          {eligibleTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleSelect(type)}
              className={cn(
                "group flex items-center gap-4 rounded-xl border border-border bg-card",
                "px-6 py-5 text-left w-full transition-colors",
                "hover:border-primary/30 hover:bg-white/[0.03]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-lg font-display font-bold text-foreground leading-tight">
                  {type.name}
                </h3>
                {type.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {type.description}
                  </p>
                )}
                {type.duration ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    {type.duration} min
                  </p>
                ) : null}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/35 group-hover:text-primary transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
