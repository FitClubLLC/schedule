import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  getPrimaryEmail,
  getProtectedDeleteReason,
  isConfiguredAdminEmail,
  parseConfiguredAdminEmails,
} from "../lib/admin-authorization.js";
import {
  deletionRequestStore,
} from "../lib/account-deletion-request-store.js";
import type {
  AccountDeletionRequest,
  DeletionRequestStatus,
} from "@workspace/db";

const router: IRouter = Router();

function configuredAdminEmails(): string[] {
  return parseConfiguredAdminEmails(process.env.ADMIN_EMAIL);
}

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = auth.userId;
  next();
}

const DELETION_REQUEST_STATUSES: DeletionRequestStatus[] = [
  "pending",
  "in_review",
  "awaiting_member",
  "approved",
  "deleting",
  "completed",
  "withdrawn",
  "declined",
];

const STATUS_TRANSITIONS: Record<
  Exclude<DeletionRequestStatus, "deleting" | "completed">,
  DeletionRequestStatus[]
> = {
  pending: ["in_review", "withdrawn"],
  in_review: ["approved", "awaiting_member", "declined", "withdrawn"],
  awaiting_member: ["in_review", "withdrawn"],
  approved: [],
  withdrawn: [],
  declined: [],
};

const DISPOSITION_CODES = [
  "completed_member_requested",
  "withdrawn_member_verified",
  "declined_protected_admin",
  "declined_policy_or_legal_hold",
  "declined_business_reconciliation",
  "awaiting_member_information",
  "clerk_deletion_outcome_unknown",
  "clerk_user_absent_unknown",
] as const;

type DispositionCode = (typeof DISPOSITION_CODES)[number];

const TRANSITION_DISPOSITIONS: Partial<
  Record<DeletionRequestStatus, readonly DispositionCode[]>
> = {
  withdrawn: ["withdrawn_member_verified"],
  declined: [
    "declined_protected_admin",
    "declined_policy_or_legal_hold",
    "declined_business_reconciliation",
  ],
  awaiting_member: ["awaiting_member_information"],
};

function isDeletionRequestStatus(value: unknown): value is DeletionRequestStatus {
  return (
    typeof value === "string" &&
    DELETION_REQUEST_STATUSES.includes(value as DeletionRequestStatus)
  );
}

function isDispositionCode(value: unknown): value is DispositionCode {
  return (
    typeof value === "string" &&
    DISPOSITION_CODES.includes(value as DispositionCode)
  );
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function toAdminRequest(
  request: AccountDeletionRequest,
  includeEmail = false,
) {
  return {
    id: request.id,
    ...(includeEmail
      ? { primaryEmailSnapshot: request.primaryEmailSnapshot }
      : { maskedEmail: maskEmail(request.primaryEmailSnapshot) }),
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    completedAt: isoOrNull(request.completedAt),
    confirmationSentAt: isoOrNull(request.confirmationSentAt),
    dispositionCode: request.dispositionCode,
  };
}

function isClerkNotFoundError(error: any): boolean {
  return error?.status === 404 || error?.statusCode === 404;
}

function clientProvidedTargetIdentity(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, "clerkUserId") ||
    Object.prototype.hasOwnProperty.call(record, "targetUserId") ||
    Object.prototype.hasOwnProperty.call(record, "userId")
  );
}

function manualRecoveryResponse(res: any, message: string) {
  res.status(409).json({
    error: message,
    code: "FINALIZATION_REQUIRES_MANUAL_RECOVERY",
  });
}

