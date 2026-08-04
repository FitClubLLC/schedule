import { useUser } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function Book() {
  const { user, isLoaded } = useUser();
  const calendarUrl = import.meta.env.VITE_ACUITY_CALENDAR_URL;

  if (!isLoaded) {
    return (
      <Shell>
        <div className="mb-8">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Card className="w-full h-[80vh] flex items-center justify-center bg-muted/20">
          <div className="flex flex-col items-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
            <span className="font-semibold">Loading booking calendar...</span>
          </div>
        </Card>
      </Shell>
    );
  }

  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  const iframeSrc = `${calendarUrl}&firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&email=${encodeURIComponent(email)}`;

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Book a Session</h1>
        <p className="text-muted-foreground mt-1">Select your trainer and time below. Your details are already pre-filled.</p>
      </div>

      <Card className="w-full overflow-hidden border border-border/60 shadow-sm bg-card">
        <iframe
          src={iframeSrc}
          title="Schedule Appointment"
          width="100%"
          className="h-[80vh] border-0"
          frameBorder="0"
        />
      </Card>
    </Shell>
  );
}
