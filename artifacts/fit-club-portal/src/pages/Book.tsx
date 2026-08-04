import { useState, useEffect, Fragment } from "react";
import {
  format, parseISO, addMonths, subMonths,
  isBefore, startOfToday,
} from "date-fns";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, DollarSign, Loader2, MapPin,
} from "lucide-react";
import {
  useBookingLocations, useAppointmentTypes, useAvailableDates,
  useAvailableTimes, useCreateBooking,
  type BookingLocation, type AppointmentType, type AvailableTime, type CreatedAppointment,
} from "@/hooks/useBookingApi";

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "location" | "type" | "date" | "time" | "confirm" | "success";

// ── Location accent colours (index 0 = POTOMAC gold, 1 = KENTLANDS blue) ─────
function getAccent(idx: number) {
  return idx === 0
    ? {
        text:         "text-primary",
        bg:           "bg-primary",
        bgLight:      "bg-primary/10",
        border:       "border-primary",
        badge:        "border-primary/40 bg-primary/10 text-primary",
        cardHover:    "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
        calAvail:     "border border-primary text-primary hover:bg-primary hover:text-black",
        calSelected:  "bg-primary text-black border border-primary",
        timeIdle:     "border-border/60 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5",
        timeActive:   "border-primary bg-primary/10 text-primary",
        btnPrimary:   "bg-primary text-black hover:bg-primary/90",
        progress:     "bg-primary",
        progressText: "text-black",
        ring:         "ring-1 ring-primary ring-offset-2 ring-offset-background",
      }
    : {
        text:         "text-blue-400",
        bg:           "bg-blue-400",
        bgLight:      "bg-blue-400/10",
        border:       "border-blue-400",
        badge:        "border-blue-400/40 bg-blue-400/10 text-blue-400",
        cardHover:    "border-blue-400/40 hover:border-blue-400 bg-blue-400/5 hover:bg-blue-400/10",
        calAvail:     "border border-blue-400 text-blue-400 hover:bg-blue-400 hover:text-black",
        calSelected:  "bg-blue-400 text-black border border-blue-400",
        timeIdle:     "border-border/60 text-muted-foreground hover:border-blue-400 hover:text-blue-400 hover:bg-blue-400/5",
        timeActive:   "border-blue-400 bg-blue-400/10 text-blue-400",
        btnPrimary:   "bg-blue-400 text-black hover:bg-blue-400/90",
        progress:     "bg-blue-400",
        progressText: "text-black",
        ring:         "ring-1 ring-blue-400 ring-offset-2 ring-offset-background",
      };
}

// ── Calendar helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateCalDays(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) days.push(null);
  for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function fmtTime(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}

// ── Step progress indicator ───────────────────────────────────────────────────
const STEPS: Array<{ id: Exclude<Step, "success">; label: string }> = [
  { id: "location", label: "Location" },
  { id: "type",     label: "Session"  },
  { id: "date",     label: "Date"     },
  { id: "time",     label: "Time"     },
  { id: "confirm",  label: "Confirm"  },
];
const STEP_ORDER = STEPS.map((s) => s.id);

function StepProgress({ current, locIdx }: { current: Step; locIdx: number }) {
  if (current === "success") return null;
  const a = getAccent(locIdx);
  const ci = STEP_ORDER.indexOf(current as Exclude<Step, "success">);
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && (
            <div className={cn("h-px w-8 sm:w-12 flex-shrink-0 transition-colors", i <= ci ? a.progress : "bg-border/40")} />
          )}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200",
              i < ci  ? `${a.progress} ${a.progressText} border-transparent` : "",
              i === ci ? `${a.progress} ${a.progressText} border-transparent scale-110 shadow-md` : "",
              i > ci  ? "border-border/40 text-muted-foreground/50 bg-background" : "",
            )}>
              {i < ci ? "✓" : i + 1}
            </div>
            <span className={cn(
              "text-[10px] font-medium hidden sm:block tracking-wide",
              i === ci ? a.text : i < ci ? "text-muted-foreground" : "text-muted-foreground/30",
            )}>
              {s.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
    >
      <ChevronLeft className="w-4 h-4" />Back
    </button>
  );
}

