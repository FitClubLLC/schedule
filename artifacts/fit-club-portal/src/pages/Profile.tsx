import { useClerk, useUser } from "@clerk/react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isConfiguredAdmin } from "@/lib/adminAccess";

function getInitials(firstName?: string | null, lastName?: string | null) {
  const initials = [firstName?.trim()[0], lastName?.trim()[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return initials || "M";
}

export default function Profile() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Member";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Email unavailable";
  const isAdmin = isConfiguredAdmin(user, import.meta.env.VITE_ADMIN_EMAIL);

  return (
    <Shell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Account</p>
          <h1 className="mt-2 text-3xl font-display font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-muted-foreground">Manage your Fit Club account.</p>
        </div>

        <Card className="bg-card">
          <CardContent className="flex items-center gap-4 p-6">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-xl font-bold text-primary"
              aria-hidden="true"
            >
              {getInitials(firstName, lastName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-display font-bold">{displayName}</h2>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="text-lg font-display font-bold">Account actions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the options below to manage access to your account.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ChangePasswordDialog />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="bg-card">
            <CardContent className="flex items-center justify-between gap-4 p-6">
              <div>
                <h2 className="text-lg font-display font-bold">Staff access</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open member management separately from the member tabs.
                </p>
              </div>
              <Link href="/admin">
                <Button variant="outline" className="shrink-0 gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Members
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}