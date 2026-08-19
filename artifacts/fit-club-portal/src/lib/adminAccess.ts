interface ClerkUserForAdmin {
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function configuredAdminEmails(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(normalizeEmail)
    .filter((email): email is string => Boolean(email));
}

export function getPrimaryUserEmail(user: ClerkUserForAdmin | null | undefined): string | null {
  if (!user?.primaryEmailAddressId) return null;
  return (
    user.emailAddresses?.find(
      (email) => email.id === user.primaryEmailAddressId,
    )?.emailAddress ?? null
  );
}

export function isConfiguredAdminEmail(
  email: unknown,
  configuredEmail: unknown,
): boolean {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(
    normalizedEmail &&
      configuredAdminEmails(configuredEmail).includes(normalizedEmail),
  );
}

export function isConfiguredAdmin(
  user: ClerkUserForAdmin | null | undefined,
  configuredEmail: unknown,
): boolean {
  return isConfiguredAdminEmail(getPrimaryUserEmail(user), configuredEmail);
}