import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Clock, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import {
  useAcuityConfig,
  useMemberCertificates,
  useCertificateCheck,
  useAppointmentTypes,
  type AppointmentType,
} from "@/hooks/useBookingApi";
import { getEligibleTypeIds } from "@/lib/bookingEligibility";
import { BookingProgress } from "@/components/book/BookingProgress";
import {
  getAcuitySchedulerUrl,
  getCreditBookingDecision,
} from "@workspace/api-client-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId:   p.get("locationId")   ?? "",
    locationName: p.get("locationName") ?? "",
    certificate:  p.get("certificate")  ?? "",
  };
}

type LocationService = NonNullable<ReturnType<typeof useAcuityConfig>["data"]>["locations"][number]["services"][number];

interface ServiceOption {
  key: string;
  id: number;
  name: string;
  description?: string | null | undefined;
  duration?: number;
  bookingMode: "native" | "external";
  calendarId: string;
  action: "native" | "hosted-payment" | "choose-credit" | "unavailable";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SelectService() {
  const [, setLocation] = useLocation();
  const params = getParams();
  const { user } = useUser();
  const [selectionMessage, setSelectionMessage] = useState("");

  // All queries are cached (staleTime ≥ 2 min) so they return instantly when
  // the member has already visited the Book screen in this session.
  const { data: acuityConfig,     isLoading: configLoading } = useAcuityConfig();
  const {
    data: memberCerts = [],
    isLoading: certsLoading,
    isError: certsError,
  } = useMemberCertificates();
  const {
    data: certCheck,
    isLoading: certificateCheckLoading,
  } = useCertificateCheck(params.certificate);
  const { data: appointmentTypes = [], isLoading: typesLoading } = useAppointmentTypes();

  const isLoading = configLoading || certsLoading;

  // ── Eligibility ──────────────────────────────────────────────────────────
  const locationConfig = acuityConfig?.locations.find((l) => l.id === params.locationId);
  const selectedCertificate =
    certCheck && params.certificate
      ? [{
          code: params.certificate,
          productName: certCheck.productName,
          remainingValue: certCheck.remainingValue,
          appointmentTypeIDs: certCheck.productIDs,
          appliesToAllProducts: certCheck.appliesToAllProducts,
        }]
      : [];
  const certificates = [
    ...memberCerts,
    ...selectedCertificate.filter(
      (selected) => !memberCerts.some((certificate) => certificate.code === selected.code),
    ),
  ];
  const workoutDecision = acuityConfig
    ? getCreditBookingDecision({
        certificates,
        appointmentTypeId: acuityConfig.appointmentTypes.workoutFor1,
        selectedCertificateCode: params.certificate,
      })
    : { kind: "hosted-payment" as const };

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
  const externalServices: LocationService[] =
    locationConfig?.services.filter((service) => service.bookingMode === "external") ?? [];

  const eligibleTypes: ServiceOption[] = eligibleTypeIds
    .filter((id) => id !== acuityConfig?.appointmentTypes.workoutFor1)
    .reduce<ServiceOption[]>((acc, id) => {
    const configured = locationConfig?.services.find(
      (service) => service.appointmentTypeID === id && service.bookingMode === "native",
    );
    if (!configured) return acc;
    const metadata = appointmentTypes.find((t) => String(t.id) === id);
    acc.push({
      key: configured.key,
      id: Number(id),
      name: metadata?.name ?? configured.name,
      description: metadata?.description ?? null,
      duration: metadata?.duration,
      bookingMode: configured.bookingMode,
      calendarId: configured.calendarId,
      action: "native",
    });
    return acc;
  }, []);
  const workoutService = locationConfig?.services.find(
    (service) => service.appointmentTypeID === acuityConfig?.appointmentTypes.workoutFor1,
  );
  const workoutMetadata = workoutService
    ? appointmentTypes.find((type) => String(type.id) === workoutService.appointmentTypeID)
    : undefined;
  const workoutOption: ServiceOption[] = workoutService
    ? [{
        key: workoutService.key,
        id: Number(workoutService.appointmentTypeID),
        name: workoutMetadata?.name ?? workoutService.name,
        description: workoutMetadata?.description ?? null,
        duration: workoutMetadata?.duration,
        bookingMode: workoutService.bookingMode,
        calendarId: workoutService.calendarId,
        action: certsError || certificateCheckLoading
          ? "unavailable"
          : workoutDecision.kind === "native"
          ? "native"
          : workoutDecision.kind === "choose-credit"
          ? "choose-credit"
          : "hosted-payment",
      }]
    : [];

  const serviceOptions: ServiceOption[] = [
    ...externalServices.map((service) => ({
      key: service.key,
      id: Number(service.appointmentTypeID),
      name: service.name,
      description: "Opens Acuity to schedule your free trial.",
      bookingMode: service.bookingMode,
      calendarId: service.calendarId,
      action: "hosted-payment" as const,
    })),
    ...workoutOption,
    ...eligibleTypes,
  ];

  function hostedUrl(service: ServiceOption): string {
    return getAcuitySchedulerUrl({
      ownerId: acuityConfig?.ownerId ?? "",
      appointmentTypeId: service.id,
      calendarId: service.calendarId,
      email: user?.primaryEmailAddress?.emailAddress,
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function handleSelect(service: ServiceOption) {
    setSelectionMessage("");
    if (service.action === "unavailable") {
      setSelectionMessage("We couldn’t verify your packages. Please return and try again.");
      return;
    }
    if (service.action === "choose-credit") {
      setSelectionMessage("Choose one of your active packages on the Book page before scheduling Workout for 1.");
      return;
    }
    if (service.action === "hosted-payment") {
      window.open(hostedUrl(service), "_blank", "noopener,noreferrer");
      return;
    }
    const sp = new URLSearchParams({
      locationId:          params.locationId,
      locationName:        params.locationName,
      appointmentTypeID:   String(service.id),
      appointmentTypeName: service.name,
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
      ) : serviceOptions.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 max-w-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-sm text-muted-foreground">
            No services available at this location. Please check your membership
            package or contact the studio.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-lg">
          {selectionMessage && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
              <AlertCircle className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">{selectionMessage}</p>
            </div>
          )}
          {serviceOptions.map((service) => (
            <button
              key={service.key}
              onClick={() => handleSelect(service)}
              className={cn(
                "group flex items-center gap-4 rounded-xl border border-border bg-card",
                "px-6 py-5 text-left w-full transition-colors",
                "hover:border-primary/30 hover:bg-white/[0.03]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-lg font-display font-bold text-foreground leading-tight">
                {service.name}
                </h3>
                {service.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {service.description}
                  </p>
                )}
                {service.duration ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
                    {service.action === "hosted-payment" ? (
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 shrink-0" />
                    )}
                    {service.action === "hosted-payment"
                      ? service.id === Number(acuityConfig?.appointmentTypes.workoutFor1)
                        ? "Secure payment in Acuity"
                        : "External booking"
                      : `${service.duration} min`}
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
