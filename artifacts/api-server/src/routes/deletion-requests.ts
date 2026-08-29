import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { getPrimaryEmail } from "../lib/admin-authorization.js";
import {
  deletionRequestStore,
  type DeletionRequestStore,
} from "../lib/account-deletion-request-store.js";

const router: IRouter = Router();

const INVALID_CONFIRMATION_ERROR =
  'Confirmation must be exactly "DELETE" to submit an account deletion request.';
const MISSING_PRIMARY_EMAIL_ERROR =
  "A primary email address is required to submit an account deletion request.";
const GENERIC_REQUEST_ERROR =
  "Unable to process the account deletion request.";

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = auth.userId;
  next();
}

function toPublicRequest(request: {
  id: string;
  status: string;
  requestedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: request.id,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function createDeletionRequestRouter(
  store: DeletionRequestStore = deletionRequestStore,
): IRouter {
  const deletionRequestRouter: IRouter = Router();

  deletionRequestRouter.post(
    "/user/deletion-request",
    requireAuth,
    async (req: any, res: any) => {
      if (req.body?.confirmation !== "DELETE") {
        res.status(400).json({ error: INVALID_CONFIRMATION_ERROR });
        return;
      }

      try {
        const user = await clerkClient.users.getUser(req.userId);
        const primaryEmail = getPrimaryEmail(user)?.trim();

        if (!primaryEmail) {
          res.status(400).json({ error: MISSING_PRIMARY_EMAIL_ERROR });
          return;
        }

        const result = await store.createOrGetActive({
          clerkUserId: req.userId,
          primaryEmailSnapshot: primaryEmail,
        });

        res.status(result.created ? 201 : 200).json({
          deletionRequest: toPublicRequest(result.request),
        });
      } catch {
        res.status(500).json({ error: GENERIC_REQUEST_ERROR });
      }
    },
  );

  deletionRequestRouter.get(
    "/user/deletion-request",
    requireAuth,
    async (req: any, res: any) => {
      try {
        const request = await store.getActive(req.userId);
        res.json({
          deletionRequest: request ? toPublicRequest(request) : null,
        });
      } catch {
        res.status(500).json({ error: GENERIC_REQUEST_ERROR });
      }
    },
  );

  return deletionRequestRouter;
}

export default createDeletionRequestRouter();