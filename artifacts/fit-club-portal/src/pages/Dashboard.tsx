import { useGetAppointmentSummary, useGetUpcomingAppointments } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, CalendarRange, History, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/AppointmentCard";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAppointmentSummary();
  const { data: upcoming, isLoading: isLoadingUpcoming } = useGetUpcomingAppointments();

  return (
    <Shell>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your fitness schedule.</p>
        </div>
        <Link href="/book">
          <Button size="lg" className="w-full sm:w-auto shadow-md">
            Book a Session
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Upcoming
            </CardTitle>
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <CalendarRange className="w-5 h-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <div className="text-4xl font-display font-bold text-foreground">
                {summary?.upcomingCount || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Past Sessions
            </CardTitle>
            <div className="w-10 h-10 bg-secondary/5 rounded-full flex items-center justify-center">
              <History className="w-5 h-5 text-secondary/60" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <div className="text-4xl font-display font-bold text-foreground">
                {summary?.pastCount || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground border-transparent relative overflow-hidden">
          {/* Decorative background shape */}
          <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-32 h-32 bg-black/10 rounded-full blur-2xl" />
          
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-semibold text-primary-foreground/80 uppercase tracking-wider">
              Next Session
            </CardTitle>
            <div className="w-10 h-10 bg-black/10 rounded-full flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-primary-foreground" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {isLoadingSummary ? (
              <Skeleton className="h-10 w-full bg-black/10" />
            ) : summary?.nextAppointment ? (
              <div>
                <div className="text-2xl font-display font-bold truncate text-primary-foreground">
                  {summary.nextAppointment.type}
                </div>
                <div className="text-sm text-primary-foreground/80 mt-1">
                  {new Date(summary.nextAppointment.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(summary.nextAppointment.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ) : (
              <div className="text-lg font-semibold text-primary-foreground/80 mt-2">
                No sessions scheduled
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Upcoming Appointments</h2>
          <Link href="/appointments" className="text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoadingUpcoming ? (
          <div className="space-y-4">
            <Skeleton className="h-[140px] w-full rounded-2xl" />
            <Skeleton className="h-[140px] w-full rounded-2xl" />
          </div>
        ) : upcoming && upcoming.length > 0 ? (
          <div className="space-y-4">
            {upcoming.slice(0, 3).map((apt) => (
              <AppointmentCard key={apt.id} appointment={apt} />
            ))}
          </div>
        ) : (
          <Card className="bg-muted/30 border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-background p-4 rounded-full shadow-sm mb-4">
                <CalendarRange className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground">No upcoming sessions</h3>
              <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                You don't have any appointments on the horizon. Book a session to keep your momentum going!
              </p>
              <Link href="/book">
                <Button>Book a Session</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
