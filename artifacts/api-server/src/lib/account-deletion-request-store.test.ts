import assert from "node:assert/strict";
import test from "node:test";
import type { AccountDeletionRequest } from "@workspace/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createDeletionRequestStore } from "./account-deletion-request-store.js";

const existingRequest: AccountDeletionRequest = {
  id: "existing-request",
  clerkUserId: "user_store_test",
  primaryEmailSnapshot: "member@example.com",
  status: "pending",
  requestedAt: new Date("2030-01-15T15:00:00.000Z"),
  updatedAt: new Date("2030-01-15T15:00:00.000Z"),
  completedAt: null,
  clerkDeletionSucceededAt: null,
  completedBy: null,
  confirmationSentAt: null,
  dispositionCode: null,
};

function makeDatabase({
  inserted,
  selected,
  updates = [],
}: {
  inserted: AccountDeletionRequest[];
  selected: AccountDeletionRequest[];
  updates?: AccountDeletionRequest[][];
}) {
  const state = {
    insertedValues: null as Record<string, unknown> | null,
    conflictHandlingUsed: false,
    selectCalls: 0,
    updatedValues: [] as Array<Record<string, unknown>>,
    updateCalls: 0,
    whereClauses: [] as Array<{ sql: string; params: unknown[] }>,
  };

  const insertBuilder = {
    values(values: Record<string, unknown>) {
      state.insertedValues = values;
      return insertBuilder;
    },
    onConflictDoNothing() {
      state.conflictHandlingUsed = true;
      return insertBuilder;
    },
    async returning() {
      return inserted;
    },
  };

  const selectBuilder = {
    from() {
      return selectBuilder;
    },
    where() {
      return selectBuilder;
    },
    async limit() {
      state.selectCalls += 1;
      return selected;
    },
  };

  const updateBuilder = {
    set(values: Record<string, unknown>) {
      state.updatedValues.push(values);
      return updateBuilder;
    },
    where(condition: SQL) {
      const query = new PgDialect().sqlToQuery(condition);
      state.whereClauses.push({ sql: query.sql, params: query.params });
      return updateBuilder;
    },
    async returning() {
      const result = updates[state.updateCalls] ?? [];
      state.updateCalls += 1;
      return result;
    },
  };

  return {
    state,
    database: {
      insert() {
        return insertBuilder;
      },
      select() {
        return selectBuilder;
      },
      update() {
        return updateBuilder;
      },
    },
  };
}

test("store returns a newly inserted pending request without a follow-up lookup", async () => {
  const createdRequest = {
    ...existingRequest,
    id: "created-request",
  };
  const { database, state } = makeDatabase({
    inserted: [createdRequest],
    selected: [],
  });
  const store = createDeletionRequestStore(database as any);

  const result = await store.createOrGetActive({
    clerkUserId: "user_store_test",
    primaryEmailSnapshot: "member@example.com",
  });

  assert.deepEqual(result, { request: createdRequest, created: true });
  assert.deepEqual(state.insertedValues, {
    clerkUserId: "user_store_test",
    primaryEmailSnapshot: "member@example.com",
    status: "pending",
  });
  assert.equal(state.conflictHandlingUsed, true);
  assert.equal(state.selectCalls, 0);
});

test("store returns the active request after a concurrent unique conflict", async () => {
  const { database, state } = makeDatabase({
    inserted: [],
    selected: [existingRequest],
  });
  const store = createDeletionRequestStore(database as any);

  const result = await store.createOrGetActive({
    clerkUserId: "user_store_test",
    primaryEmailSnapshot: "member@example.com",
  });

  assert.deepEqual(result, { request: existingRequest, created: false });
  assert.equal(state.conflictHandlingUsed, true);
  assert.equal(state.selectCalls, 1);
});

