import { Shell } from "@/components/layout/Shell";
import { cn } from "@/lib/utils";
import { MapPin, ExternalLink } from "lucide-react";

const OWNER_ID = "36930698";

const LOCATIONS = [
  {
    id: "1",
    name: "POTOMAC",
    calendarId: "12741713",
    accent: {
      text:      "text-primary",
      bgLight:   "bg-primary/10",
      border:    "border-primary",
      cardHover: "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
      btn:       "bg-primary text-black hover:bg-primary/90",
    },
  },
  {
    id: "2",
    name: "KENTLANDS",
    calendarId: "14311114",
    accent: {
      text:      "text-blue-400",
      bgLight:   "bg-blue-400/10",
      border:    "border-blue-400",
      cardHover: "border-blue-400/40 hover:border-blue-400 bg-blue-400/5 hover:bg-blue-400/10",
      btn:       "bg-blue-400 text-black hover:bg-blue-400/90",
    },
  },
];

function acuityUrl(calendarId: string) {
  return `https://app.acuityscheduling.com/schedule.php?owner=${OWNER_ID}&calendarID=${calendarId}`;
}

export default function Book() {
  return (
    <Shell>
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight mb-1">
        Book a Session
      </h1>
      <p className="text-muted-foreground mb-8">
        Choose your preferred location to view availability and book.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {LOCATIONS.map((loc) => {
          const a = loc.accent;
          return (
            <a
              key={loc.id}
              href={acuityUrl(loc.calendarId)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border-2 p-6 transition-all duration-200 no-underline",
                a.cardHover,
              )}
            >
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", a.bgLight)}>
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

              <div className={cn(
                "inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                a.btn,
              )}>
                Book Now
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </a>
          );
        })}
      </div>
    </Shell>
  );
}
