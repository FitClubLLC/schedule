import { useState } from "react";
import { useUser } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, ArrowLeft, ChevronRight } from "lucide-react";
import { getLocations, type Location } from "@/lib/locations";

// ── Location colours (index-based so it works for any 2 locations) ────────
const LOCATION_COLORS = [
  {
    card: "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
    dot:  "bg-primary",
    text: "text-primary",
    selected: "border-primary ring-2 ring-primary/40 bg-primary/10",
  },
  {
    card: "border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10",
    dot:  "bg-blue-400",
    text: "text-blue-400",
    selected: "border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/10",
  },
];

function LocationPicker({
  locations,
  onSelect,
}: {
  locations: Location[];
  onSelect: (loc: Location) => void;
}) {
  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
          Book a Session
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose your preferred location to see available times.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {locations.map((loc, i) => {
          const colors = LOCATION_COLORS[i % LOCATION_COLORS.length];
          return (
            <button
              key={loc.id}
              onClick={() => onSelect(loc)}
              className={`group relative flex flex-col gap-4 rounded-2xl border-2 p-6 text-left transition-all duration-200 cursor-pointer ${colors.card}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colors.dot} bg-opacity-20`}>
                <MapPin className={`w-5 h-5 ${colors.text}`} />
              </div>
              <div className="flex-1">
                <h3 className={`text-xl font-display font-bold ${colors.text}`}>
                  {loc.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  View availability and book your session
                </p>
              </div>
              <div className="flex items-center justify-end">
                <ChevronRight className={`w-5 h-5 ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity`} />
              </div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

export default function Book() {
  const { user, isLoaded } = useUser();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const locations = getLocations();
  const baseCalendarUrl = import.meta.env.VITE_ACUITY_CALENDAR_URL as string | undefined;

  if (!isLoaded) {
    return (
      <Shell>
        <div className="mb-8">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </Shell>
    );
  }

  // If no locations configured, fall back to the existing single-calendar flow
  if (locations.length === 0) {
    const firstName = user?.firstName ?? "";
    const lastName  = user?.lastName  ?? "";
    const email     = user?.primaryEmailAddress?.emailAddress ?? "";
    const src = `${baseCalendarUrl}&firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&email=${encodeURIComponent(email)}`;

    return (
      <Shell>
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Book a Session</h1>
          <p className="text-muted-foreground mt-1">Select your trainer and time below.</p>
        </div>
        <Card className="w-full overflow-hidden border border-border/60 shadow-sm bg-card">
          <iframe src={src} title="Schedule Appointment" width="100%" className="h-[80vh] border-0" frameBorder="0" />
        </Card>
      </Shell>
    );
  }

  // Step 1 — location picker
  if (!selectedLocation) {
    return <LocationPicker locations={locations} onSelect={setSelectedLocation} />;
  }

  // Step 2 — Acuity iframe filtered to the chosen calendar
  const firstName = user?.firstName ?? "";
  const lastName  = user?.lastName  ?? "";
  const email     = user?.primaryEmailAddress?.emailAddress ?? "";

  const url = new URL(baseCalendarUrl ?? "https://app.acuityscheduling.com/schedule.php");
  if (selectedLocation.calendarId) url.searchParams.set("calendarID", selectedLocation.calendarId);
  if (firstName) url.searchParams.set("firstName", firstName);
  if (lastName)  url.searchParams.set("lastName",  lastName);
  if (email)     url.searchParams.set("email",      email);

  const locIdx = locations.findIndex((l) => l.id === selectedLocation.id);
  const colors = LOCATION_COLORS[Math.max(locIdx, 0) % LOCATION_COLORS.length];

  return (
    <Shell>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => setSelectedLocation(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Change location
          </button>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
            Book a Session
          </h1>
          <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold border ${colors.text} border-current bg-current/10`}>
            <MapPin className="w-3 h-3" />
            {selectedLocation.name}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSelectedLocation(null)} className="hidden sm:flex gap-2">
          <ArrowLeft className="w-4 h-4" />
          Change Location
        </Button>
      </div>

      <Card className="w-full overflow-hidden border border-border/60 shadow-sm bg-card">
        <iframe
          src={url.toString()}
          title={`Schedule Appointment — ${selectedLocation.name}`}
          width="100%"
          className="h-[80vh] border-0"
          frameBorder="0"
        />
      </Card>
    </Shell>
  );
}
