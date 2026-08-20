import { useGetPastAppointments, useGetUpcomingAppointments } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentCard } from "@/components/AppointmentCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarX2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  APPOINTMENTS_LOAD_ERROR_DESCRIPTION,
  APPOINTMENTS_LOAD_ERROR_TITLE,
  getAppointmentListState,
} from "@/lib/appointmentStates";

export default function Appointments() {
  const {
    data: upcoming,
    isLoading: isLoadingUpcoming,
    isError: isUpcomingError,
    refetch: refetchUpcoming,
  } = useGetUpcomingAppointments();
  const {
    data: past,
    isLoading: isLoadingPast,
    isError: isPastError,
    refetch: refetchPast,
  } = useGetPastAppointments();

  const upcomingState = getAppointmentListState({
    isLoading: isLoadingUpcoming,
    isError: isUpcomingError,
    count: upcoming?.length ?? 0,
  });
  const pastState = getAppointmentListState({
    isLoading: isLoadingPast,
    isError: isPastError,
    count: past?.length ?? 0,
  });

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Appointments</h1>
        <p className="text-muted-foreground mt-1">Manage your schedule and view past sessions.</p>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="mb-6 max-w-sm">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
          {upcomingState === "loading" ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[140px] w-full rounded-2xl" />)}
            </div>
          ) : upcomingState === "error" ? (
            <LoadErrorState onRetry={() => refetchUpcoming()} />
          ) : upcomingState === "ready" ? (
            (upcoming ?? []).map(apt => (
              <AppointmentCard key={apt.id} appointment={apt} />
            ))
          ) : (
            <EmptyState title="No upcoming appointments" description="Your schedule is clear. Ready for your next workout?" />
          )}
        </TabsContent>
        
        <TabsContent value="past" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
          {pastState === "loading" ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[140px] w-full rounded-2xl" />)}
            </div>
          ) : pastState === "error" ? (
            <LoadErrorState onRetry={() => refetchPast()} />
          ) : pastState === "ready" ? (
            (past ?? []).map(apt => (
              <AppointmentCard key={apt.id} appointment={apt} isPast />
            ))
          ) : (
            <EmptyState title="No past appointments" description="You haven't completed any sessions yet." />
          )}
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-8 h-8 text-destructive/80 mb-4" />
        <h3 className="text-xl font-display font-bold text-foreground">
          {APPOINTMENTS_LOAD_ERROR_TITLE}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-md">
          {APPOINTMENTS_LOAD_ERROR_DESCRIPTION}
        </p>
        <Button variant="outline" className="mt-5 gap-2" onClick={onRetry}>
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-muted/20 border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-background p-4 rounded-full shadow-sm mb-4">
          <CalendarX2 className="w-8 h-8 text-muted-foreground/60" />
        </div>
        <h3 className="text-xl font-display font-bold text-foreground">{title}</h3>
        <p className="text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}
