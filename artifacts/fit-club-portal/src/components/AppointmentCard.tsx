import { format, parseISO } from "date-fns";
import { Appointment } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin } from "lucide-react";

export function AppointmentCard({ appointment, isPast }: { appointment: Appointment; isPast?: boolean }) {
  const dateObj = parseISO(appointment.date);
  const timeObj = parseISO(appointment.time);

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="bg-primary/5 sm:w-32 flex flex-col items-center justify-center p-6 border-b sm:border-b-0 sm:border-r border-border/50">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">{format(dateObj, 'MMM')}</span>
            <span className="text-4xl font-display font-bold text-foreground -mt-1">{format(dateObj, 'd')}</span>
            <span className="text-sm text-muted-foreground mt-1">{format(timeObj, 'h:mm a')}</span>
          </div>
          
          <div className="flex-1 p-6 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-display font-semibold text-foreground">
                {appointment.type}
              </h3>
              {isPast ? (
                <Badge variant="secondary">Completed</Badge>
              ) : (
                <Badge variant="success">Upcoming</Badge>
              )}
            </div>
            
            <div className="space-y-2 mt-4 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
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
