import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";

const router: IRouter = Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

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
  if (!ADMIN_EMAIL) {
    res.status(500).json({ error: "ADMIN_EMAIL not configured" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(req.userId);
    const email = user.emailAddresses[0]?.emailAddress;
    if (email !== ADMIN_EMAIL) {
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
        email: u.emailAddresses[0]?.emailAddress ?? "",
        createdAt: u.createdAt,
      }));
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch members" });
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

    // Build redirect URL to portal sign-up
    const origin = `${req.protocol}://${req.get("host")}`;
    const redirectUrl = `${origin}/sign-up`;

    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: email.trim().toLowerCase(),
        redirectUrl,
        publicMetadata: {
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
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
    try {
      await clerkClient.users.deleteUser(userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to remove member" });
    }
  },
);

export default router;
