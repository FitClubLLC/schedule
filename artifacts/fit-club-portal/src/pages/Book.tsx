import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import { MapPin, ChevronRight, CreditCard, Check, AlertCircle, X, Loader2, PlusCircle, ArrowLeft, ExternalLink } from "lucide-react";
import { useMemberCertificates, useCertificateCheck, useAcuityConfig } from "@/hooks/useBookingApi";

const CERT_STORAGE_KEY = "fitclub_certificate";

const LOCATION_ACCENT = {
  text:      "text-primary",
  bgLight:   "bg-primary/10",
  border:    "border-primary",
  cardHover: "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
  btn:       "bg-primary text-black hover:bg-primary/90",
};

function formatRemaining(value: string) {
  // If it starts with a digit it's a session count ("4 sessions"), otherwise dollar amount
  return /^\d/.test(value) ? `${value} remaining` : `$${value} remaining`;
}

export default function Book() {
  const [, setLocation] = useLocation();
  const { data: acuityConfig, isLoading: configLoading } = useAcuityConfig();
  const { data: memberCerts = [], isLoading: certsLoading } = useMemberCertificates();

  // Code state — persisted to localStorage
  const [inputCode, setInputCode] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(CERT_STORAGE_KEY) ?? "") : ""
  );
  const [debouncedCode, setDebouncedCode] = useState(inputCode);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read certificate param from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cert = params.get("certificate");
    if (cert?.trim()) {
      setInputCode(cert.trim());
      localStorage.setItem(CERT_STORAGE_KEY, cert.trim());
    }
  }, []);

  // Debounce validation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedCode(inputCode), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputCode]);

  const { data: checkData, isLoading: checking, isError: checkError } =
    useCertificateCheck(debouncedCode);

  const isValid = !!checkData?.valid;
  const activeCode = isValid ? debouncedCode : "";

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

  const showValidBanner = isValid && checkData;
  const showInvalidBanner = !checking && checkError && debouncedCode.length > 0;

  return (
    <Shell>
      <button
        onClick={() => setLocation("/dashboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">
        Book a Session
      </h1>
      <p className="text-muted-foreground mb-8">
        Choose your preferred location to view availability and book.
      </p>

      {/* ── Free trial CTA ─────────────────────────────────────── */}
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
          "flex items-center justify-center gap-2 w-full max-w-2xl border-2 border-dashed border-primary rounded-xl py-3 px-4 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors mb-6 no-underline",
          !acuityConfig && "opacity-50 pointer-events-none",
        )}
      >
        {configLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
        Book a Free Trial
        <ExternalLink className="w-3.5 h-3.5 ml-1" />
      </a>

      {/* ── Your packages ──────────────────────────────────────── */}
      {(certsLoading || memberCerts.length > 0) && (
        <div className="mb-6 max-w-2xl">
          <p className="text-xs font-bold tracking-widest text-muted-foreground mb-2">YOUR PACKAGES</p>
          {certsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading packages…
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
                      "flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                      active
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        active ? "bg-green-500/15" : "bg-muted",
                      )}>
                        {active
                          ? <Check className="w-4 h-4 text-green-500" />
                          : <CreditCard className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{cert.productName}</p>
                        <p className="text-xs text-muted-foreground">{formatRemaining(cert.remainingValue)}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-bold shrink-0",
                      active ? "text-green-500" : "text-primary",
                    )}>
                      {active ? "Applied ✓" : "Use"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Certificate code input ─────────────────────────────── */}
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-bold tracking-widest text-muted-foreground mb-2">
          {memberCerts.length > 0 ? "OR ENTER A CODE MANUALLY" : "MEMBERSHIP / PACKAGE CODE"}
        </p>

        <div className={cn(
          "flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition-colors bg-card",
          showValidBanner   ? "border-green-500/50"
          : showInvalidBanner ? "border-red-500/40"
          : inputCode       ? "border-primary/40"
          : "border-border",
        )}>
          <CreditCard className={cn(
            "w-4 h-4 shrink-0",
            showValidBanner ? "text-green-500" : showInvalidBanner ? "text-red-400" : "text-muted-foreground",
          )} />
          <input
            type="text"
            value={inputCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="Enter certificate code"
            className="flex-1 bg-transparent text-sm font-semibold tracking-widest text-foreground placeholder:text-muted-foreground placeholder:font-normal placeholder:tracking-normal outline-none"
          />
          {checking && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
          {!checking && inputCode && (
            <button onClick={clearCode} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {showValidBanner && checkData && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/40 text-green-600 text-xs font-semibold">
            <Check className="w-3.5 h-3.5 shrink-0" />
            {checkData.productName}
            {checkData.remainingValue && checkData.remainingValue !== "0.00"
              ? ` · ${formatRemaining(checkData.remainingValue)}`
              : ""}
            {" "}— will be applied to your booking
          </div>
        )}
        {showInvalidBanner && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-500 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Invalid or expired certificate code
          </div>
        )}
      </div>

      {/* ── Location cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {configLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border-2 border-border bg-card p-6 h-44 animate-pulse"
              />
            ))
          : (acuityConfig?.locations ?? []).map((loc) => {
              const a = LOCATION_ACCENT;
              return (
                <button
                  key={loc.id}
                  onClick={() => {
                    const params = new URLSearchParams({
                      locationId: loc.id,
                      locationName: loc.name,
                      // Default to Workout for 1 — the single appointment type
                      // offered in this first step of the native booking flow.
                      appointmentTypeID:
                        acuityConfig!.appointmentTypes.workoutFor1,
                      appointmentTypeName: "Workout for 1",
                      ...(activeCode ? { certificate: activeCode } : {}),
                    });
                    setLocation(`/book/select-date?${params.toString()}`);
                  }}
                  className={cn(
                    "group flex flex-col gap-4 rounded-2xl border-2 p-6 transition-all duration-200 text-left w-full",
                    a.cardHover,
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      a.bgLight,
                    )}
                  >
                    <MapPin className={cn("w-5 h-5", a.text)} />
                  </div>

                  <div className="flex-1">
                    <h3 className={cn("text-2xl font-display font-bold", a.text)}>
                      {loc.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      View availability &amp; book a session
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                        a.btn,
                      )}
                    >
                      Book Now
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                    {isValid && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-500">
                        <Check className="w-3 h-3" /> Code applied
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
      </div>
    </Shell>
  );
}
