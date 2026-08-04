import { format, parseISO } from "date-fns";
import { Appointment } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin } from "lucide-react";
import { getLocationByCalendarId, getLocations } from "@/lib/locations";

// Colour palette indexed to match the booking page
const LOCATION_COLORS = [
  "border-primary/40 bg-primary/10 text-primary",
  "border-blue-500/40 bg-blue-500/10 text-blue-400",
];

function LocationBadge({ calendarId }: { calendarId?: number | null }) {
  const location = getLocationByCalendarId(calendarId);
  if (!location) return null;
  const idx = getLocations().indexOf(location);
  const colorClass = LOCATION_COLORS[idx % LOCATION_COLORS.length];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}
    >
      <MapPin className="w-3 h-3" />
      {location.name}
    </span>
  );
}

export function AppointmentCard({
  appointment,
  isPast,
}: {
  appointment: Appointment;
  isPast?: boolean;
}) {
  const dateObj = parseISO(appointment.date);
  const timeObj = parseISO(appointment.time);

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Date column */}
          <div className="bg-primary/5 sm:w-32 flex flex-col items-center justify-center p-6 border-b sm:border-b-0 sm:border-r border-border/50">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">
              {format(dateObj, "MMM")}
            </span>
            <span className="text-4xl font-display font-bold text-foreground -mt-1">
              {format(dateObj, "d")}
            </span>
            <span className="text-sm text-muted-foreground mt-1">
              {format(timeObj, "h:mm a")}
            </span>
          </div>

          {/* Details column */}
          <div className="flex-1 p-6 flex flex-col justify-center">
            <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
              <h3 className="text-xl font-display font-semibold text-foreground">
                {appointment.type}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <LocationBadge calendarId={appointment.calendarID} />
                {isPast ? (
                  <Badge variant="secondary">Completed</Badge>
                ) : (
                  <Badge variant="success">Upcoming</Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary/70" />
                <span>{appointment.duration} minutes</span>
              </div>

              {appointment.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary/70" />
                  <span>{appointment.location}</span>
                </div>
              )}

              {appointment.calendar && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary/70" />
                  <span>{appointment.calendar}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
