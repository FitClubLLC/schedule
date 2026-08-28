import { useState } from "react";
import { useUser } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { isConfiguredAdmin, isConfiguredAdminEmail } from "@/lib/adminAccess";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const r = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: number;
}

export default function AdminPage() {
  const { user } = useUser();
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const isAdmin = isConfiguredAdmin(user, adminEmail);

  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const { data: members = [], isLoading: loadingMembers } = useQuery<Member[]>({
    queryKey: ["admin-members"],
    queryFn: () => apiFetch("/admin/members"),
    enabled: isAdmin,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch("/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email, firstName, lastName }),
      }),
    onSuccess: () => {
      setFeedback({ type: "success", msg: `Invite sent to ${email}` });
      setEmail("");
      setFirstName("");
      setLastName("");
    },
    onError: (err: Error) => {
      setFeedback({ type: "error", msg: err.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/admin/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-members"] }),
  });

  if (!isAdmin) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Access restricted.</p>
        </div>
      </Shell>
    );
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    inviteMutation.mutate();
  };

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Member Management</h1>
          <p className="text-muted-foreground mt-1">
            Invite new members and manage existing accounts.
          </p>
        </div>

        {/* Invite form */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="w-5 h-5 text-primary" />
              Invite a Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    required
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    required
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  {feedback.type === "success" ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {feedback.msg}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  inviteMutation.isPending ||
                  !email ||
                  !firstName.trim() ||
                  !lastName.trim()
                }
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Send Invite
              </Button>
            </form>
          </CardContent>
        </Card>

        <Separator />

        {/* Members list */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-bold tracking-tight">
            Current Members{" "}
            {!loadingMembers && (
              <span className="text-muted-foreground font-normal text-base">
                ({members.length})
              </span>
            )}
          </h2>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((m) => {
                   const isMe = m.id === user?.id;
                   const isProtectedAdmin = isConfiguredAdminEmail(m.email, adminEmail);
                  const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || "—";
                  const joined = new Date(m.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{name}</span>
                          {isMe && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary border border-primary/40 rounded px-1.5 py-0.5">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                        <div className="text-xs text-muted-foreground">Joined {joined}</div>
                      </div>
                       {!isMe && !isProtectedAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          title="Remove member"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (confirm(`Remove ${m.email} from Fit Club?`)) {
                              removeMutation.mutate(m.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
