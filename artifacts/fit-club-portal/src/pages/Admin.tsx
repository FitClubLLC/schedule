import { useState } from "react";
import { useUser } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  Trash2,
  Mail,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  ClipboardList,
  ChevronRight,
  ShieldAlert,
  Clock3,
  Check,
  RotateCcw,
} from "lucide-react";
import { isConfiguredAdmin, isConfiguredAdminEmail } from "@/lib/adminAccess";
import {
  canFinalizeDeletion,
  canRecordMemberConfirmation,
  getFinalizationRequestBody,
  isFinalizationReady,
  requiresDeletionManualReview,
} from "@/lib/adminDeletionFinalization";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ApiRequestError(
      typeof body?.error === "string" ? body.error : `HTTP ${r.status}`,
      r.status,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }
  return body as T;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: number;
}

interface PendingInvitation {
  email: string;
  status: string;
  createdAt: number;
}

type DeletionRequestStatus =
  | "pending"
  | "in_review"
  | "awaiting_member"
  | "approved"
  | "deleting"
  | "completed"
  | "withdrawn"
  | "declined";

interface AccountDeletionRequest {
  id: string;
  maskedEmail?: string;
  primaryEmailSnapshot?: string;
  status: DeletionRequestStatus;
  requestedAt: string;
  updatedAt: string;
  completedAt: string | null;
  confirmationSentAt: string | null;
  dispositionCode: string | null;
}

type DeletionDialog = "approve" | "decline" | "withdraw" | "finalize" | null;

const DECLINE_REASONS = [
  {
    code: "declined_protected_admin",
    label: "Protected/admin account",
  },
  {
    code: "declined_policy_or_legal_hold",
    label: "Policy/legal hold",
  },
  {
    code: "declined_business_reconciliation",
    label: "Business reconciliation issue",
  },
] as const;