function LocPill({ name, locIdx }: { name: string; locIdx: number }) {
  const a = getAccent(locIdx);
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border", a.badge)}>
      <MapPin className="w-3 h-3" />{name}
    </span>
  );
}

// ── Step 1 — Location ─────────────────────────────────────────────────────────
function LocationStep({ locations, loading, onSelect }: {
  locations: BookingLocation[]; loading: boolean;
  onSelect: (loc: BookingLocation, idx: number) => void;
}) {
  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">Book a Session</h1>
      <p className="text-muted-foreground mb-8">Choose your preferred location.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {loading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
          : locations.map((loc, i) => {
              const a = getAccent(i);
              return (
                <button
                  key={loc.id}
                  onClick={() => onSelect(loc, i)}
                  className={cn("group flex flex-col gap-4 rounded-2xl border-2 p-6 text-left transition-all duration-200", a.cardHover)}
                >
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", a.bgLight)}>
                    <MapPin className={cn("w-5 h-5", a.text)} />
                  </div>
                  <div className="flex-1">
                    <h3 className={cn("text-2xl font-display font-bold", a.text)}>{loc.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">View availability &amp; book a session</p>
                  </div>
                  <ChevronRight className={cn("w-5 h-5 self-end opacity-0 group-hover:opacity-100 transition-opacity", a.text)} />
                </button>
              );
            })}
      </div>
    </div>
  );
}

