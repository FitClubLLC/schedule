import { useState } from "react";
import { useGetAppointmentSummary, useGetUpcomingAppointments } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, CalendarRange, History, ArrowRight, KeyRound, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/AppointmentCard";
import { formatStudioDate, formatStudioTime } from "@/lib/studioTime";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@clerk/react";
import { getAcuityMembershipCatalogUrl } from "@workspace/api-client-react";
import { useAcuityConfig } from "@/hooks/useBookingApi";
import { markMembershipCatalogOpened } from "@/lib/membershipCatalogReturn";

function ChangePasswordDialog() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setShowCurrent(false); setShowNext(false);
    setFeedback(null); setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (next !== confirm) {
      setFeedback({ type: "error", msg: "New passwords don't match." });
      return;
    }
    if (next.length < 8) {
      setFeedback({ type: "error", msg: "New password must be at least 8 characters." });
      return;
    }
    setLoading(true);
    try {
      await user?.updatePassword({ currentPassword: current, newPassword: next });
      setFeedback({ type: "success", msg: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        "Failed to update password. Check your current password and try again.";
      setFeedback({ type: "error", msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <KeyRound className="w-4 h-4" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="current-pw">Current password</Label>
            <div className="relative">
              <Input
                id="current-pw"
                type={showCurrent ? "text" : "password"}
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNext ? "text" : "password"}
                required
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "bg-green-950/50 border border-green-800 text-green-300"
                  : "bg-red-950/50 border border-red-800 text-red-300"
              }`}
            >
              {feedback.type === "success"
                ? <CheckCircle className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />}
              {feedback.msg}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !current || !next || !confirm}>
              {loading ? "Saving…" : "Update Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAppointmentSummary();
  const { data: upcoming, isLoading: isLoadingUpcoming } = useGetUpcomingAppointments();
  const { data: acuityConfig } = useAcuityConfig();
  const membershipsUrl = acuityConfig
    ? getAcuityMembershipCatalogUrl(acuityConfig.ownerId)
    : undefined;

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
