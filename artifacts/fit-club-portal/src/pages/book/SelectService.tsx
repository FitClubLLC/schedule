import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  useAcuityConfig,
  useMemberCertificates,
  useCertificateCheck,
  useAppointmentTypes,
  type AppointmentType,
} from "@/hooks/useBookingApi";
import { getEligibleTypeIds } from "@/lib/bookingEligibility";

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

  // ── Data fetching ────────────────────────────────────────────────────────
  // All queries are cached (staleTime ≥ 2 min) so they return instantly when
  // the member has already visited the Book screen in this session.
  const { data: acuityConfig,    isLoading: configLoading } = useAcuityConfig();
  const { data: memberCerts = [], isLoading: certsLoading  } = useMemberCertificates();
  const { data: certCheck                                   } = useCertificateCheck(params.certificate);
  const { data: appointmentTypes = [], isLoading: typesLoading } = useAppointmentTypes();

  const isLoading = configLoading || certsLoading || typesLoading;

  // ── Eligibility ──────────────────────────────────────────────────────────
  const locationConfig = acuityConfig?.locations.find((l) => l.id === params.locationId);

  const eligibleTypeIds = acuityConfig && locationConfig
    ? getEligibleTypeIds(
        locationConfig.appointmentTypeIDs,
        acuityConfig.appointmentTypes.workoutFor1,
        memberCerts,
        certCheck ?? null,
      )
    : [];

  // Enrich eligible IDs with full metadata from the appointment-types endpoint.
  // appointmentTypes.id is a number; location.appointmentTypeIDs are strings.
  const eligibleTypes: AppointmentType[] = eligibleTypeIds
    .map((id) => appointmentTypes.find((t) => String(t.id) === id))
    .filter((t): t is AppointmentType => !!t);

  // ── Navigation ───────────────────────────────────────────────────────────
  function handleSelect(type: AppointmentType) {
    const searchParams = new URLSearchParams({
      locationId:          params.locationId,
      locationName:        params.locationName,
      appointmentTypeID:   String(type.id),
      appointmentTypeName: type.name,
      ...(params.certificate ? { certificate: params.certificate } : {}),
    });
    setLocation(`/book/select-date?${searchParams.toString()}`);
  }

  function handleBack() {
    // Return to Book screen, preserving the certificate code in the URL so
    // the input field repopulates without the member re-typing it.
    const searchParams = new URLSearchParams(
      params.certificate ? { certificate: params.certificate } : {},
    );
    const qs = searchParams.toString();
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
        Back
      </button>

      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">
        Choose a Service
      </h1>
      <p className="text-muted-foreground mb-8">
        {params.locationName
          ? <>{params.locationName} &mdash; select the service you&rsquo;d like to book.</>
          : "Select the service you'd like to book."}
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading services…
        </div>
      ) : eligibleTypes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border-2 border-border p-4 max-w-2xl">
          <AlertCircle className="w-5 h-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No services available. Please check your membership package or contact the studio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          {eligibleTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleSelect(type)}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border-2 p-6",
                "transition-all duration-200 text-left w-full",
                "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
              )}
            >
              {/* Name + description */}
              <div className="flex-1 space-y-1">
                <h3 className="text-xl font-display font-bold text-primary leading-tight">
                  {type.name}
                </h3>
                {type.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {type.description}
                  </p>
                )}
              </div>

              {/* Duration + action */}
              <div className="flex items-center justify-between gap-2">
                {type.duration ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {type.duration} min
                  </span>
                ) : (
                  <span />
                )}
                <div
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold",
                    "bg-primary text-black transition-colors group-hover:bg-primary/90",
                  )}
                >
                  Select
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