// ── Step 2 — Session type ─────────────────────────────────────────────────────
function TypeStep({ locIdx, locName, types, loading, isError, onSelect, onBack }: {
  locIdx: number; locName: string; types: AppointmentType[];
  loading: boolean; isError: boolean;
  onSelect: (t: AppointmentType) => void; onBack: () => void;
}) {
  const a = getAccent(locIdx);
  return (
    <div>
      <BackBtn onClick={onBack} />
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">Choose a Session</h1>
      <div className="mb-6"><LocPill name={locName} locIdx={locIdx} /></div>

      {loading && (
        <div className="space-y-3 max-w-xl">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}
      {isError && <p className="text-destructive text-sm">Failed to load session types. Please try again.</p>}
      {!loading && !isError && (
        <div className="space-y-3 max-w-xl">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn("w-full flex items-center justify-between gap-4 rounded-xl border-2 p-5 text-left transition-all duration-200", a.cardHover)}
            >
              <div>
                <p className="font-display font-bold text-lg text-foreground">{t.name}</p>
                {t.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{t.duration} min</span>
                  {parseFloat(t.price) > 0 && (
                    <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />{t.price}</span>
                  )}
                </div>
              </div>
              <ChevronRight className={cn("w-5 h-5 flex-shrink-0", a.text)} />
            </button>
          ))}
          {types.length === 0 && (
            <p className="text-muted-foreground text-sm">No session types found. Please contact the studio.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 3 — Date ─────────────────────────────────────────────────────────────
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function DateStep({ locIdx, locName, typeName, availableDates, loading, fetching,
  currentMonth, onMonthChange, selectedDate, onDateSelect, onBack }: {
  locIdx: number; locName: string; typeName: string;
  availableDates: string[]; loading: boolean; fetching: boolean;
  currentMonth: Date; onMonthChange: (d: Date) => void;
  selectedDate: string | null; onDateSelect: (d: string) => void; onBack: () => void;
}) {
  const a = getAccent(locIdx);
  const today = startOfToday();
  const todayStr = toDateStr(today);
  const prevDisabled = !isBefore(today, currentMonth);
  const calDays = generateCalDays(currentMonth.getFullYear(), currentMonth.getMonth());
  const availSet = new Set(availableDates);

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">Pick a Date</h1>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <LocPill name={locName} locIdx={locIdx} />
        <span className="text-muted-foreground/50">·</span>
        <span className="text-sm text-muted-foreground">{typeName}</span>
      </div>

      <div className="max-w-[340px]">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => onMonthChange(subMonths(currentMonth, 1))}
            disabled={prevDisabled}
            className="p-2 rounded-lg hover:bg-muted disabled:opacity-25 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-display font-bold text-foreground">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={() => onMonthChange(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/50 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="relative">
          {fetching && (
            <div className="absolute inset-0 bg-background/70 rounded-lg flex items-center justify-center z-10">
              <Loader2 className={cn("w-5 h-5 animate-spin", a.text)} />
            </div>
          )}
          <div className="grid grid-cols-7">
            {calDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="aspect-square" />;
              const ds = toDateStr(day);
              const avail = availSet.has(ds);
              const past  = ds < todayStr;
              const sel   = ds === selectedDate;
              const isToday = ds === todayStr;
              return (
                <div key={ds} className="flex items-center justify-center aspect-square p-0.5">
                  <button
                    disabled={!avail || past}
                    onClick={() => onDateSelect(ds)}
                    className={cn(
                      "w-full h-full rounded-full text-sm font-medium transition-all",
                      sel   && a.calSelected,
                      !sel && avail && !past && cn(a.calAvail, isToday && a.ring, "font-bold"),
                      !sel && (!avail || past) && "text-muted-foreground/20 cursor-not-allowed",
                    )}
                  >
                    {day.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Empty month message */}
        {!loading && !fetching && availableDates.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            No availability this month.{" "}
            <button onClick={() => onMonthChange(addMonths(currentMonth, 1))} className={cn("underline underline-offset-2", a.text)}>
              Try next month →
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 4 — Time ─────────────────────────────────────────────────────────────
function TimeStep({ locIdx, locName, typeName, selectedDate, times, loading,
  selectedTime, onTimeSelect, onContinue, onBack }: {
  locIdx: number; locName: string; typeName: string; selectedDate: string;
  times: AvailableTime[]; loading: boolean;
  selectedTime: string | null; onTimeSelect: (t: string) => void;
  onContinue: () => void; onBack: () => void;
}) {
  const a = getAccent(locIdx);
  return (
    <div>
      <BackBtn onClick={onBack} />
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">Pick a Time</h1>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <LocPill name={locName} locIdx={locIdx} />
        <span className="text-muted-foreground/50">·</span>
        <span className="text-sm text-muted-foreground">{typeName}</span>
      </div>
      <p className={cn("text-sm font-medium mb-6", a.text)}>
        {format(parseISO(selectedDate), "EEEE, MMMM d")}
      </p>

      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-w-md">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      )}
      {!loading && times.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No times available for this date.{" "}
          <button onClick={onBack} className={cn("underline underline-offset-2", a.text)}>Choose another date</button>
        </p>
      )}
      {!loading && times.length > 0 && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-w-md mb-6">
            {times.map((slot) => (
              <button
                key={slot.time}
                onClick={() => onTimeSelect(slot.time)}
                className={cn(
                  "px-3 py-2.5 rounded-lg border text-sm font-medium transition-all duration-150",
                  selectedTime === slot.time ? a.timeActive : a.timeIdle,
                )}
              >
                {fmtTime(slot.time)}
              </button>
            ))}
          </div>
          <Button
            disabled={!selectedTime}
            onClick={onContinue}
            className={cn("min-w-36 font-semibold", selectedTime ? a.btnPrimary : "")}
          >
            Continue →
          </Button>
        </>
      )}
    </div>
  );
}

// ── Step 5 — Confirm ──────────────────────────────────────────────────────────
function ConfirmStep({
  locIdx, locName, typeName, typeDuration, selectedDate, selectedTime,
  firstName, lastName, email, phone, notes,
  setFirstName, setLastName, setEmail, setPhone, setNotes,
  submitting, submitError, onSubmit, onBack,
}: {
  locIdx: number; locName: string; typeName: string; typeDuration: number;
  selectedDate: string; selectedTime: string;
  firstName: string; lastName: string; email: string; phone: string; notes: string;
  setFirstName: (v: string) => void; setLastName: (v: string) => void;
  setEmail: (v: string) => void; setPhone: (v: string) => void; setNotes: (v: string) => void;
  submitting: boolean; submitError: string | null;
  onSubmit: () => void; onBack: () => void;
}) {
  const a = getAccent(locIdx);
  const canSubmit = firstName.trim() && lastName.trim() && email.trim() && !submitting;

  return (
    <div className="max-w-xl">
      <BackBtn onClick={onBack} />
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-6">Confirm Booking</h1>

      {/* Summary card */}
      <Card className="mb-6 border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display font-bold text-xl text-foreground">{typeName}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{typeDuration} minutes</p>
            </div>
            <LocPill name={locName} locIdx={locIdx} />
          </div>
          <div className="h-px bg-border/40" />
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              {format(parseISO(selectedDate), "EEEE, MMMM d, yyyy")}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />{fmtTime(selectedTime)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>First Name <span className="text-destructive">*</span></Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name <span className="text-destructive">*</span></Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Email <span className="text-destructive">*</span></Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
        </div>
        <div className="space-y-1.5">
          <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know?"
            rows={3}
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {submitError}
          </p>
        )}

        <Button
          disabled={!canSubmit}
          onClick={onSubmit}
          className={cn("w-full py-6 text-base font-bold tracking-wide", canSubmit ? a.btnPrimary : "")}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Book Session"}
        </Button>
      </div>
    </div>
  );
}

// ── Step 6 — Success ──────────────────────────────────────────────────────────
function SuccessStep({ booking, locName, locIdx, onBookAnother, onViewAppts }: {
  booking: CreatedAppointment; locName: string; locIdx: number;
  onBookAnother: () => void; onViewAppts: () => void;
}) {
  const a = getAccent(locIdx);
  return (
    <div className="max-w-md mx-auto text-center py-8">
      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5", a.bgLight)}>
        <CheckCircle2 className={cn("w-8 h-8", a.text)} />
      </div>
      <h1 className="text-3xl font-display font-bold text-foreground mb-1">You're Booked!</h1>
      <p className="text-muted-foreground mb-8">Your session is confirmed. See you there!</p>

      <Card className="text-left mb-6 border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display font-bold text-xl text-foreground">{booking.type}</p>
            <LocPill name={locName} locIdx={locIdx} />
          </div>
          <div className="h-px bg-border/40" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              {format(parseISO(booking.date), "EEEE, MMMM d, yyyy")}
            </p>
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {format(parseISO(booking.time), "h:mm a")}
            </p>
            {booking.location && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4" />{booking.location}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="outline" className="flex-1" onClick={onBookAnother}>Book Another</Button>
        <Button className={cn("flex-1", a.btnPrimary)} onClick={onViewAppts}>View My Schedule</Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Book() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("location");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locName,    setLocName]    = useState("");
  const [locIdx,     setLocIdx]     = useState(0);
  const [typeId,     setTypeId]     = useState<number | null>(null);
  const [typeName,   setTypeName]   = useState("");
  const [typeDur,    setTypeDur]    = useState(0);
  const [curMonth,   setCurMonth]   = useState(() => new Date());
  const [selDate,    setSelDate]    = useState<string | null>(null);
  const [selTime,    setSelTime]    = useState<string | null>(null);
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [phone,      setPhone]      = useState("");
  const [notes,      setNotes]      = useState("");
  const [created,    setCreated]    = useState<CreatedAppointment | null>(null);

  // Pre-fill form from Clerk profile once loaded
  useEffect(() => {
    if (!user) return;
    if (!firstName && user.firstName) setFirstName(user.firstName);
    if (!lastName  && user.lastName)  setLastName(user.lastName);
    const em = user.primaryEmailAddress?.emailAddress;
    if (!email && em) setEmail(em);
  }, [user]);

  // ── Queries ──
  const locQ  = useBookingLocations();
  const typeQ = useAppointmentTypes(step !== "location");
  const dateQ = useAvailableDates(
    step === "date" && locationId && typeId
      ? { locationId, appointmentTypeID: typeId, month: format(curMonth, "yyyy-MM") }
      : null,
  );
  const timeQ = useAvailableTimes(
    step === "time" && locationId && typeId && selDate
      ? { locationId, appointmentTypeID: typeId, date: selDate }
      : null,
  );
  const createMut = useCreateBooking();

  // ── Handlers ──
  const pickLocation = (loc: BookingLocation, idx: number) => {
    setLocationId(loc.id); setLocName(loc.name); setLocIdx(idx);
    setStep("type");
  };

  const pickType = (t: AppointmentType) => {
    setTypeId(t.id); setTypeName(t.name); setTypeDur(t.duration);
    setStep("date");
  };

  const pickDate = (d: string) => {
    setSelDate(d); setSelTime(null); setStep("time");
  };

  const pickTime = (t: string) => setSelTime(t);

  const submitBooking = async () => {
    if (!locationId || !typeId || !selDate || !selTime) return;
    try {
      const result = await createMut.mutateAsync({
        locationId,
        appointmentTypeID: typeId,
        datetime: selTime,
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
        phone:     phone.trim()  || undefined,
        notes:     notes.trim()  || undefined,
      });
      setCreated(result);
      setStep("success");
    } catch { /* error surfaced via createMut.error */ }
  };

  const reset = () => {
    setStep("location");
    setLocationId(null); setLocName(""); setLocIdx(0);
    setTypeId(null); setTypeName(""); setTypeDur(0);
    setCurMonth(new Date()); setSelDate(null); setSelTime(null);
    setPhone(""); setNotes(""); setCreated(null);
    createMut.reset();
  };

  return (
    <Shell>
      <StepProgress current={step} locIdx={locIdx} />

      {step === "location" && (
        <LocationStep
          locations={locQ.data ?? []}
          loading={locQ.isLoading}
          onSelect={pickLocation}
        />
      )}

      {step === "type" && (
        <TypeStep
          locIdx={locIdx} locName={locName}
          types={typeQ.data ?? []}
          loading={typeQ.isLoading} isError={typeQ.isError}
          onSelect={pickType}
          onBack={() => setStep("location")}
        />
      )}

      {step === "date" && (
        <DateStep
          locIdx={locIdx} locName={locName} typeName={typeName}
          availableDates={dateQ.data ?? []}
          loading={dateQ.isLoading} fetching={dateQ.isFetching}
          currentMonth={curMonth}
          onMonthChange={(m) => { setCurMonth(m); setSelDate(null); }}
          selectedDate={selDate}
          onDateSelect={pickDate}
          onBack={() => setStep("type")}
        />
      )}

      {step === "time" && selDate && (
        <TimeStep
          locIdx={locIdx} locName={locName} typeName={typeName}
          selectedDate={selDate}
          times={timeQ.data ?? []}
          loading={timeQ.isLoading}
          selectedTime={selTime}
          onTimeSelect={pickTime}
          onContinue={() => setStep("confirm")}
          onBack={() => { setSelTime(null); setStep("date"); }}
        />
      )}

      {step === "confirm" && selDate && selTime && (
        <ConfirmStep
          locIdx={locIdx} locName={locName} typeName={typeName} typeDuration={typeDur}
          selectedDate={selDate} selectedTime={selTime}
          firstName={firstName} lastName={lastName} email={email} phone={phone} notes={notes}
          setFirstName={setFirstName} setLastName={setLastName}
          setEmail={setEmail} setPhone={setPhone} setNotes={setNotes}
          submitting={createMut.isPending}
          submitError={createMut.error?.message ?? null}
          onSubmit={submitBooking}
          onBack={() => setStep("time")}
        />
      )}

      {step === "success" && created && (
        <SuccessStep
          booking={created} locName={locName} locIdx={locIdx}
          onBookAnother={reset}
          onViewAppts={() => navigate("/appointments")}
        />
      )}
    </Shell>
  );
}