async function requireAdmin(req: any, res: any, next: any) {
  const adminEmails = configuredAdminEmails();
  if (adminEmails.length === 0) {
    res.status(500).json({ error: "Admin authorization is not configured" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(req.userId);
    if (!isConfiguredAdminEmail(getPrimaryEmail(user), adminEmails)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get(
  "/admin/account-deletion-requests",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    const requestedStatus = req.query?.status;
    if (
      requestedStatus !== undefined &&
      !isDeletionRequestStatus(requestedStatus)
    ) {
      res.status(400).json({ error: "Invalid deletion request status" });
      return;
    }

    try {
      const requests = await deletionRequestStore.list(
        requestedStatus as DeletionRequestStatus | undefined,
      );
      res.json(requests.map((request) => toAdminRequest(request)));
    } catch {
      res.status(500).json({ error: "Failed to fetch deletion requests" });
    }
  },
);

router.get(
  "/admin/account-deletion-requests/:requestId",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    try {
      const request = await deletionRequestStore.getById(req.params.requestId);
      if (!request) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }
      res.json(toAdminRequest(request, true));
    } catch {
      res.status(500).json({ error: "Failed to fetch deletion request" });
    }
  },
);

router.post(
  "/admin/account-deletion-requests/:requestId/status",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    const { status, dispositionCode } = req.body ?? {};

    if (
      !isDeletionRequestStatus(status) ||
      status === "deleting" ||
      status === "completed"
    ) {
      res.status(400).json({ error: "Invalid deletion request transition" });
      return;
    }

    const allowedDispositions = TRANSITION_DISPOSITIONS[status];
    if (allowedDispositions) {
      if (
        !isDispositionCode(dispositionCode) ||
        !allowedDispositions.includes(dispositionCode)
      ) {
        res.status(400).json({
          error: "A valid disposition code is required for this transition",
        });
        return;
      }
    } else if (dispositionCode !== undefined) {
      res.status(400).json({ error: "Disposition is not valid for this transition" });
      return;
    }

    const from = (Object.entries(STATUS_TRANSITIONS) as Array<
      [Exclude<DeletionRequestStatus, "deleting" | "completed">, DeletionRequestStatus[]]
    >)
      .filter(([, destinations]) => destinations.includes(status))
      .map(([source]) => source);

    if (from.length === 0) {
      res.status(400).json({ error: "Status transition is not allowed" });
      return;
    }

    try {
      const updated = await deletionRequestStore.transitionStatus({
        requestId: req.params.requestId,
        from,
        to: status,
        dispositionCode,
      });
      if (updated) {
        res.json({ deletionRequest: toAdminRequest(updated, true) });
        return;
      }

      const existing = await deletionRequestStore.getById(req.params.requestId);
      if (!existing) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }
      res.status(409).json({ error: "Status transition is no longer valid" });
    } catch {
      res.status(500).json({ error: "Failed to update deletion request" });
    }
  },
);

async function finishKnownClerkDeletion(
  request: AccountDeletionRequest,
  actorUserId: string,
  res: any,
): Promise<boolean> {
  if (!request.clerkDeletionSucceededAt) return false;

  try {
    const completed = await deletionRequestStore.completeFinalization({
      requestId: request.id,
      completedBy: actorUserId,
      dispositionCode: "completed_member_requested",
    });
    if (completed) {
      res.json({ deletionRequest: toAdminRequest(completed, true) });
      return true;
    }

    const current = await deletionRequestStore.getById(request.id);
    if (current?.status === "completed") {
      res.json({ deletionRequest: toAdminRequest(current, true) });
      return true;
    }
  } catch {
    // The caller returns a generic recovery error below.
  }

  res.status(500).json({
    error: "Clerk deletion is recorded, but completion could not be finalized",
    code: "COMPLETION_UPDATE_FAILED",
  });
  return true;
}

