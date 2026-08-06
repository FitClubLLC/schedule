/**
 * Translates technical API/network errors into plain-English messages
 * suitable for displaying to members.
 */
export function friendlyError(err: unknown): string {
  const msg = String((err as any)?.message ?? '');
  const status = (err as any)?.status as number | undefined;
  const lower = msg.toLowerCase();

  // Network / offline
  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('timeout')
  ) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  // Auth / session expired
  if (status === 401 || lower.includes('not signed in') || lower.includes('unauthorized')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Server / Acuity unavailable
  if (status === 502 || status === 503 || status === 504 || lower.includes('unavailable')) {
    return 'Booking is temporarily unavailable. Please try again shortly.';
  }

  // Membership / certificate not found
  if (
    lower.includes('certificate') ||
    lower.includes('membership') ||
    lower.includes('no active')
  ) {
    return 'We could not find an active membership for this account. Contact Fit Club for help.';
  }

  // Generic fallback
  return 'Something went wrong. Please try again.';
}
