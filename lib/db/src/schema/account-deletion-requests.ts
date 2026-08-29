import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const DELETION_REQUEST_STATUSES = [
  "pending",
  "in_review",
  "awaiting_member",
  "approved",
  "deleting",
  "completed",
  "withdrawn",
  "declined",
] as const;

export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export const ACTIVE_DELETION_REQUEST_STATUSES = [
  "pending",
  "in_review",
  "awaiting_member",
  "approved",
  "deleting",
] as const satisfies readonly DeletionRequestStatus[];

export const accountDeletionRequestStatus = pgEnum(
  "account_deletion_request_status",
  DELETION_REQUEST_STATUSES,
);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    primaryEmailSnapshot: text("primary_email_snapshot").notNull(),
    status: accountDeletionRequestStatus("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    clerkDeletionSucceededAt: timestamp("clerk_deletion_succeeded_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedBy: text("completed_by"),
    confirmationSentAt: timestamp("confirmation_sent_at", {
      withTimezone: true,
      mode: "date",
    }),
    dispositionCode: text("disposition_code"),
  },
  (table) => [
    uniqueIndex("account_deletion_requests_active_user_idx")
      .on(table.clerkUserId)
      .where(
        sql`${table.status} IN ('pending', 'in_review', 'awaiting_member', 'approved', 'deleting')`,
      ),
  ],
);

export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
export type NewAccountDeletionRequest =
  typeof accountDeletionRequests.$inferInsert;