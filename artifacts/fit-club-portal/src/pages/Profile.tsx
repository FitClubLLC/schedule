import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { AlertCircle, CheckCircle2, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Shell } from "@/components/layout/Shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const currentFirstName = user?.firstName?.trim() ?? "";
  const currentLastName = user?.lastName?.trim() ?? "";
  const displayName = [currentFirstName, currentLastName].filter(Boolean).join(" ") || "Member";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Email unavailable";
  const isAdmin = isConfiguredAdmin(user, import.meta.env.VITE_ADMIN_EMAIL);
  const [editFirstName, setEditFirstName] = useState(currentFirstName);
  const [editLastName, setEditLastName] = useState(currentLastName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  useEffect(() => {
    setEditFirstName(currentFirstName);
    setEditLastName(currentLastName);
  }, [user?.id, currentFirstName, currentLastName]);

  const trimmedEditFirstName = editFirstName.trim();
  const trimmedEditLastName = editLastName.trim();
  const nameChanged =
    trimmedEditFirstName !== currentFirstName ||
    trimmedEditLastName !== currentLastName;

  const handleNameChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    setNameFeedback(null);
  };

  const handleNameSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || isSavingName || !nameChanged) return;

    if (!trimmedEditFirstName && !trimmedEditLastName) {
      setNameFeedback({
        type: "error",
        message: "At least one of your first or last names must be provided.",
      });
      return;
    }

    setIsSavingName(true);
    setNameFeedback(null);

    try {
      const response = await fetch(`${basePath}/api/user/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: trimmedEditFirstName,
          lastName: trimmedEditLastName,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error ?? `Request failed (${response.status})`);
      }

      await user.reload();
      setEditFirstName(trimmedEditFirstName);
      setEditLastName(trimmedEditLastName);
      setNameFeedback({
        type: "success",
        message: "Your name was updated successfully.",
      });
    } catch (error) {
      setNameFeedback({
        type: "error",
        message: error instanceof Error
          ? error.message
          : "We couldn't update your name. Please try again.",
      });
    } finally {
      setIsSavingName(false);
    }
  };

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
              {getInitials(currentFirstName, currentLastName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-display font-bold">{displayName}</h2>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-6">
            <div>
              <h2 className="text-lg font-display font-bold">Your name</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Update the name used across your Fit Club account.
              </p>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleNameSave}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name">First Name</Label>
                  <Input
                    id="profile-first-name"
                    value={editFirstName}
                    onChange={(event) => handleNameChange(setEditFirstName, event.target.value)}
                    autoComplete="given-name"
                    disabled={isSavingName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name">Last Name</Label>
                  <Input
                    id="profile-last-name"
                    value={editLastName}
                    onChange={(event) => handleNameChange(setEditLastName, event.target.value)}
                    autoComplete="family-name"
                    disabled={isSavingName}
                  />
                </div>
              </div>

              {nameFeedback && (
                <Alert
                  variant={nameFeedback.type === "error" ? "destructive" : "default"}
                  className={nameFeedback.type === "success" ? "border-primary/40 text-primary" : undefined}
                >
                  {nameFeedback.type === "success"
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <AlertCircle className="h-4 w-4" />}
                  <AlertDescription>{nameFeedback.message}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={isSavingName || !nameChanged}>
                {isSavingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSavingName ? "Saving…" : "Save Name"}
              </Button>
            </form>
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