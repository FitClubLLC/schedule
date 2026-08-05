import { useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { Appointment } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, X, CalendarClock, Loader2 } from "lucide-react";
import { getLocationByCalendarName, LOCATION_COLORS } from "@/lib/locations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { useAppointmentActions } from "@/hooks/useAppointmentActions";

function LocationBadge({ calendarName }: { calendarName?: string | null }) {
  if (!calendarName) return null;
  const match = getLocationByCalendarName(calendarName);
  if (match) {
    const { idx } = match;
    const colors = LOCATION_COLORS[idx % LOCATION_COLORS.length];
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors.badge}`}>
        <MapPin className="w-3 h-3" />
        {calendarName}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-border bg-muted/40 text-muted-foreground">
      <MapPin className="w-3 h-3" />
      {calendarName}
    </span>
  );
}

function RescheduleDialog({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const { fetchAvailableTimes, rescheduleAppointment } = useAppointmentActions();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<{ time: string; datetime: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDatetime, setSelectedDatetime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  async function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date);
    setSlots([]);
    setSelectedDatetime(null);
    setError(null);
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    setLoadingSlots(true);
    try {
      const times = await fetchAvailableTimes(appointment.id, dateStr);
      setSlots(times);
    } catch {
      setError("Could not load available times. Please try another date.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleConfirm() {
    if (!selectedDatetime) return;
    setSaving(true);
    setError(null);
    try {
      await rescheduleAppointment(appointment.id, selectedDatetime);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to reschedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select a new date and time for your appointment.</p>

      <div className="flex justify-center">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          disabled={(date) => date < today || date > addDays(today, 60)}
          className="rounded-md border"
        />
      </div>

      {selectedDate && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Available times for {format(selectedDate, "MMMM d")}
          </p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No available times on this date. Try another day.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {slots.map((slot) => (
                <button
                  key={slot.datetime}
                  onClick={() => setSelectedDatetime(slot.datetime)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    selectedDatetime === slot.datetime
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
                  }`}
                >
                  {format(parseISO(slot.datetime), "h:mm a")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!selectedDatetime || saving}
        >
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Confirm Reschedule"}
        </Button>
      </div>
    </div>
  );
}

export function AppointmentCard({
  appointment,
  isPast,
}: {
  appointment: Appointment;
  isPast?: boolean;
}) {
  const { cancelAppointment } = useAppointmentActions();
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const dateObj = parseISO(appointment.date);
  const timeObj = parseISO(appointment.time);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelAppointment(appointment.id);
    } finally {
      setCancelling(false);
    }
  }

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
                <LocationBadge calendarName={appointment.calendar} />
                {isPast ? (
                  <Badge variant="secondary">Completed</Badge>
                ) : (
                  <Badge variant="success">Upcoming</Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground mb-4">
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
            </div>

            {/* Actions — upcoming only */}
            {!isPast && (
              <div className="flex gap-2 flex-wrap">
                {/* Reschedule */}
                <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <CalendarClock className="w-4 h-4" />
                      Reschedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display font-bold tracking-tight">
                        Reschedule Appointment
                      </DialogTitle>
                    </DialogHeader>
                    <RescheduleDialog
                      appointment={appointment}
                      onClose={() => setRescheduleOpen(false)}
                    />
                  </DialogContent>
                </Dialog>

                {/* Cancel */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={cancelling}>
                      {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will cancel your <strong>{appointment.type}</strong> on{" "}
                        <strong>{format(dateObj, "MMMM d")} at {format(timeObj, "h:mm a")}</strong>.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, Cancel It
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