router.post(
  "/admin/account-deletion-requests/:requestId/finalize",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    if (clientProvidedTargetIdentity(req.body)) {
      res.status(400).json({
        error: "Target identity must come from the deletion request",
      });
      return;
    }
    if (req.body?.confirmation !== "DELETE ACCOUNT") {
      res.status(400).json({
        error: 'Confirmation must be exactly "DELETE ACCOUNT"',
      });
      return;
    }
    if (req.body?.dispositionCode !== "completed_member_requested") {
      res.status(400).json({
        error: "A valid completion disposition is required",
      });
      return;
    }

    const requestId = req.params.requestId;
    try {
      let request = await deletionRequestStore.getById(requestId);
      if (!request) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }

      if (request.status === "completed") {
        res.json({ deletionRequest: toAdminRequest(request, true) });
        return;
      }

      if (request.status === "deleting") {
        await finishKnownClerkDeletion(request, req.userId, res);
        if (request.clerkDeletionSucceededAt) return;
        if (!request.clerkDeletionSucceededAt) {
          await deletionRequestStore.setOperationalDisposition(
            requestId,
            "deleting",
            "clerk_deletion_outcome_unknown",
          );
          manualRecoveryResponse(
            res,
            "Finalization outcome requires manual recovery",
          );
          return;
        }
      }

      if (request.status !== "approved") {
        res.status(409).json({
          error: "Only approved deletion requests can be finalized",
        });
        return;
      }

      const adminEmails = configuredAdminEmails();
      if (adminEmails.length === 0) {
        res.status(500).json({ error: "Admin authorization is not configured" });
        return;
      }

      let targetUser: any;
      try {
        targetUser = await clerkClient.users.getUser(request.clerkUserId);
      } catch (error) {
        if (isClerkNotFoundError(error)) {
          await deletionRequestStore.setOperationalDisposition(
            requestId,
            "approved",
            "clerk_user_absent_unknown",
          );
          manualRecoveryResponse(
            res,
            "The Clerk account is absent and requires manual recovery",
          );
          return;
        }
        res.status(502).json({ error: "Unable to verify the Clerk account" });
        return;
      }

      const targetPrimaryEmail = getPrimaryEmail(targetUser);
      if (!targetPrimaryEmail) {
        res.status(409).json({
          error: "The Clerk account identity could not be verified",
        });
        return;
      }

      const protectedReason = getProtectedDeleteReason({
        actingUserId: req.userId,
        targetUserId: request.clerkUserId,
        targetPrimaryEmail,
        configuredAdminEmails: adminEmails,
      });
      if (protectedReason === "self") {
        res.status(403).json({
          error: "Administrators cannot delete their own account",
        });
        return;
      }
      if (protectedReason === "protected-admin") {
        res.status(403).json({
          error: "Protected administrator accounts cannot be deleted",
        });
        return;
      }

      const claimed = await deletionRequestStore.claimFinalization(requestId);
      if (!claimed) {
        const current = await deletionRequestStore.getById(requestId);
        if (current?.status === "deleting") {
          if (current.clerkDeletionSucceededAt) {
            await finishKnownClerkDeletion(current, req.userId, res);
            return;
          }
          await deletionRequestStore.setOperationalDisposition(
            requestId,
            "deleting",
            "clerk_deletion_outcome_unknown",
          );
          manualRecoveryResponse(
            res,
            "Finalization is already in progress or requires manual recovery",
          );
          return;
        }
        res.status(409).json({
          error: "Deletion request is no longer approved",
        });
        return;
      }

      request = claimed;

      let targetUserAfterClaim: any;
      try {
        targetUserAfterClaim = await clerkClient.users.getUser(
          request.clerkUserId,
        );
      } catch (error) {
        if (isClerkNotFoundError(error)) {
          await deletionRequestStore.setOperationalDisposition(
            requestId,
            "deleting",
            "clerk_user_absent_unknown",
          );
          manualRecoveryResponse(
            res,
            "The Clerk account became absent and requires manual recovery",
          );
          return;
        }
        await deletionRequestStore.transitionStatus({
          requestId,
          from: ["deleting"],
          to: "approved",
          dispositionCode: null,
        });
        res.status(502).json({
          error: "Unable to reverify the Clerk account; the request is ready to retry",
        });
        return;
      }

      const targetPrimaryEmailAfterClaim = getPrimaryEmail(targetUserAfterClaim);
      if (!targetPrimaryEmailAfterClaim) {
        await deletionRequestStore.transitionStatus({
          requestId,
          from: ["deleting"],
          to: "approved",
          dispositionCode: null,
        });
        res.status(409).json({
          error: "The Clerk account identity could not be verified",
        });
        return;
      }

      const protectedReasonAfterClaim = getProtectedDeleteReason({
        actingUserId: req.userId,
        targetUserId: request.clerkUserId,
        targetPrimaryEmail: targetPrimaryEmailAfterClaim,
        configuredAdminEmails: adminEmails,
      });
      if (protectedReasonAfterClaim === "self") {
        await deletionRequestStore.transitionStatus({
          requestId,
          from: ["deleting"],
          to: "declined",
          dispositionCode: "declined_protected_admin",
        });
        res.status(403).json({
          error: "Administrators cannot delete their own account",
        });
        return;
      }
      if (protectedReasonAfterClaim === "protected-admin") {
        await deletionRequestStore.transitionStatus({
          requestId,
          from: ["deleting"],
          to: "declined",
          dispositionCode: "declined_protected_admin",
        });
        res.status(403).json({
          error: "Protected administrator accounts cannot be deleted",
        });
        return;
      }

      try {
        await clerkClient.users.deleteUser(request.clerkUserId);
      } catch (error) {
        let targetStillPresent = false;
        try {
          await clerkClient.users.getUser(request.clerkUserId);
          targetStillPresent = true;
        } catch {
          targetStillPresent = false;
        }

        if (targetStillPresent) {
          const restored = await deletionRequestStore.transitionStatus({
            requestId,
            from: ["deleting"],
            to: "approved",
            dispositionCode: null,
          });
          if (restored) {
            res.status(502).json({
              error: "Clerk deletion failed; the request is ready to retry",
            });
            return;
          }
        }

        await deletionRequestStore.setOperationalDisposition(
          requestId,
          "deleting",
          isClerkNotFoundError(error)
            ? "clerk_user_absent_unknown"
            : "clerk_deletion_outcome_unknown",
        );
        manualRecoveryResponse(
          res,
          "Clerk deletion outcome requires manual recovery",
        );
        return;
      }

      let marked: AccountDeletionRequest | null;
      try {
        marked = await deletionRequestStore.recordClerkDeletionSuccess(
          requestId,
        );
      } catch {
        res.status(500).json({
          error:
            "Clerk deletion succeeded, but its outcome could not be durably recorded",
          code: "FINALIZATION_OUTCOME_UNKNOWN",
        });
        return;
      }
      if (!marked) {
        manualRecoveryResponse(
          res,
          "Clerk deletion succeeded but could not be durably recorded",
        );
        return;
      }

      try {
        const completed = await deletionRequestStore.completeFinalization({
          requestId,
          completedBy: req.userId,
          dispositionCode: "completed_member_requested",
        });
        if (completed) {
          res.json({ deletionRequest: toAdminRequest(completed, true) });
          return;
        }

        const current = await deletionRequestStore.getById(requestId);
        if (current?.status === "completed") {
          res.json({ deletionRequest: toAdminRequest(current, true) });
          return;
        }
        res.status(500).json({
          error:
            "Clerk deletion succeeded, but completion could not be recorded",
          code: "COMPLETION_UPDATE_FAILED",
        });
      } catch {
        res.status(500).json({
          error:
            "Clerk deletion succeeded, but completion could not be recorded",
          code: "COMPLETION_UPDATE_FAILED",
        });
      }
    } catch {
      res.status(500).json({ error: "Failed to finalize deletion request" });
    }
  },
);

