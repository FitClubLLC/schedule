import {
  formatMembershipBalance,
  getAcuityMembershipCatalogUrl,
  getPackageLoadState,
  useGetAppointmentSummary,
  useGetUpcomingAppointments,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, CalendarRange, History, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/AppointmentCard";
import { formatStudioDate, formatStudioTime } from "@/lib/studioTime";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useAcuityConfig, useMemberCertificates } from "@/hooks/useBookingApi";
import { markMembershipCatalogOpened } from "@/lib/membershipCatalogReturn";
import {
  getDashboardDataState,
  getPortalWorkoutMemberships,
} from "@/lib/dashboardPresentation";

export default function Dashboard() {
  const summaryQuery = useGetAppointmentSummary();
  const upcomingQuery = useGetUpcomingAppointments();
  const acuityConfigQuery = useAcuityConfig();
  const certificatesQuery = useMemberCertificates();
  const summary = summaryQuery.data;
  const upcoming = upcomingQuery.data;
  const acuityConfig = acuityConfigQuery.data;
  const membershipsUrl = acuityConfig
    ? getAcuityMembershipCatalogUrl(acuityConfig.ownerId)
    : undefined;
  const summaryState = getDashboardDataState({
    isLoading: summaryQuery.isLoading,
    isError: summaryQuery.isError,
  });
  const upcomingState = getDashboardDataState({
    isLoading: upcomingQuery.isLoading,
    isError: upcomingQuery.isError,
  });
  const workoutMemberships =
    acuityConfig?.appointmentTypes.workoutFor1
      ? getPortalWorkoutMemberships(
          certificatesQuery.data ?? [],
          acuityConfig.appointmentTypes.workoutFor1,
        )
      : [];
  const membershipState = getPackageLoadState({
    isLoading: acuityConfigQuery.isLoading || certificatesQuery.isLoading,
    isError: acuityConfigQuery.isError || certificatesQuery.isError,
    itemCount: workoutMemberships.length,
  });

  const handleMembershipCatalogClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!membershipsUrl) {
      event.preventDefault();
      return;
    }
    markMembershipCatalogOpened();
  };

  return (
    <Shell>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your fitness schedule.</p>
          <div className="flex items-center gap-3 mt-4">
            <Link href="/book">
              <Button size="lg" className="shadow-md">
                Book a Session
              </Button>
            </Link>
            <a
              href={membershipsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleMembershipCatalogClick}
              aria-disabled={!membershipsUrl}
            >
              <Button size="lg" className="shadow-md" disabled={!membershipsUrl}>
                Purchase a Membership
              </Button>
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ChangePasswordDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {summaryState === "loading" ? (
          <>
            <Card className="bg-card"><CardContent className="pt-6"><Skeleton className="h-10 w-16" /></CardContent></Card>
            <Card className="bg-card"><CardContent className="pt-6"><Skeleton className="h-10 w-16" /></CardContent></Card>
            <Card className="bg-primary border-transparent"><CardContent className="pt-6"><Skeleton className="h-10 w-full bg-black/10" /></CardContent></Card>
          </>
        ) : summaryState === "error" ? (
          <DashboardErrorState
            className="md:col-span-3"
            message="Session summary unavailable. Try again to load your counts and next session."
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : (
          <>
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
                <div className="text-4xl font-display font-bold text-foreground">
                  {summary?.upcomingCount ?? "—"}
                </div>
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
                <div className="text-4xl font-display font-bold text-foreground">
                  {summary?.pastCount ?? "—"}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary text-primary-foreground border-transparent relative overflow-hidden">
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
                {summary?.nextAppointment ? (
                  <div>
                    <div className="text-2xl font-display font-bold truncate text-primary-foreground">
                      {summary.nextAppointment.type}
                    </div>
                    <div className="text-sm text-primary-foreground/80 mt-1">
                      {formatStudioDate(summary.nextAppointment.date, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })} at {formatStudioTime(summary.nextAppointment.time)}
                    </div>
                  </div>
                ) : (
                  <div className="text-lg font-semibold text-primary-foreground/80 mt-2">
                    No sessions scheduled
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="space-y-6 mb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Your Memberships</h2>
          <span className="text-sm text-muted-foreground">Acuity balance</span>
        </div>
        {membershipState === "loading" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[104px] w-full rounded-2xl" />
            <Skeleton className="h-[104px] w-full rounded-2xl" />
          </div>
        ) : membershipState === "error" ? (
          <DashboardErrorState
            message="Membership data unavailable. Try again to load your active memberships."
            onRetry={() => {
              void Promise.all([
                acuityConfigQuery.refetch(),
                certificatesQuery.refetch(),
              ]);
            }}
          />
        ) : workoutMemberships.length === 0 ? (
          <Card className="bg-muted/30 border-dashed border-2">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No active Workout memberships found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workoutMemberships.map((membership) => (
              <Card key={membership.code} className="bg-card">
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-lg truncate">
                      {membership.productName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatMembershipBalance(membership.remainingValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Upcoming Appointments</h2>
          <Link href="/appointments" className="text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {upcomingState === "loading" ? (
          <div className="space-y-4">
            <Skeleton className="h-[140px] w-full rounded-2xl" />
            <Skeleton className="h-[140px] w-full rounded-2xl" />
          </div>
        ) : upcomingState === "error" ? (
          <DashboardErrorState
            message="Upcoming sessions unavailable. Try again to load your schedule."
            onRetry={() => void upcomingQuery.refetch()}
          />
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

function DashboardErrorState({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card className={`border-red-900/60 bg-red-950/20 ${className}`}>
      <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-5">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <p className="text-sm text-red-200 flex-1">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 shrink-0">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
