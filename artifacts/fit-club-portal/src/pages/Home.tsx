import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/react";
import { Redirect } from "wouter";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (isLoaded && isSignedIn) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="px-6 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <img src={`${basePath}/fitclub-logo.png`} alt="Fit Club" className="h-10 w-auto" />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-semibold hover:text-primary transition-colors text-foreground">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button className="hidden sm:flex rounded-full px-6 bg-primary text-black hover:bg-primary/90">Join Now</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 -mt-16 relative z-10">
        <div className="bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-8 inline-flex items-center text-sm font-semibold text-primary">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          GET IN. GET OUT. GET ON WITH LIFE.
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-display font-bold tracking-tight text-foreground max-w-3xl leading-tight uppercase">
          Master your fitness <br className="hidden sm:block" />
          <span className="text-primary">
            routine
          </span>
        </h1>
        
        <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Book sessions, track your appointments, and stay on top of your schedule. 
          The modern portal for Fit Club members.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href="/sign-up">
            <Button size="lg" className="rounded-full w-full sm:w-auto bg-primary text-black hover:bg-primary/90">
              Create an Account
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="rounded-full w-full sm:w-auto border-border text-foreground hover:bg-muted">
              Sign In to Portal
            </Button>
          </Link>
        </div>
      </main>
      
      {/* Abstract decorative elements */}
      <div className="fixed top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="fixed top-1/4 right-0 -translate-y-1/2 translate-x-1/3 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10" />
    </div>
  );
}
