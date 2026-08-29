import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  PREFERRED_LOCATION_METADATA_KEY,
  mergePreferredLocationMetadata,
  parsePreferredLocationKey,
  readPreferredLocationKey,
} from "../lib/user-preferences.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = auth.userId;
  next();
}

// PATCH /api/user/profile — update the authenticated user's display name.
// Uses the Clerk admin SDK server-side so it works regardless of whether
// "Name" is configured as user-editable in Clerk's settings.
router.patch("/user/profile", requireAuth, async (req: any, res: any) => {
  const { firstName, lastName } = req.body ?? {};

  if (typeof firstName !== "string" || typeof lastName !== "string") {
    res.status(400).json({ error: "firstName and lastName are required strings." });
    return;
  }

  const trimFirst = firstName.trim();
  const trimLast = lastName.trim();

  if (!trimFirst && !trimLast) {
    res.status(400).json({ error: "At least one of firstName or lastName must be non-empty." });
    return;
  }

  try {
    const updated = await clerkClient.users.updateUser(req.userId, {
      firstName: trimFirst || undefined,
      lastName: trimLast || undefined,
    });

    res.json({
      firstName: updated.firstName,
      lastName: updated.lastName,
    });
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage ??
      err?.errors?.[0]?.message ??
      "Failed to update profile.";
    res.status(500).json({ error: msg });
  }
});

// GET /api/user/preferences — read the authenticated user's account preference.
// A missing or invalid stored value is explicitly represented as null.
router.get("/user/preferences", requireAuth, async (req: any, res: any) => {
  try {
    const user = await clerkClient.users.getUser(req.userId);
    res.json({
      preferredLocationKey: readPreferredLocationKey(user.publicMetadata),
    });
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage ??
      err?.errors?.[0]?.message ??
      "Failed to read user preferences.";
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/user/preferences — update only the authenticated user's
// Preferred Location. The namespace merge preserves invitation/name-repair
// metadata and any other unrelated public metadata.
router.patch("/user/preferences", requireAuth, async (req: any, res: any) => {
  const body = req.body;
  const hasPreferredLocationKey =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.prototype.hasOwnProperty.call(body, PREFERRED_LOCATION_METADATA_KEY);

  if (!hasPreferredLocationKey || Object.keys(body).length !== 1) {
    res.status(400).json({
      error: `${PREFERRED_LOCATION_METADATA_KEY} is the only accepted field and must be "potomac", "kentlands", or null.`,
    });
    return;
  }

  const parsed = parsePreferredLocationKey(
    body[PREFERRED_LOCATION_METADATA_KEY],
  );
  if (!parsed.ok) {
    res.status(400).json({
      error: `${PREFERRED_LOCATION_METADATA_KEY} must be "potomac", "kentlands", or null.`,
    });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(req.userId);
    const publicMetadata = mergePreferredLocationMetadata(
      user.publicMetadata,
      parsed.value,
    );
    await clerkClient.users.updateUserMetadata(req.userId, {
      publicMetadata,
    });

    res.json({
      preferredLocationKey: parsed.value,
    });
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage ??
      err?.errors?.[0]?.message ??
      "Failed to update user preferences.";
    res.status(500).json({ error: msg });
  }
});

// POST /api/user/name-repair — fill missing standard names from invitation metadata.
// This is intentionally fill-only so it cannot overwrite a member's existing name.
router.post("/user/name-repair", requireAuth, async (req: any, res: any) => {
  try {
    const user = await clerkClient.users.getUser(req.userId);
    const publicMetadata =
      user.publicMetadata && typeof user.publicMetadata === "object"
        ? user.publicMetadata as Record<string, unknown>
        : {};

    const metadataName = (key: "firstName" | "lastName"): string | undefined => {
      const value = publicMetadata[key];
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed && trimmed.length <= 100 ? trimmed : undefined;
    };

    const updates: { firstName?: string; lastName?: string } = {};
    if (!user.firstName?.trim()) {
      const firstName = metadataName("firstName");
      if (firstName) updates.firstName = firstName;
    }
    if (!user.lastName?.trim()) {
      const lastName = metadataName("lastName");
      if (lastName) updates.lastName = lastName;
    }

    if (Object.keys(updates).length === 0) {
      res.json({
        repaired: false,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      return;
    }

    const updated = await clerkClient.users.updateUser(req.userId, updates);
    res.json({
      repaired: true,
      firstName: updated.firstName,
      lastName: updated.lastName,
    });
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage ??
      err?.errors?.[0]?.message ??
      "Failed to repair profile name.";
    res.status(500).json({ error: msg });
  }
});

export default router;
