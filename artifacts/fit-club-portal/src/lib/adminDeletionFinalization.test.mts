import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPLETION_DISPOSITION,
  FINALIZATION_CONFIRMATION,
  canFinalizeDeletion,
  canRecordMemberConfirmation,
  getFinalizationRequestBody,
  isFinalizationReady,
  manualReviewMessage,
  requiresDeletionManualReview,
  safeFinalizationErrorMessage,
} from "./adminDeletionFinalization.ts";

test("only ordinary approved requests expose finalization", () => {
  assert.equal(
    canFinalizeDeletion({ status: "approved", dispositionCode: null }),
    true,
  );

  for (const status of [
    "pending",
    "in_review",
    "awaiting_member",
    "deleting",
    "completed",
    "withdrawn",
    "declined",
  ]) {
    assert.equal(
      canFinalizeDeletion({ status, dispositionCode: null }),
      false,
      `${status} must not be finalizable`,
    );
  }

  assert.equal(
    canFinalizeDeletion({
      status: "approved",
      dispositionCode: "clerk_user_absent_unknown",
    }),
    false,
  );
});

test("finalization requires Acuity attestation and exact confirmation", () => {
  assert.equal(
    isFinalizationReady({
      reconciliationAttested: false,
      confirmation: FINALIZATION_CONFIRMATION,
      pending: false,
    }),
    false,
  );
  assert.equal(
    isFinalizationReady({
      reconciliationAttested: true,
      confirmation: "delete account",
      pending: false,
    }),
    false,
  );
  assert.equal(
    isFinalizationReady({
      reconciliationAttested: true,
      confirmation: FINALIZATION_CONFIRMATION,
      pending: true,
    }),
    false,
  );
  assert.equal(
    isFinalizationReady({
      reconciliationAttested: true,
      confirmation: FINALIZATION_CONFIRMATION,
      pending: false,
    }),
    true,
  );
});

test("finalization payload contains only the audited confirmation fields", () => {
  const body = getFinalizationRequestBody();
  assert.deepEqual(body, {
    confirmation: "DELETE ACCOUNT",
    dispositionCode: "completed_member_requested",
  });
  assert.deepEqual(Object.keys(body).sort(), ["confirmation", "dispositionCode"]);
  assert.equal(body.confirmation, FINALIZATION_CONFIRMATION);
  assert.equal(body.dispositionCode, COMPLETION_DISPOSITION);
  assert.equal("clerkUserId" in body, false);
  assert.equal("email" in body, false);
  assert.equal("acuity" in body, false);
});

test("deleting, missing-user, and ambiguous outcomes require manual review", () => {
  const deleting = { status: "deleting", dispositionCode: null };
  const ambiguous = {
    status: "deleting",
    dispositionCode: "clerk_deletion_outcome_unknown",
  };
  const missing = {
    status: "approved",
    dispositionCode: "clerk_user_absent_unknown",
  };

  for (const request of [deleting, ambiguous, missing]) {
    assert.equal(requiresDeletionManualReview(request), true);
    assert.equal(canFinalizeDeletion(request), false);
    assert.match(manualReviewMessage(request), /manual recovery|Do not retry/);
  }
});

test("safe errors do not include backend details or generic retry advice", () => {
  assert.match(safeFinalizationErrorMessage(409), /manual review/);
  assert.match(safeFinalizationErrorMessage(409), /No automatic retry/);
  assert.match(safeFinalizationErrorMessage(500), /do not retry/);
  assert.match(safeFinalizationErrorMessage(502), /remains approved/);
});

test("member confirmation recording remains completed-only", () => {
  assert.equal(
    canRecordMemberConfirmation({
      status: "completed",
      confirmationSentAt: null,
    }),
    true,
  );
  assert.equal(
    canRecordMemberConfirmation({
      status: "approved",
      confirmationSentAt: null,
    }),
    false,
  );
  assert.equal(
    canRecordMemberConfirmation({
      status: "completed",
      confirmationSentAt: "2026-08-29T20:00:00.000Z",
    }),
    false,
  );
});

test("Portal keeps the second dialog, duplicate lock, and record-only email warning", async () => {
  const source = await readFile(
    new URL("../pages/Admin.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /open=\{deletionDialog === "finalize"\}/);
  assert.match(source, /finalizationMutation\.isPending/);
  assert.match(source, /This button only records that the email was sent/);
  assert.match(source, /it does not send the email/);
  assert.match(source, /FIT CLUB 15 sign-in account deletion is complete/);
});

test("Portal locks every deletion mutation against duplicate clicks", async () => {
  const source = await readFile(
    new URL("../pages/Admin.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const deletionActionPending =[\s\S]*deletionStatusMutation\.isPending[\s\S]*finalizationMutation\.isPending[\s\S]*confirmationSentMutation\.isPending/,
  );
  assert.match(source, /disabled=\{deletionActionPending\}/);
  assert.match(source, /disabled=\{!finalizationReady\}/);
});

test("Portal refetches deletion list and selected detail after every successful mutation", async () => {
  const source = await readFile(
    new URL("../pages/Admin.tsx", import.meta.url),
    "utf8",
  );

  const mutationNames = [
    "deletionStatusMutation",
    "finalizationMutation",
    "confirmationSentMutation",
  ];
  for (const mutationName of mutationNames) {
    const start = source.indexOf(`const ${mutationName} = useMutation`);
    assert.notEqual(start, -1, `${mutationName} must exist`);
    const next = source.indexOf("\n  const ", start + 1);
    const section = source.slice(start, next === -1 ? undefined : next);
    assert.match(
      section,
      /qc\.refetchQueries\(\{ queryKey: \["admin-account-deletion-requests"\] \}\)/,
      `${mutationName} must refresh the deletion list`,
    );
    assert.match(
      section,
      /qc\.refetchQueries\(\{\s*queryKey: \["admin-account-deletion-request",\s*(variables\.requestId|requestId)\],?\s*\}\)/,
      `${mutationName} must refresh the selected detail`,
    );
  }
});

test("Portal disables query retries and tells staff not to retry uncertain outcomes", async () => {
  const source = await readFile(
    new URL("../pages/Admin.tsx", import.meta.url),
    "utf8",
  );

  assert.equal((source.match(/retry: false/g) ?? []).length, 2);
  assert.match(source, /outcome could not be safely determined\. Do not retry/);
  assert.match(source, /The deletion outcome could not be safely determined/);
});
