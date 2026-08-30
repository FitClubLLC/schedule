import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  accountDeletionRequests,
  ACTIVE_DELETION_REQUEST_STATUSES,
  db,
  type AccountDeletionRequest,
  type DeletionRequestStatus,
} from "@workspace/db";

export interface CreateDeletionRequestInput {
  clerkUserId: string;
  primaryEmailSnapshot: string;
}

export interface DeletionRequestStore {
  createOrGetActive(
    input: CreateDeletionRequestInput,
  ): Promise<{ request: AccountDeletionRequest; created: boolean }>;
  getActive(clerkUserId: string): Promise<AccountDeletionRequest | null>;
  getById(requestId: string): Promise<AccountDeletionRequest | null>;
  list(status?: DeletionRequestStatus): Promise<AccountDeletionRequest[]>;
  transitionStatus(input: {
    requestId: string;
    from: DeletionRequestStatus[];
    to: DeletionRequestStatus;
    dispositionCode?: string | null;
  }): Promise<AccountDeletionRequest | null>;
  claimFinalization(requestId: string): Promise<AccountDeletionRequest | null>;
  recordClerkDeletionSuccess(
    requestId: string,
    succeededAt?: Date,
  ): Promise<AccountDeletionRequest | null>;
  completeFinalization(input: {
    requestId: string;
    completedBy: string;
    dispositionCode: string;
    completedAt?: Date;
  }): Promise<AccountDeletionRequest | null>;
  markConfirmationSent(requestId: string): Promise<AccountDeletionRequest | null>;
  setOperationalDisposition(
    requestId: string,
    status: DeletionRequestStatus,
    dispositionCode: string,
  ): Promise<AccountDeletionRequest | null>;
}

async function findActive(
  database: typeof db,
  clerkUserId: string,
): Promise<AccountDeletionRequest | null> {
  const rows = await database
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.clerkUserId, clerkUserId),
        inArray(
          accountDeletionRequests.status,
          ACTIVE_DELETION_REQUEST_STATUSES,
        ),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export function createDeletionRequestStore(
  database: typeof db = db,
): DeletionRequestStore {
  return {
    async createOrGetActive(input) {
      const inserted = await database
        .insert(accountDeletionRequests)
        .values({
          clerkUserId: input.clerkUserId,
          primaryEmailSnapshot: input.primaryEmailSnapshot,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning();

      const created = inserted[0];
      if (created) {
        return { request: created, created: true };
      }

      const existing = await findActive(database, input.clerkUserId);
      if (!existing) {
        throw new Error("Active deletion request was not found after conflict.");
      }

      return { request: existing, created: false };
    },

    getActive(clerkUserId) {
      return findActive(database, clerkUserId);
    },

    async getById(requestId) {
      const rows = await database
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, requestId))
        .limit(1);
      return rows[0] ?? null;
    },

    async list(status) {
      const query = database.select().from(accountDeletionRequests);
      const rows = status
        ? await query
            .where(eq(accountDeletionRequests.status, status))
        : await query;
      return rows;
    },

    async transitionStatus({
      requestId,
      from,
      to,
      dispositionCode,
    }) {
      const values: {
        status: DeletionRequestStatus;
        updatedAt: Date;
        dispositionCode?: string | null;
      } = {
        status: to,
        updatedAt: new Date(),
      };
      if (dispositionCode !== undefined) {
        values.dispositionCode = dispositionCode;
      }

      const rows = await database
        .update(accountDeletionRequests)
        .set(values)
        .where(
          and(
            eq(accountDeletionRequests.id, requestId),
            inArray(accountDeletionRequests.status, from),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    claimFinalization(requestId) {
      return this.transitionStatus({
        requestId,
        from: ["approved"],
        to: "deleting",
        dispositionCode: null,
      });
    },

    async recordClerkDeletionSuccess(requestId, succeededAt = new Date()) {
      const rows = await database
        .update(accountDeletionRequests)
        .set({
          clerkDeletionSucceededAt: succeededAt,
          updatedAt: succeededAt,
        })
        .where(
          and(
            eq(accountDeletionRequests.id, requestId),
            eq(accountDeletionRequests.status, "deleting"),
            isNull(accountDeletionRequests.clerkDeletionSucceededAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async completeFinalization({
      requestId,
      completedBy,
      dispositionCode,
      completedAt = new Date(),
    }) {
      const rows = await database
        .update(accountDeletionRequests)
        .set({
          status: "completed",
          completedAt,
          completedBy,
          updatedAt: completedAt,
          dispositionCode,
        })
        .where(
          and(
            eq(accountDeletionRequests.id, requestId),
            eq(accountDeletionRequests.status, "deleting"),
            isNotNull(accountDeletionRequests.clerkDeletionSucceededAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async markConfirmationSent(requestId) {
      const sentAt = new Date();
      const rows = await database
        .update(accountDeletionRequests)
        .set({
          confirmationSentAt: sentAt,
          updatedAt: sentAt,
        })
        .where(
          and(
            eq(accountDeletionRequests.id, requestId),
            eq(accountDeletionRequests.status, "completed"),
            isNull(accountDeletionRequests.confirmationSentAt),
          ),
        )
        .returning();
      if (rows[0]) return rows[0];

      const existing = await this.getById(requestId);
      return existing?.status === "completed" ? existing : null;
    },

    async setOperationalDisposition(requestId, status, dispositionCode) {
      const rows = await database
        .update(accountDeletionRequests)
        .set({
          dispositionCode,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accountDeletionRequests.id, requestId),
            eq(accountDeletionRequests.status, status),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
  };
}

export const deletionRequestStore = createDeletionRequestStore();