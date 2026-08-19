export interface ClerkEmailAddressLike {
  id: string;
  emailAddress: string;
}

export interface ClerkUserLike {
  primaryEmailAddressId?: string | null;
  emailAddresses?: ClerkEmailAddressLike[];
}

export type ProtectedDeleteReason = "self" | "protected-admin";

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * Clerk's primaryEmailAddressId is the identity used for admin authorization.
 * Do not silently substitute an arbitrary secondary address.
 */
export function getPrimaryEmail(user: ClerkUserLike): string | null {
  if (!user.primaryEmailAddressId) return null;
  return (
    user.emailAddresses?.find(
      (email) => email.id === user.primaryEmailAddressId,
    )?.emailAddress ?? null
  );
}

export function parseConfiguredAdminEmails(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(normalizeEmail)
    .filter((email): email is string => Boolean(email));
}

export function isConfiguredAdminEmail(
  email: unknown,
  configuredAdminEmails: string[],
): boolean {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(
    normalizedEmail &&
      configuredAdminEmails.some(
        (configured) => normalizeEmail(configured) === normalizedEmail,
      ),
  );
}

export function getProtectedDeleteReason({
  actingUserId,
  targetUserId,
  targetPrimaryEmail,
  configuredAdminEmails,
}: {
  actingUserId: string;
  targetUserId: string;
  targetPrimaryEmail: string | null;
  configuredAdminEmails: string[];
}): ProtectedDeleteReason | null {
  if (actingUserId === targetUserId) return "self";
  if (isConfiguredAdminEmail(targetPrimaryEmail, configuredAdminEmails)) {
    return "protected-admin";
  }
  return null;
}