import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  getPrimaryEmail,
  getProtectedDeleteReason,
  isConfiguredAdminEmail,
  parseConfiguredAdminEmails,
} from "../lib/admin-authorization.js";

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
