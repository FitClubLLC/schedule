import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  CreditCard,
  Check,
  AlertCircle,
  X,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import {
  useMemberCertificates,
  useCertificateCheck,
  useAcuityConfig,
  useAppointmentTypes,
} from "@/hooks/useBookingApi";
import { getEligibleTypeIds } from "@/lib/bookingEligibility";

const CERT_STORAGE_KEY = "fitclub_certificate";

function formatRemaining(value: string) {
  return /^\d/.test(value) ? `${value} remaining` : `$${value} remaining`;
}

export default function Book() {
  const [, setLocation] = useLocation();
  const { data: acuityConfig, isLoading: configLoading } = useAcuityConfig();
  const { data: memberCerts = [], isLoading: certsLoading } = useMemberCertificates();
  const { data: appointmentTypes = [] } = useAppointmentTypes();

  // ── Certificate state — persisted to localStorage ──────────────────────────
  const [inputCode, setInputCode] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(CERT_STORAGE_KEY) ?? "") : "",
  );
  const [debouncedCode, setDebouncedCode] = useState(inputCode);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read certificate param from URL on mount (e.g. when coming back from SelectService).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cert = params.get("certificate");
    if (cert?.trim()) {
      setInputCode(cert.trim());
      localStorage.setItem(CERT_STORAGE_KEY, cert.trim());
    }
  }, []);

  // Debounce validation so we don't fire a network request on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedCode(inputCode), 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputCode]);

  const { data: checkData, isLoading: checking, isError: checkError } =
    useCertificateCheck(debouncedCode);

  const isValid  = !!checkData?.valid;
  const activeCode = isValid ? debouncedCode : "";

  const showValidBanner   = isValid && checkData;
  const showInvalidBanner = !checking && checkError && debouncedCode.length > 0;

  function handleCodeChange(val: string) {
    const upper = val.toUpperCase();
    setInputCode(upper);
    if (upper.trim()) localStorage.setItem(CERT_STORAGE_KEY, upper.trim());
    else localStorage.removeItem(CERT_STORAGE_KEY);
  }

  function clearCode() {
    setInputCode("");
    setDebouncedCode("");
    localStorage.removeItem(CERT_STORAGE_KEY);
  }

  function applyPackage(code: string) {
    if (inputCode === code) { clearCode(); return; }
    setInputCode(code);
    setDebouncedCode(code);
    localStorage.setItem(CERT_STORAGE_KEY, code);
  }

  function handleLocationSelect(loc: NonNullable<typeof acuityConfig>["locations"][number]) {
    if (!acuityConfig) return;

    const eligibleIds = getEligibleTypeIds(
      loc.appointmentTypeIDs,
      acuityConfig.appointmentTypes.workoutFor1,
      memberCerts,
      isValid ? (checkData ?? null) : null,
    );

    if (eligibleIds.length === 0) return;

    if (eligibleIds.length === 1) {
      const typeId   = eligibleIds[0];
      const typeMeta = appointmentTypes.find((t) => String(t.id) === typeId);
      const sp = new URLSearchParams({
        locationId:   loc.id,
        locationName: loc.name,
        appointmentTypeID: typeId,
        ...(typeMeta ? { appointmentTypeName: typeMeta.name } : {}),
        ...(activeCode ? { certificate: activeCode } : {}),
        from: "book",
      });
      setLocation(`/book/select-datetime?${sp.toString()}`);
    } else {
      const sp = new URLSearchParams({
        locationId:   loc.id,
        locationName: loc.name,
        ...(activeCode ? { certificate: activeCode } : {}),
      });
      setLocation(`/book/select-service?${sp.toString()}`);
    }
  }

  return (
    <Shell>
      {/* ── Back ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setLocation("/dashboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Where would you like to train?
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose a location to see availability.
        </p>
      </div>

      {/* ── Location cards — PRIMARY ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mb-10">
        {configLoading
          ? [0, 1].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-6 h-28 animate-pulse"
              />
            ))
          : (acuityConfig?.locations ?? []).map((loc) => {
              const serviceNames = loc.appointmentTypeIDs
                .map((id) => appointmentTypes.find((t) => String(t.id) === id)?.name)
                .filter((n): n is string => !!n);

              return (
                <button
                  key={loc.id}
                  onClick={() => handleLocationSelect(loc)}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-card px-6 py-5 text-left w-full transition-colors hover:border-primary/30 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-display font-bold text-foreground tracking-tight leading-tight">
                      {loc.name}
                    </h3>
                    {serviceNames.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5 truncate">
                        {serviceNames.join(" · ")}
                      </p>
                    )}
                    {isValid && (
                      <p className="flex items-center gap-1 text-xs text-green-500 font-semibold mt-1.5">
                        <Check className="w-3 h-3 shrink-0" />
                        Package applied
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/35 group-hover:text-primary transition-colors shrink-0" />
                </button>
              );
            })}
      </div>

      {/* ── Secondary: packages + cert ────────────────────────────── */}
      <div className="max-w-2xl border-t border-border pt-8 space-y-6">
        {/* Member packages */}
        {(certsLoading || memberCerts.length > 0) && (
          <div>
            <p className="text-xs font-bold tracking-widest text-muted-foreground mb-3">
              YOUR PACKAGES
            </p>
            {certsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading packages…
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {memberCerts.map((cert) => {
                  const active = inputCode === cert.code && isValid;
                  return (
                    <button
                      key={cert.code}
                      onClick={() => applyPackage(cert.code)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                        active
                          ? "border-green-500/40 bg-green-500/8"
                          : "border-border bg-card hover:border-primary/30 hover:bg-white/[0.03]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            active ? "bg-green-500/15" : "bg-muted",
                          )}
                        >
                          {active ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <CreditCard className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {cert.productName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRemaining(cert.remainingValue)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold shrink-0",
                          active ? "text-green-500" : "text-muted-foreground",
                        )}
                      >
                        {active ? "Applied ✓" : "Use"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Manual certificate code entry */}
        <div>
          <p className="text-xs font-bold tracking-widest text-muted-foreground mb-3">
            {memberCerts.length > 0 ? "OR ENTER A CODE MANUALLY" : "MEMBERSHIP / PACKAGE CODE"}
          </p>

          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors bg-card",
              showValidBanner
                ? "border-green-500/40"
                : showInvalidBanner
                ? "border-red-500/35"
                : inputCode
                ? "border-primary/35"
                : "border-border",
            )}
          >
            <CreditCard
              className={cn(
                "w-4 h-4 shrink-0",
                showValidBanner
                  ? "text-green-500"
                  : showInvalidBanner
                  ? "text-red-400"
                  : "text-muted-foreground",
              )}
            />
            <input
              type="text"
              value={inputCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="Enter certificate code"
              aria-label="Membership or package certificate code"
              className="flex-1 bg-transparent text-sm font-semibold tracking-widest text-foreground placeholder:text-muted-foreground placeholder:font-normal placeholder:tracking-normal outline-none"
            />
            {checking && (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            )}
            {!checking && inputCode && (
              <button
                onClick={clearCode}
                aria-label="Clear certificate code"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showValidBanner && checkData && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 text-xs font-semibold">
              <Check className="w-3.5 h-3.5 shrink-0" />
              {checkData.productName}
              {checkData.remainingValue && checkData.remainingValue !== "0.00"
                ? ` · ${formatRemaining(checkData.remainingValue)}`
                : ""}
              {" "}— will be applied to your booking
            </div>
          )}
          {showInvalidBanner && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Invalid or expired certificate code
            </div>
          )}
        </div>

        {/* Free Trial link */}
        <p className="text-sm text-muted-foreground">
          New to Fit Club?{" "}
          <a
            href={
              acuityConfig
                ? `https://app.acuityscheduling.com/schedule.php?owner=${acuityConfig.ownerId}&appointmentType=${acuityConfig.appointmentTypes.freeTrial}`
                : undefined
            }
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!acuityConfig}
            className={cn(
              "font-semibold text-primary hover:underline underline-offset-4 inline-flex items-center gap-1",
              !acuityConfig && "opacity-50 pointer-events-none",
            )}
          >
            Book a free trial
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    </Shell>
  );
}
