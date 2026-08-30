export const FINALIZATION_CONFIRMATION = "DELETE ACCOUNT";
export const COMPLETION_DISPOSITION = "completed_member_requested";

const MANUAL_REVIEW_DISPOSITION_CODES = new Set([
  "clerk_deletion_outcome_unknown",
  "clerk_user_absent_unknown",
]);

interface FinalizationRequestState {
  status: string;
  dispositionCode: string | null;
}

export function getFinalizationRequestBody() {
  return {
    confirmation: FINALIZATION_CONFIRMATION,
    dispositionCode: COMPLETION_DISPOSITION,
  } as const;
}

export function requiresDeletionManualReview(request: FinalizationRequestState) {
  return (
    request.status === "deleting" ||
    (request.dispositionCode !== null &&
      MANUAL_REVIEW_DISPOSITION_CODES.has(request.dispositionCode))
  );
}

export function canFinalizeDeletion(request: FinalizationRequestState) {
  return request.status === "approved" && !requiresDeletionManualReview(request);
}

export function isFinalizationReady({
  reconciliationAttested,
  confirmation,
  pending,
}: {
  reconciliationAttested: boolean;
  confirmation: string;
  pending: boolean;
}) {
  return (
    reconciliationAttested &&
    confirmation === FINALIZATION_CONFIRMATION &&
    !pending
  );
}

export function canRecordMemberConfirmation(request: {
  status: string;
  confirmationSentAt: string | null;
}) {
  return request.status === "completed" && request.confirmationSentAt === null;
}

export function safeFinalizationErrorMessage(status?: number) {
  if (status === 401) {
    return "Your admin session has expired. Sign in again and retry.";
  }
  if (status === 409) {
    return "Finalization requires manual review. No automatic retry is available.";
  }
  if (status === 502) {
    return "Finalization was not completed. The request remains approved for staff review.";
  }
  return "Finalization outcome could not be confirmed. Follow the protected manual recovery process; do not retry.";
}

export function manualReviewMessage(request: FinalizationRequestState) {
  if (request.dispositionCode === "clerk_user_absent_unknown") {
    return "The Clerk account could not be verified as present. Reconcile this request through the protected manual recovery process.";
  }
  if (request.dispositionCode === "clerk_deletion_outcome_unknown") {
    return "The Clerk deletion outcome could not be confirmed. Do not retry; resolve this request through the protected manual recovery process.";
  }
  return "Deletion is in progress or its outcome could not be confirmed. No automatic retry is available; resolve this request through the protected manual recovery process.";
}