router.post(
  "/admin/account-deletion-requests/:requestId/confirmation-sent",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    try {
      const request = await deletionRequestStore.getById(req.params.requestId);
      if (!request) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }
      if (request.status !== "completed") {
        res.status(409).json({
          error: "Confirmation can only be recorded for completed requests",
        });
        return;
      }

      const updated = await deletionRequestStore.markConfirmationSent(
        request.id,
      );
      if (!updated) {
        res.status(500).json({ error: "Failed to record confirmation sent" });
        return;
      }
      res.json({ deletionRequest: toAdminRequest(updated, true) });
    } catch {
      res.status(500).json({ error: "Failed to record confirmation sent" });
    }
  },
);

// GET /admin/members — list all Clerk users
router.get(
  "/admin/members",
  requireAuth,
  requireAdmin,
  async (_req: any, res): Promise<void> => {
    try {
      const response = await clerkClient.users.getUserList({ limit: 500 });
      const members = response.data.map((u) => ({
        id: u.id,
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        email: getPrimaryEmail(u) ?? "",
        createdAt: u.createdAt,
      }));
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  },
);

// GET /admin/invitations/pending — list pending Clerk invitations
router.get(
  "/admin/invitations/pending",
  requireAuth,
  requireAdmin,
  async (_req: any, res): Promise<void> => {
    try {
      const response = await clerkClient.invitations.getInvitationList({
        status: "pending",
        orderBy: "-created_at",
        limit: 500,
      });
      const invitations = response.data.map((invitation) => ({
        email: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
      }));
      res.json(invitations);
    } catch {
      res.status(500).json({ error: "Failed to fetch pending invitations" });
    }
  },
);

// POST /admin/invitations/pending/cancel — revoke one pending Clerk invitation
router.post(
  "/admin/invitations/pending/cancel",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    const requestedEmail =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!requestedEmail) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    try {
      const response = await clerkClient.invitations.getInvitationList({
        status: "pending",
        orderBy: "-created_at",
        limit: 500,
      });
      const matches = response.data.filter(
        (invitation) => invitation.emailAddress.trim().toLowerCase() === requestedEmail,
      );

      if (matches.length === 0) {
        res.status(404).json({ error: "Pending invitation not found" });
        return;
      }
      if (matches.length > 1) {
        res.status(409).json({ error: "Multiple pending invitations match this email" });
        return;
      }

      await clerkClient.invitations.revokeInvitation(matches[0].id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.status === 404 || err?.statusCode === 404) {
        res.status(404).json({ error: "Pending invitation not found" });
        return;
      }
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  },
);