function formatAdminDate(timestamp: number, includeTime = false) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", includeTime
    ? {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    : {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatDeletionDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deletionStatusLabel(status: DeletionRequestStatus) {
  switch (status) {
    case "in_review":
      return "In review";
    case "awaiting_member":
      return "Awaiting member";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function deletionStatusVariant(
  status: DeletionRequestStatus,
): "default" | "secondary" | "destructive" | "outline" | "success" {
  switch (status) {
    case "approved":
    case "completed":
      return "success";
    case "declined":
      return "destructive";
    case "deleting":
      return "secondary";
    default:
      return "outline";
  }
}

function safeDeletionErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "Your admin session has expired. Sign in again and retry.";
  }
  return "We couldn't load or update this request. Please try again.";
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
  const [pendingFeedback, setPendingFeedback] = useState<
    { type: "success" | "error"; msg: string } | null
  >(null);
  const [memberFeedback, setMemberFeedback] = useState<
    { type: "success" | "error"; msg: string } | null
  >(null);
  const [deletionFeedback, setDeletionFeedback] = useState<
    { type: "success" | "error"; msg: string } | null
  >(null);
  const [selectedDeletionRequestId, setSelectedDeletionRequestId] = useState<string | null>(null);
  const [deletionDialog, setDeletionDialog] = useState<DeletionDialog>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [acuityReconciled, setAcuityReconciled] = useState(false);
  const [finalizationConfirmation, setFinalizationConfirmation] = useState("");

  const { data: members = [], isLoading: loadingMembers } = useQuery<Member[]>({
    queryKey: ["admin-members"],
    queryFn: () => apiFetch("/admin/members"),
    enabled: isAdmin,
  });

  const {
    data: pendingInvitations = [],
    isLoading: loadingInvitations,
  } = useQuery<PendingInvitation[]>({
    queryKey: ["admin-pending-invitations"],
    queryFn: () => apiFetch("/admin/invitations/pending"),
    enabled: isAdmin,
  });

  const deletionRequestsQuery = useQuery<AccountDeletionRequest[]>({
    queryKey: ["admin-account-deletion-requests"],
    queryFn: () => apiFetch<AccountDeletionRequest[]>("/admin/account-deletion-requests"),
    enabled: isAdmin,
    retry: false,
  });

  const deletionDetailQuery = useQuery<AccountDeletionRequest>({
    queryKey: ["admin-account-deletion-request", selectedDeletionRequestId],
    queryFn: () =>
      apiFetch<AccountDeletionRequest>(
        `/admin/account-deletion-requests/${selectedDeletionRequestId}`,
      ),
    enabled: isAdmin && selectedDeletionRequestId !== null,
    retry: false,
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

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationEmail: string) =>
      apiFetch("/admin/invitations/pending/cancel", {
        method: "POST",
        body: JSON.stringify({ email: invitationEmail }),
      }),
    onSuccess: (_data, invitationEmail) => {
      setPendingFeedback({
        type: "success",
        msg: `Invitation canceled for ${invitationEmail}`,
      });
      qc.invalidateQueries({ queryKey: ["admin-pending-invitations"] });
    },
    onError: (err: Error) => {
      setPendingFeedback({ type: "error", msg: err.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/admin/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      setMemberFeedback({
        type: "success",
        msg: "Member removed successfully.",
      });
      void qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (error: unknown) => {
      setMemberFeedback({
        type: "error",
        msg:
          error instanceof ApiRequestError && error.status === 409
            ? "This member has an active account-deletion request. Process the request through Account Deletion Requests instead."
            : "We couldn't remove this member. Please try again.",
      });
    },
  });

  const deletionStatusMutation = useMutation({
    mutationFn: ({
      requestId,
      status,
      dispositionCode,
    }: {
      requestId: string;
      status: DeletionRequestStatus;
      dispositionCode?: string;
    }) =>
      apiFetch(`/admin/account-deletion-requests/${requestId}/status`, {
        method: "POST",
        body: JSON.stringify({ status, ...(dispositionCode ? { dispositionCode } : {}) }),
      }),
    onSuccess: async (_data, variables) => {
      setDeletionDialog(null);
      setDeclineReason("");
      try {
        await Promise.all([
          qc.refetchQueries({ queryKey: ["admin-account-deletion-requests"] }),
          qc.refetchQueries({
            queryKey: ["admin-account-deletion-request", variables.requestId],
          }),
        ]);
        setDeletionFeedback({
          type: "success",
          msg: "Request updated. The current server state is shown below.",
        });
      } catch {
        setDeletionFeedback({
          type: "error",
          msg: "The request changed, but we couldn't refresh the view. Please retry.",
        });
      }
    },
    onError: () => {
      setDeletionFeedback({
        type: "error",
        msg: "We couldn't update this request. Please try again.",
      });
    },
  });

  const resetFinalizationForm = () => {
    setAcuityReconciled(false);
    setFinalizationConfirmation("");
  };

  const finalizationMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiFetch(`/admin/account-deletion-requests/${requestId}/finalize`, {
        method: "POST",
        body: JSON.stringify(getFinalizationRequestBody()),
      }),
    onSuccess: async (_data, requestId) => {
      setDeletionDialog(null);
      resetFinalizationForm();
      try {
        await Promise.all([
          qc.refetchQueries({ queryKey: ["admin-account-deletion-requests"] }),
          qc.refetchQueries({ queryKey: ["admin-account-deletion-request", requestId] }),
        ]);
        setDeletionFeedback({
          type: "success",
          msg: "The member's FIT CLUB 15 sign-in account deletion is complete. Acuity data was not changed.",
        });
      } catch {
        setDeletionFeedback({
          type: "error",
          msg: "The request completed, but we couldn't refresh the view. Please retry.",
        });
      }
    },
    onError: async (error: unknown, requestId) => {
      setDeletionDialog(null);
      resetFinalizationForm();
      let refreshFailed = false;
      try {
        await Promise.all([
          qc.refetchQueries({ queryKey: ["admin-account-deletion-requests"] }),
          qc.refetchQueries({ queryKey: ["admin-account-deletion-request", requestId] }),
        ]);
      } catch {
        refreshFailed = true;
      }

      if (refreshFailed) {
        setDeletionFeedback({
          type: "error",
          msg: "We couldn't refresh the request after the finalization attempt. Please review the server state before taking any further action.",
        });
        return;
      }

      if (error instanceof ApiRequestError && error.status === 401) {
        setDeletionFeedback({
          type: "error",
          msg: "Your admin session has expired. Sign in again and review the request before retrying.",
        });
        return;
      }

      if (error instanceof ApiRequestError && error.status === 502) {
        setDeletionFeedback({
          type: "error",
          msg: "Clerk deletion was not completed and the request was safely returned to Approved. Reassess the request before trying again.",
        });
        return;
      }

      setDeletionFeedback({
        type: "error",
        msg: "Deletion requires manual review. The outcome could not be safely determined. Do not retry the deletion from the Portal.",
      });
    },
  });

  const confirmationSentMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiFetch(`/admin/account-deletion-requests/${requestId}/confirmation-sent`, {
        method: "POST",
      }),
    onSuccess: async (_data, requestId) => {
      try {
        await Promise.all([
          qc.refetchQueries({ queryKey: ["admin-account-deletion-requests"] }),
          qc.refetchQueries({ queryKey: ["admin-account-deletion-request", requestId] }),
        ]);
        setDeletionFeedback({
          type: "success",
          msg: "Confirmation-sent status recorded.",
        });
      } catch {
        setDeletionFeedback({
          type: "error",
          msg: "The status changed, but we couldn't refresh the view. Please retry.",
        });
      }
    },
    onError: () => {
      setDeletionFeedback({
        type: "error",
        msg: "We couldn't record the confirmation-sent status. Please try again.",
      });
    },
  });

  const selectedDeletionRequest = deletionDetailQuery.data;
  const deletionActionPending =
    deletionStatusMutation.isPending ||
    finalizationMutation.isPending ||
    confirmationSentMutation.isPending;
  const finalizationRequiresManualReview = selectedDeletionRequest
    ? requiresDeletionManualReview(selectedDeletionRequest)
    : false;
  const finalizationReady = selectedDeletionRequest
    ? canFinalizeDeletion(selectedDeletionRequest) &&
      isFinalizationReady({
        reconciliationAttested: acuityReconciled,
        confirmation: finalizationConfirmation,
        pending: finalizationMutation.isPending,
      })
    : false;

  const transitionDeletionRequest = (
    status: DeletionRequestStatus,
    dispositionCode?: string,
  ) => {
    if (!selectedDeletionRequestId) return;
    setDeletionFeedback(null);
    deletionStatusMutation.mutate({
      requestId: selectedDeletionRequestId,
      status,
      dispositionCode,
    });
  };

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

        {/* Account deletion requests */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="w-5 h-5 text-primary" />
              Account Deletion Requests
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review requests carefully before moving them through the staff workflow.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {deletionFeedback && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                  deletionFeedback.type === "success"
                    ? "bg-green-950/50 border border-green-800 text-green-300"
                    : "bg-red-950/50 border border-red-800 text-red-300"
                }`}
              >
                {deletionFeedback.type === "success" ? (
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span>{deletionFeedback.msg}</span>
              </div>
            )}

            {deletionRequestsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8" role="status">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="sr-only">Loading account deletion requests</span>
              </div>
            ) : deletionRequestsQuery.isError ? (
              <div className="rounded-lg border border-red-900/70 bg-red-950/20 px-4 py-4">
                <p className="text-sm text-red-200">
                  {safeDeletionErrorMessage(deletionRequestsQuery.error)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void deletionRequestsQuery.refetch()}
                  disabled={deletionRequestsQuery.isFetching}
                >
                  {deletionRequestsQuery.isFetching && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Retry
                </Button>
              </div>
            ) : deletionRequestsQuery.data?.length ? (
              <div className="space-y-2" aria-label="Account deletion requests">
                {deletionRequestsQuery.data.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setDeletionFeedback(null);
                      resetFinalizationForm();
                      setSelectedDeletionRequestId(request.id);
                    }}
                    aria-label={`Open account deletion request for ${request.maskedEmail ?? "masked member"}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {request.maskedEmail ?? "Masked email unavailable"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Requested {formatDeletionDate(request.requestedAt)} · Updated{" "}
                          {formatDeletionDate(request.updatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Badge variant={deletionStatusVariant(request.status)}>
                          {deletionStatusLabel(request.status)}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/70" />
                <p className="mt-2 text-sm font-medium">No account deletion requests.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New member requests will appear here for review.
                </p>
              </div>
            )}

            {selectedDeletionRequestId && (
              <div className="border-t border-border pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Request details</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Review the server-recorded request before taking an action.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDeletionRequestId(null);
                      setDeletionDialog(null);
                      setDeclineReason("");
                      resetFinalizationForm();
                    }}
                  >
                    Close details
                  </Button>
                </div>

                {deletionDetailQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8" role="status">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="sr-only">Loading request details</span>
                  </div>
                ) : deletionDetailQuery.isError ? (
                  <div className="rounded-lg border border-red-900/70 bg-red-950/20 px-4 py-4 mt-4">
                    <p className="text-sm text-red-200">
                      {safeDeletionErrorMessage(deletionDetailQuery.error)}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void deletionDetailQuery.refetch()}
                      disabled={deletionDetailQuery.isFetching}
                    >
                      {deletionDetailQuery.isFetching && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Retry
                    </Button>
                  </div>
                ) : selectedDeletionRequest ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Email snapshot</div>
                        <div className="mt-1 break-all text-sm font-medium">
                          {selectedDeletionRequest.primaryEmailSnapshot ?? "Unavailable"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="mt-1">
                          <Badge variant={deletionStatusVariant(selectedDeletionRequest.status)}>
                            {deletionStatusLabel(selectedDeletionRequest.status)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Requested</div>
                        <div className="mt-1 text-sm">{formatDeletionDate(selectedDeletionRequest.requestedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Last updated</div>
                        <div className="mt-1 text-sm">{formatDeletionDate(selectedDeletionRequest.updatedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                        <div className="mt-1 text-sm">{formatDeletionDate(selectedDeletionRequest.completedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Disposition</div>
                        <div className="mt-1 text-sm">
                          {selectedDeletionRequest.dispositionCode ?? "Not recorded"}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground">Member confirmation</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          {selectedDeletionRequest.confirmationSentAt ? (
                            <>
                              <Check className="h-4 w-4 text-green-400" aria-hidden="true" />
                              Sent {formatDeletionDate(selectedDeletionRequest.confirmationSentAt)}
                            </>
                          ) : (
                            <>
                              <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              Not sent
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                      <p>
                        Acuity reconciliation must be completed manually before approval.
                      </p>
                    </div>

                    {selectedDeletionRequest.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => transitionDeletionRequest("in_review")}
                          disabled={deletionActionPending}
                        >
                          {deletionStatusMutation.isPending &&
                          deletionStatusMutation.variables?.status === "in_review" ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : null}
                          Start Review
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletionDialog("withdraw")}
                          disabled={deletionActionPending}
                        >
                          Mark Withdrawn
                        </Button>
                      </div>
                    )}

                    {selectedDeletionRequest.status === "in_review" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            transitionDeletionRequest(
                              "awaiting_member",
                              "awaiting_member_information",
                            )
                          }
                          disabled={deletionActionPending}
                        >
                          {deletionStatusMutation.isPending &&
                          deletionStatusMutation.variables?.status === "awaiting_member" ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : null}
                          Mark Awaiting Member
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setDeletionDialog("approve")}
                          disabled={deletionActionPending}
                        >
                          Approve Request
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeclineReason("");
                            setDeletionDialog("decline");
                          }}
                          disabled={deletionActionPending}
                        >
                          Decline Request
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletionDialog("withdraw")}
                          disabled={deletionActionPending}
                        >
                          Mark Withdrawn
                        </Button>
                      </div>
                    )}

                    {selectedDeletionRequest.status === "awaiting_member" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => transitionDeletionRequest("in_review")}
                          disabled={deletionActionPending}
                        >
                          {deletionStatusMutation.isPending &&
                          deletionStatusMutation.variables?.status === "in_review" ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : null}
                          Resume Review
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletionDialog("withdraw")}
                          disabled={deletionActionPending}
                        >
                          Mark Withdrawn
                        </Button>
                      </div>
                    )}

                    {selectedDeletionRequest.status === "approved" &&
                      finalizationRequiresManualReview && (
                      <div className="rounded-lg border border-amber-800/70 bg-amber-950/20 px-4 py-4">
                        <div className="flex items-start gap-2">
                          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                          <div>
                            <h4 className="font-semibold text-amber-100">
                              Deletion Requires Manual Review
                            </h4>
                            <p className="mt-1 text-sm text-amber-100/80">
                              The Clerk account state could not be safely determined. Staff should
                              not retry the deletion from the Portal. Resolve this request through
                              the protected manual recovery process.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {canFinalizeDeletion(selectedDeletionRequest) && (
                      <div
                        className="space-y-4 rounded-lg border border-red-900/80 bg-red-950/20 px-4 py-4"
                        data-testid="section-finalize-deletion"
                      >
                        <div>
                          <div className="flex items-start gap-2">
                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                            <div>
                              <h4 className="font-semibold text-red-200">
                                Finalize Account Deletion
                              </h4>
                              <p className="mt-1 text-sm text-red-100/80">
                                This permanently removes the member&apos;s FIT CLUB 15 sign-in
                                account from Clerk. This action cannot be undone.
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-red-100/80">
                            Acuity records are not automatically changed by this action. Complete
                            the required Acuity reconciliation before continuing.
                          </p>
                        </div>

                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="acuity-reconciliation-attestation"
                            data-testid="checkbox-reconciliation-attestation"
                            checked={acuityReconciled}
                            onCheckedChange={(checked) => setAcuityReconciled(checked === true)}
                            disabled={deletionActionPending}
                          />
                          <Label
                            htmlFor="acuity-reconciliation-attestation"
                            className="cursor-pointer text-sm leading-5 text-foreground"
                          >
                            I have completed the required Acuity reconciliation for this member.
                          </Label>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="finalization-confirmation">
                            Type DELETE ACCOUNT to confirm
                          </Label>
                          <Input
                            id="finalization-confirmation"
                            data-testid="input-finalization-confirmation"
                            value={finalizationConfirmation}
                            onChange={(event) => setFinalizationConfirmation(event.target.value)}
                            placeholder="DELETE ACCOUNT"
                            autoComplete="off"
                            disabled={deletionActionPending}
                            aria-describedby="finalization-confirmation-help"
                          />
                          <p
                            id="finalization-confirmation-help"
                            className="text-xs text-muted-foreground"
                          >
                            The phrase is case-sensitive and must match exactly.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="destructive"
                          data-testid="button-open-finalize-deletion"
                          onClick={() => {
                            setDeletionFeedback(null);
                            setDeletionDialog("finalize");
                          }}
                          disabled={!finalizationReady}
                        >
                          {finalizationMutation.isPending && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Delete Account Permanently
                        </Button>
                      </div>
                    )}

                    {selectedDeletionRequest.status === "deleting" && (
                      <div className="rounded-lg border border-amber-800/70 bg-amber-950/20 px-4 py-4">
                        <div className="flex items-start gap-2">
                          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                          <div>
                            <h4 className="font-semibold text-amber-100">Deletion Requires Manual Review</h4>
                            <p className="mt-1 text-sm text-amber-100/80">
                              The deletion outcome could not be safely determined. Staff should
                              not retry the deletion from the Portal. Resolve this request through
                              the protected manual recovery process.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDeletionRequest.status === "completed" && (
                      <div
                        className="rounded-lg border border-green-800/70 bg-green-950/20 px-4 py-4"
                        data-testid="section-completed-deletion"
                      >
                        <h4 className="font-semibold text-green-200">Request completed</h4>
                        <p className="mt-1 text-sm text-green-100/80">
                          The member&apos;s FIT CLUB 15 sign-in account deletion is complete.
                          Acuity data was not changed by this action. No further deletion action is
                          available here.
                        </p>
                        {canRecordMemberConfirmation(selectedDeletionRequest) && (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm text-green-100/80">
                              Send the member their deletion-completion confirmation manually,
                              then record it here. This button only records that the email was sent;
                              it does not send the email.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid="button-mark-confirmation-sent"
                              onClick={() => {
                                setDeletionFeedback(null);
                                confirmationSentMutation.mutate(selectedDeletionRequest.id);
                              }}
                              disabled={deletionActionPending}
                            >
                              {confirmationSentMutation.isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              Mark Confirmation Sent
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {(selectedDeletionRequest.status === "withdrawn" ||
                      selectedDeletionRequest.status === "declined") && (
                      <div className="rounded-lg border border-border bg-muted/20 px-4 py-4">
                        <h4 className="font-semibold">
                          Request {deletionStatusLabel(selectedDeletionRequest.status)}
                        </h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          This is a terminal informational state. No further action is available.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

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

        {/* Pending invitations — read-only */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-bold tracking-tight">
            Pending Invitations{" "}
            {!loadingInvitations && (
              <span className="text-muted-foreground font-normal text-base">
                ({pendingInvitations.length})
              </span>
            )}
          </h2>

          {loadingInvitations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingInvitations.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No pending invitations.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div
                  key={`${invitation.email}-${invitation.createdAt}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {invitation.email}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Status: {invitation.status} · Sent{" "}
                      {formatAdminDate(invitation.createdAt, true)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={cancelInvitationMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Cancel the pending invitation for ${invitation.email}?\n\nThis will invalidate the invitation link.`,
                      );
                      if (confirmed) {
                        setPendingFeedback(null);
                        cancelInvitationMutation.mutate(invitation.email);
                      }
                    }}
                  >
                    {cancelInvitationMutation.isPending &&
                    cancelInvitationMutation.variables === invitation.email ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}

          {pendingFeedback && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                pendingFeedback.type === "success"
                  ? "bg-green-950/50 border border-green-800 text-green-300"
                  : "bg-red-950/50 border border-red-800 text-red-300"
              }`}
            >
              {pendingFeedback.type === "success" ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              {pendingFeedback.msg}
            </div>
          )}
        </div>

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
                        <div className="text-xs text-muted-foreground">
                          Joined {formatAdminDate(m.createdAt)}
                        </div>
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
          {memberFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                memberFeedback.type === "success"
                  ? "bg-green-950/50 border border-green-800 text-green-300"
                  : "bg-red-950/50 border border-red-800 text-red-300"
              }`}
            >
              {memberFeedback.type === "success" ? (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>{memberFeedback.msg}</span>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={deletionDialog === "finalize"}
        onOpenChange={(open) => {
          if (!open && !finalizationMutation.isPending) setDeletionDialog(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-finalize-deletion">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this member&apos;s account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the member&apos;s FIT CLUB 15 sign-in account. This
              cannot be undone. Acuity data is managed separately and will not be changed by this
              action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizationMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-finalize-deletion"
              onClick={() => {
                if (selectedDeletionRequestId && finalizationReady) {
                  finalizationMutation.mutate(selectedDeletionRequestId);
                }
              }}
              disabled={!finalizationReady}
            >
              {finalizationMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Permanently Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletionDialog === "approve"}
        onOpenChange={(open) => {
          if (!open && !deletionStatusMutation.isPending) setDeletionDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this deletion request?</AlertDialogTitle>
            <AlertDialogDescription>
              Acuity reconciliation is manual and must be completed before approval. Approval
              does not delete the Clerk account. Final deletion is a separate protected step and
              is not included in Stage B1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionStatusMutation.isPending}>
              Keep in review
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transitionDeletionRequest("approved")}
              disabled={deletionStatusMutation.isPending}
            >
              {deletionStatusMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Approve Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletionDialog === "decline"}
        onOpenChange={(open) => {
          if (!open && !deletionStatusMutation.isPending) {
            setDeletionDialog(null);
            setDeclineReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this deletion request?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the staff disposition that explains why this request cannot proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Reason</Label>
            <select
              id="decline-reason"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              disabled={deletionStatusMutation.isPending}
            >
              <option value="">Select a reason</option>
              {DECLINE_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionStatusMutation.isPending}>
              Keep in review
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transitionDeletionRequest("declined", declineReason)}
              disabled={!declineReason || deletionStatusMutation.isPending}
            >
              {deletionStatusMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Decline Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletionDialog === "withdraw"}
        onOpenChange={(open) => {
          if (!open && !deletionStatusMutation.isPending) setDeletionDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this request withdrawn?</AlertDialogTitle>
            <AlertDialogDescription>
              Continue only after staff has verified that the member requested withdrawal.
              This will record the disposition as withdrawn member verified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionStatusMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                transitionDeletionRequest("withdrawn", "withdrawn_member_verified")
              }
              disabled={deletionStatusMutation.isPending}
            >
              {deletionStatusMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Mark Withdrawn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