test("store claims approved finalization with a deleting status update", async () => {
  const deletingRequest: AccountDeletionRequest = {
    ...existingRequest,
    status: "deleting",
  };
  const { database, state } = makeDatabase({
    inserted: [],
    selected: [],
    updates: [[deletingRequest]],
  });
  const store = createDeletionRequestStore(database as any);

  const result = await store.claimFinalization(existingRequest.id);

  assert.equal(result?.status, "deleting");
  assert.equal(state.updateCalls, 1);
  assert.equal(state.updatedValues[0].status, "deleting");
  assert.equal(state.updatedValues[0].dispositionCode, null);
  assert.match(
    state.whereClauses[0].sql,
    /"account_deletion_requests"\."id" = \$1/,
  );
  assert.match(
    state.whereClauses[0].sql,
    /"account_deletion_requests"\."status" in \(\$2\)/,
  );
  assert.deepEqual(state.whereClauses[0].params, [
    existingRequest.id,
    "approved",
  ]);
});

test("store persists Clerk success before marking completion", async () => {
  const succeededAt = new Date("2030-01-16T14:59:59.000Z");
  const markedRequest: AccountDeletionRequest = {
    ...existingRequest,
    status: "deleting",
    clerkDeletionSucceededAt: succeededAt,
  };
  const completedRequest: AccountDeletionRequest = {
    ...markedRequest,
    status: "completed",
    completedAt: new Date("2030-01-16T15:00:00.000Z"),
    updatedAt: new Date("2030-01-16T15:00:00.000Z"),
    completedBy: "admin-user",
    dispositionCode: "completed_member_requested",
  };
  const { database, state } = makeDatabase({
    inserted: [],
    selected: [],
    updates: [[markedRequest], [completedRequest]],
  });
  const store = createDeletionRequestStore(database as any);

  const marked = await store.recordClerkDeletionSuccess(
    existingRequest.id,
    succeededAt,
  );
  const completed = await store.completeFinalization({
    requestId: existingRequest.id,
    completedBy: "admin-user",
    dispositionCode: "completed_member_requested",
    completedAt: completedRequest.completedAt ?? undefined,
  });

  assert.equal(marked?.clerkDeletionSucceededAt, succeededAt);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.completedAt, completedRequest.completedAt);
  assert.equal(
    completed?.updatedAt.getTime(),
    completedRequest.completedAt?.getTime(),
  );
  assert.equal(completed?.completedBy, "admin-user");
  assert.equal(completed?.clerkDeletionSucceededAt, succeededAt);
  assert.equal(state.updatedValues[0].clerkDeletionSucceededAt, succeededAt);
  assert.equal(state.updatedValues[1].status, "completed");
  assert.equal(state.updatedValues[1].completedAt, completedRequest.completedAt);
  assert.equal(state.updatedValues[1].updatedAt, completedRequest.completedAt);
  assert.equal(state.updatedValues[1].completedBy, "admin-user");
  assert.equal(
    state.updatedValues[1].dispositionCode,
    "completed_member_requested",
  );
  assert.match(
    state.whereClauses[0].sql,
    /"status" = \$2.*"clerk_deletion_succeeded_at" is null/,
  );
  assert.deepEqual(state.whereClauses[0].params, [
    existingRequest.id,
    "deleting",
  ]);
  assert.match(
    state.whereClauses[1].sql,
    /"status" = \$2.*"clerk_deletion_succeeded_at" is not null/,
  );
  assert.deepEqual(state.whereClauses[1].params, [
    existingRequest.id,
    "deleting",
  ]);
});

test("confirmation-sent returns an already-completed row idempotently", async () => {
  const completedRequest: AccountDeletionRequest = {
    ...existingRequest,
    status: "completed",
    completedAt: new Date("2030-01-16T15:00:00.000Z"),
    clerkDeletionSucceededAt: new Date("2030-01-16T14:59:59.000Z"),
    completedBy: "admin-user",
    dispositionCode: "completed_member_requested",
    confirmationSentAt: new Date("2030-01-16T16:00:00.000Z"),
  };
  const { database, state } = makeDatabase({
    inserted: [],
    selected: [completedRequest],
    updates: [[]],
  });
  const store = createDeletionRequestStore(database as any);

  const result = await store.markConfirmationSent(existingRequest.id);

  assert.deepEqual(result, completedRequest);
  assert.equal(state.updateCalls, 1);
  assert.equal(state.selectCalls, 1);
  assert.match(
    state.whereClauses[0].sql,
    /"status" = \$2.*"confirmation_sent_at" is null/,
  );
  assert.deepEqual(state.whereClauses[0].params, [
    existingRequest.id,
    "completed",
  ]);
});