// POST /admin/invite — send a Clerk invitation email
router.post(
  "/admin/invite",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    const { email, firstName, lastName } = req.body ?? {};
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }
    const trimmedFirstName = typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLastName = typeof lastName === "string" ? lastName.trim() : "";
    if (!trimmedFirstName || !trimmedLastName) {
      res.status(400).json({ error: "firstName and lastName are required." });
      return;
    }

    // Build redirect URL to portal sign-up
    const origin = `${req.protocol}://${req.get("host")}`;
    const redirectUrl = `${origin}/sign-up`;

    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: email.trim().toLowerCase(),
        redirectUrl,
        publicMetadata: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        },
        notify: true,
        ignoreExisting: false,
      });
      res.json({ success: true });
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        "Failed to send invitation";
      res.status(400).json({ error: msg });
    }
  },
);

// DELETE /admin/members/:userId — remove a member from Clerk
router.delete(
  "/admin/members/:userId",
  requireAuth,
  requireAdmin,
  async (req: any, res): Promise<void> => {
    const { userId } = req.params;
    const adminEmails = configuredAdminEmails();

    if (adminEmails.length === 0) {
      res.status(500).json({ error: "Admin authorization is not configured" });
      return;
    }

    try {
      const targetUser = await clerkClient.users.getUser(userId);
      const protectedReason = getProtectedDeleteReason({
        actingUserId: req.userId,
        targetUserId: userId,
        targetPrimaryEmail: getPrimaryEmail(targetUser),
        configuredAdminEmails: adminEmails,
      });

      if (protectedReason === "self") {
        res.status(403).json({ error: "Administrators cannot delete their own account" });
        return;
      }
      if (protectedReason === "protected-admin") {
        res.status(403).json({ error: "Protected administrator accounts cannot be deleted" });
        return;
      }

      const activeDeletionRequest =
        await deletionRequestStore.getActive(userId);
      if (activeDeletionRequest) {
        res.status(409).json({
          error:
            "This member has an active account-deletion request; use the deletion-request workflow",
        });
        return;
      }

      await clerkClient.users.deleteUser(userId);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.status === 404 || err?.statusCode === 404) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      res.status(500).json({ error: "Failed to remove member" });
    }
  },
);

export default router;
