import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test, { mock } from "node:test";
import express from "express";

type Status =
  | "pending"
  | "in_review"
  | "awaiting_member"
  | "approved"
  | "deleting"
  | "completed"
  | "withdrawn"
  | "declined";

type RequestRecord = {
  id: string;
  clerkUserId: string;
  primaryEmailSnapshot: string;
  status: Status;
  requestedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  clerkDeletionSucceededAt: Date | null;
  completedBy: string | null;
  confirmationSentAt: Date | null;
  dispositionCode: string | null;
};

type ClerkUser = {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  firstName: string;
  lastName: string;
  createdAt: number;
};

const requests = new Map<string, RequestRecord>();
const clerkUsers = new Map<string, ClerkUser>();
const deleteCalls: string[] = [];
let deleteMode: "success" | "fail-present" | "ambiguous" = "success";
let failSuccessMarker = false;
let failCompletionCount = 0;
let promoteMemberToAdminAfterFirstLookup = false;
let memberLookupCount = 0;

function clone(request: RequestRecord): RequestRecord {
  return { ...request };
}

function addUser(userId: string, email = `${userId}@example.com`) {
  clerkUsers.set(userId, {
    id: userId,
    primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: email }],
    firstName: userId,
    lastName: "Test",
    createdAt: Date.parse("2030-01-01T00:00:00.000Z"),
  });
}

function addRequest(
  id: string,
  status: Status,
  clerkUserId = "member",
): RequestRecord {
  const completed = status === "completed";
  const request: RequestRecord = {
    id,
    clerkUserId,
    primaryEmailSnapshot: `${clerkUserId}@example.com`,
    status,
    requestedAt: new Date("2030-01-15T15:00:00.000Z"),
    updatedAt: new Date("2030-01-15T15:00:00.000Z"),
    completedAt: completed ? new Date("2030-01-16T15:00:00.000Z") : null,
    clerkDeletionSucceededAt: completed
      ? new Date("2030-01-16T14:59:59.000Z")
      : null,
    completedBy: completed ? "admin" : null,
    confirmationSentAt: null,
    dispositionCode: completed ? "completed_member_requested" : null,
  };
  requests.set(id, request);
  return request;
}

const activeStatuses = new Set<Status>([
  "pending",
  "in_review",
  "awaiting_member",
  "approved",
  "deleting",
]);

const deletionRequestStore = {
  async createOrGetActive() {
    throw new Error("Not used");
  },
  async getActive(clerkUserId: string) {
    return [...requests.values()].find(
      (request) =>
        request.clerkUserId === clerkUserId &&
        activeStatuses.has(request.status),
    ) ?? null;
  },
  async getById(requestId: string) {
    const request = requests.get(requestId);
    return request ? clone(request) : null;
  },
  async list(status?: Status) {
    return [...requests.values()]
      .filter((request) => !status || request.status === status)
      .map(clone);
  },
  async transitionStatus(input: {
    requestId: string;
    from: Status[];
    to: Status;
    dispositionCode?: string | null;
  }) {
    const request = requests.get(input.requestId);
    if (!request || !input.from.includes(request.status)) return null;
    request.status = input.to;
    request.updatedAt = new Date();
    if (input.dispositionCode !== undefined) {
      request.dispositionCode = input.dispositionCode;
    }
    return clone(request);
  },
  async claimFinalization(requestId: string) {
    const request = requests.get(requestId);
    if (!request || request.status !== "approved") return null;
    request.status = "deleting";
    request.updatedAt = new Date();
    request.dispositionCode = null;
    return clone(request);
  },
  async recordClerkDeletionSuccess(requestId: string, at = new Date()) {
    if (failSuccessMarker) throw new Error("marker write failed");
    const request = requests.get(requestId);
    if (
      !request ||
      request.status !== "deleting" ||
      request.clerkDeletionSucceededAt
    ) {
      return null;
    }
    request.clerkDeletionSucceededAt = at;
    request.updatedAt = at;
    return clone(request);
  },
  async completeFinalization(input: {
    requestId: string;
    completedBy: string;
    dispositionCode: string;
    completedAt?: Date;
  }) {
    if (failCompletionCount > 0) {
      failCompletionCount -= 1;
      throw new Error("completion write failed");
    }
    const request = requests.get(input.requestId);
    if (
      !request ||
      request.status !== "deleting" ||
      !request.clerkDeletionSucceededAt
    ) {
      return null;
    }
    const at = input.completedAt ?? new Date();
    request.status = "completed";
    request.completedAt = at;
    request.completedBy = input.completedBy;
    request.updatedAt = at;
    request.dispositionCode = input.dispositionCode;
    return clone(request);
  },
  async markConfirmationSent(requestId: string) {
    const request = requests.get(requestId);
    if (!request || request.status !== "completed") return null;
    if (!request.confirmationSentAt) {
      request.confirmationSentAt = new Date();
      request.updatedAt = request.confirmationSentAt;
    }
    return clone(request);
  },
  async setOperationalDisposition(
    requestId: string,
    status: Status,
    dispositionCode: string,
  ) {
    const request = requests.get(requestId);
    if (!request || request.status !== status) return null;
    request.dispositionCode = dispositionCode;
    request.updatedAt = new Date();
    return clone(request);
  },
};

(mock as any).module("../lib/account-deletion-request-store.js", {
  namedExports: { deletionRequestStore },
});

(mock as any).module("@clerk/express", {
  namedExports: {
    getAuth: (req: { auth?: unknown }) => req.auth,
    clerkClient: {
      users: {
        getUser: async (userId: string) => {
          const user = clerkUsers.get(userId);
          if (!user) {
            throw Object.assign(new Error("User not found"), { status: 404 });
          }
          if (userId === "member" && promoteMemberToAdminAfterFirstLookup) {
            memberLookupCount += 1;
            if (memberLookupCount > 1) {
              return {
                ...user,
                emailAddresses: [
                  { id: "primary", emailAddress: "owner@example.com" },
                ],
              };
            }
          }
          return user;
        },
        getUserList: async () => ({ data: [...clerkUsers.values()] }),
        deleteUser: async (userId: string) => {
          deleteCalls.push(userId);
          if (deleteMode === "fail-present") {
            throw Object.assign(new Error("Rejected before deletion"), {
              status: 422,
            });
          }
          if (deleteMode === "ambiguous") {
            clerkUsers.delete(userId);
            throw new Error("Network outcome unknown");
          }
          clerkUsers.delete(userId);
        },
      },
      invitations: {
        getInvitationList: async () => ({ data: [] }),
        revokeInvitation: async () => undefined,
        createInvitation: async () => undefined,
      },
    },
  },
});

process.env.ADMIN_EMAIL = "admin@example.com";
const { default: adminRouter } = await import("./admin.js");

function reset() {
  requests.clear();
  clerkUsers.clear();
  deleteCalls.length = 0;
  deleteMode = "success";
  failSuccessMarker = false;
  failCompletionCount = 0;
  promoteMemberToAdminAfterFirstLookup = false;
  memberLookupCount = 0;
  process.env.ADMIN_EMAIL = "admin@example.com";
  addUser("admin", "admin@example.com");
  addUser("member", "member@example.com");
}

function requestJson(
  server: http.Server,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}

async function withServer(
  authenticatedUserId: string | null,
  callback: (server: http.Server) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = authenticatedUserId ? { userId: authenticatedUserId } : {};
    next();
  });
  app.use(adminRouter);
  const server = app.listen(0);
  await once(server, "listening");
  try {
    await callback(server);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const finalBody = {
  confirmation: "DELETE ACCOUNT",
  dispositionCode: "completed_member_requested",
};

test("admin auth protects request routes", async () => {
  reset();
  addRequest("r-auth", "pending");
  await withServer(null, async (server) => {
    const response = await requestJson(
      server,
      "GET",
      "/admin/account-deletion-requests",
    );
    assert.equal(response.status, 401);
  });
  addUser("ordinary", "ordinary@example.com");
  await withServer("ordinary", async (server) => {
    const response = await requestJson(
      server,
      "GET",
      "/admin/account-deletion-requests",
    );
    assert.equal(response.status, 403);
  });
});

test("list masks email and list/detail omit Clerk user ID", async () => {
  reset();
  addRequest("r-privacy", "pending");
  await withServer("admin", async (server) => {
    const list = await requestJson(
      server,
      "GET",
      "/admin/account-deletion-requests?status=pending",
    );
    assert.equal(list.status, 200);
    assert.equal(list.body[0].maskedEmail, "m***@example.com");
    assert.equal(JSON.stringify(list.body).includes("member@example.com"), false);
    assert.equal(JSON.stringify(list.body).includes("clerkUserId"), false);

    const detail = await requestJson(
      server,
      "GET",
      "/admin/account-deletion-requests/r-privacy",
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.primaryEmailSnapshot, "member@example.com");
    assert.equal(JSON.stringify(detail.body).includes("clerkUserId"), false);
  });
});

test("status route enforces transitions, dispositions, and deleting isolation", async () => {
  reset();
  addRequest("r-transition", "pending");
  addRequest("r-deleting", "deleting");
  await withServer("admin", async (server) => {
    const review = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-transition/status",
      { status: "in_review" },
    );
    assert.equal(review.status, 200);

    const badDisposition = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-transition/status",
      { status: "awaiting_member", dispositionCode: "private note" },
    );
    assert.equal(badDisposition.status, 400);

    const awaiting = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-transition/status",
      {
        status: "awaiting_member",
        dispositionCode: "awaiting_member_information",
      },
    );
    assert.equal(awaiting.status, 200);

    const invalid = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-transition/status",
      { status: "approved" },
    );
    assert.equal(invalid.status, 409);

    const deleting = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-deleting/status",
      { status: "in_review" },
    );
    assert.equal(deleting.status, 409);
    assert.equal(requests.get("r-deleting")?.status, "deleting");
  });
});

test("finalization validates confirmation and rejects client target IDs", async () => {
  reset();
  addRequest("r-confirm", "approved");
  await withServer("admin", async (server) => {
    const wrong = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-confirm/finalize",
      { confirmation: "DELETE", dispositionCode: "completed_member_requested" },
    );
    assert.equal(wrong.status, 400);
    const supplied = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-confirm/finalize",
      { ...finalBody, clerkUserId: "attacker-target" },
    );
    assert.equal(supplied.status, 400);
    assert.deepEqual(deleteCalls, []);
  });
});

test("self and configured administrators are protected", async () => {
  reset();
  process.env.ADMIN_EMAIL = "admin@example.com,owner@example.com";
  addUser("owner", "owner@example.com");
  addRequest("r-self", "approved", "admin");
  addRequest("r-owner", "approved", "owner");
  await withServer("admin", async (server) => {
    const self = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-self/finalize",
      finalBody,
    );
    const owner = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-owner/finalize",
      finalBody,
    );
    assert.equal(self.status, 403);
    assert.equal(owner.status, 403);
    assert.deepEqual(deleteCalls, []);
  });
});

test("post-claim protected recheck declines without deleting", async () => {
  reset();
  process.env.ADMIN_EMAIL = "admin@example.com,owner@example.com";
  addRequest("r-post-protected", "approved");
  promoteMemberToAdminAfterFirstLookup = true;
  await withServer("admin", async (server) => {
    const response = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-post-protected/finalize",
      finalBody,
    );
    assert.equal(response.status, 403);
    assert.equal(requests.get("r-post-protected")?.status, "declined");
    assert.equal(
      requests.get("r-post-protected")?.dispositionCode,
      "declined_protected_admin",
    );
    assert.deepEqual(deleteCalls, []);
  });
});

test("concurrent finalization makes one Clerk delete call", async () => {
  reset();
  addRequest("r-concurrent", "approved");
  await withServer("admin", async (server) => {
    const responses = await Promise.all([
      requestJson(
        server,
        "POST",
        "/admin/account-deletion-requests/r-concurrent/finalize",
        finalBody,
      ),
      requestJson(
        server,
        "POST",
        "/admin/account-deletion-requests/r-concurrent/finalize",
        finalBody,
      ),
    ]);
    assert.equal(deleteCalls.length, 1);
    assert.ok(responses.every((item) => [200, 409].includes(item.status)));
    assert.equal(requests.get("r-concurrent")?.status, "completed");
  });
});

test("clear Clerk failure restores approved", async () => {
  reset();
  addRequest("r-failed", "approved");
  deleteMode = "fail-present";
  await withServer("admin", async (server) => {
    const response = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-failed/finalize",
      finalBody,
    );
    assert.equal(response.status, 502);
    assert.equal(requests.get("r-failed")?.status, "approved");
    assert.equal(requests.get("r-failed")?.clerkDeletionSucceededAt, null);
  });
});

test("ambiguous Clerk outcome remains deleting and is never retried", async () => {
  reset();
  addRequest("r-ambiguous", "approved");
  deleteMode = "ambiguous";
  await withServer("admin", async (server) => {
    const first = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-ambiguous/finalize",
      finalBody,
    );
    assert.equal(first.status, 409);
    assert.equal(requests.get("r-ambiguous")?.status, "deleting");
    assert.equal(
      requests.get("r-ambiguous")?.dispositionCode,
      "clerk_deletion_outcome_unknown",
    );
    const retry = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-ambiguous/finalize",
      finalBody,
    );
    assert.equal(retry.status, 409);
    assert.equal(deleteCalls.length, 1);
  });
});

test("success records marker and completes", async () => {
  reset();
  addRequest("r-success", "approved");
  await withServer("admin", async (server) => {
    const response = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-success/finalize",
      finalBody,
    );
    assert.equal(response.status, 200);
    const completed = requests.get("r-success");
    assert.ok(completed);
    assert.equal(completed.status, "completed");
    assert.ok(completed.clerkDeletionSucceededAt instanceof Date);
    assert.ok(completed.completedAt instanceof Date);
    assert.equal(completed.completedBy, "admin");
    assert.equal(completed.dispositionCode, "completed_member_requested");
    assert.equal(response.body.deletionRequest.id, "r-success");
    assert.equal(
      response.body.deletionRequest.primaryEmailSnapshot,
      "member@example.com",
    );
    assert.equal(response.body.deletionRequest.status, "completed");
    assert.equal(
      response.body.deletionRequest.completedAt,
      completed.completedAt.toISOString(),
    );
    assert.equal(
      response.body.deletionRequest.confirmationSentAt,
      null,
    );
    assert.equal(
      response.body.deletionRequest.dispositionCode,
      "completed_member_requested",
    );
    assert.equal(deleteCalls.length, 1);
  });
});

test("saved marker recovers failed completion without another delete", async () => {
  reset();
  addRequest("r-recover", "approved");
  failCompletionCount = 1;
  await withServer("admin", async (server) => {
    const first = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-recover/finalize",
      finalBody,
    );
    assert.equal(first.status, 500);
    assert.equal(requests.get("r-recover")?.status, "deleting");
    assert.ok(requests.get("r-recover")?.clerkDeletionSucceededAt instanceof Date);
    const retry = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-recover/finalize",
      finalBody,
    );
    assert.equal(retry.status, 200);
    assert.equal(requests.get("r-recover")?.status, "completed");
    assert.equal(deleteCalls.length, 1);
  });
});

test("failed marker write remains unresolved without another delete", async () => {
  reset();
  addRequest("r-marker-fail", "approved");
  failSuccessMarker = true;
  await withServer("admin", async (server) => {
    const first = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-marker-fail/finalize",
      finalBody,
    );
    assert.equal(first.status, 500);
    assert.equal(requests.get("r-marker-fail")?.status, "deleting");
    assert.equal(requests.get("r-marker-fail")?.clerkDeletionSucceededAt, null);
    failSuccessMarker = false;
    const retry = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-marker-fail/finalize",
      finalBody,
    );
    assert.equal(retry.status, 409);
    assert.equal(deleteCalls.length, 1);
  });
});

test("missing user is never inferred as completed without a marker", async () => {
  reset();
  addRequest("r-missing-approved", "approved");
  addRequest("r-missing-deleting", "deleting");
  clerkUsers.delete("member");
  await withServer("admin", async (server) => {
    const approved = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-missing-approved/finalize",
      finalBody,
    );
    assert.equal(approved.status, 409);
    assert.equal(requests.get("r-missing-approved")?.status, "approved");
    assert.equal(
      requests.get("r-missing-approved")?.dispositionCode,
      "clerk_user_absent_unknown",
    );
    const deleting = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-missing-deleting/finalize",
      finalBody,
    );
    assert.equal(deleting.status, 409);
    assert.equal(requests.get("r-missing-deleting")?.status, "deleting");
    assert.deepEqual(deleteCalls, []);
  });
});

test("deleting with a marker completes without a Clerk call", async () => {
  reset();
  const request = addRequest("r-marker", "deleting");
  request.clerkDeletionSucceededAt = new Date();
  clerkUsers.delete("member");
  await withServer("admin", async (server) => {
    const response = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-marker/finalize",
      finalBody,
    );
    assert.equal(response.status, 200);
    assert.equal(requests.get("r-marker")?.status, "completed");
    assert.deepEqual(deleteCalls, []);
  });
});

test("the full mocked finalization matrix leaves unrelated synthetic requests unchanged", async () => {
  reset();

  addRequest("fixture-pending", "pending", "fixture-pending-user");
  addRequest("fixture-completed", "completed", "fixture-completed-user");
  addRequest("fixture-declined", "declined", "fixture-declined-user");
  const untouched = new Map(
    ["fixture-pending", "fixture-completed", "fixture-declined"].map((id) => [
      id,
      clone(requests.get(id)!),
    ]),
  );

  addUser("matrix-clear");
  addRequest("matrix-clear", "approved", "matrix-clear");
  addUser("matrix-ambiguous");
  addRequest("matrix-ambiguous", "approved", "matrix-ambiguous");
  addUser("matrix-success");
  addRequest("matrix-success", "approved", "matrix-success");
  addUser("matrix-recovery");
  addRequest("matrix-recovery", "approved", "matrix-recovery");
  addUser("matrix-marker");
  const marker = addRequest("matrix-marker", "deleting", "matrix-marker");
  marker.clerkDeletionSucceededAt = new Date("2030-01-16T14:59:59.000Z");
  addUser("matrix-absent");
  addRequest("matrix-absent", "approved", "matrix-absent");
  clerkUsers.delete("matrix-absent");

  await withServer("admin", async (server) => {
    deleteMode = "fail-present";
    const clear = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-clear/finalize",
      finalBody,
    );
    assert.equal(clear.status, 502);
    assert.equal(requests.get("matrix-clear")?.status, "approved");

    deleteMode = "ambiguous";
    const ambiguous = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-ambiguous/finalize",
      finalBody,
    );
    assert.equal(ambiguous.status, 409);
    assert.equal(requests.get("matrix-ambiguous")?.status, "deleting");
    assert.equal(
      requests.get("matrix-ambiguous")?.dispositionCode,
      "clerk_deletion_outcome_unknown",
    );

    deleteMode = "success";
    const success = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-success/finalize",
      finalBody,
    );
    assert.equal(success.status, 200);
    assert.equal(requests.get("matrix-success")?.status, "completed");

    failCompletionCount = 1;
    const recoveryFirst = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-recovery/finalize",
      finalBody,
    );
    assert.equal(recoveryFirst.status, 500);
    const recoverySecond = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-recovery/finalize",
      finalBody,
    );
    assert.equal(recoverySecond.status, 200);
    assert.equal(requests.get("matrix-recovery")?.status, "completed");

    const markerResponse = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-marker/finalize",
      finalBody,
    );
    assert.equal(markerResponse.status, 200);
    assert.equal(requests.get("matrix-marker")?.status, "completed");

    const absent = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/matrix-absent/finalize",
      finalBody,
    );
    assert.equal(absent.status, 409);
    assert.equal(requests.get("matrix-absent")?.status, "approved");
    assert.equal(
      requests.get("matrix-absent")?.dispositionCode,
      "clerk_user_absent_unknown",
    );
  });

  for (const [id, expected] of untouched) {
    assert.deepEqual(requests.get(id), expected);
  }
  assert.deepEqual(deleteCalls, [
    "matrix-clear",
    "matrix-ambiguous",
    "matrix-success",
    "matrix-recovery",
  ]);
});

test("direct removal blocks active requests and otherwise remains unchanged", async () => {
  reset();
  addRequest("r-direct", "pending");
  await withServer("admin", async (server) => {
    const blocked = await requestJson(
      server,
      "DELETE",
      "/admin/members/member",
    );
    assert.equal(blocked.status, 409);
    assert.equal(clerkUsers.has("member"), true);
    assert.deepEqual(deleteCalls, []);
    requests.clear();
    const ordinary = await requestJson(
      server,
      "DELETE",
      "/admin/members/member",
    );
    assert.equal(ordinary.status, 200);
    assert.equal(clerkUsers.has("member"), false);
    assert.deepEqual(deleteCalls, ["member"]);
  });
});

test("confirmation-sent is completed-only and idempotent", async () => {
  reset();
  addRequest("r-pending", "pending");
  addRequest("r-completed", "completed");
  await withServer("admin", async (server) => {
    const invalid = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-pending/confirmation-sent",
    );
    assert.equal(invalid.status, 409);
    const first = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-completed/confirmation-sent",
    );
    assert.equal(first.status, 200);
    const second = await requestJson(
      server,
      "POST",
      "/admin/account-deletion-requests/r-completed/confirmation-sent",
    );
    assert.equal(second.status, 200);
    assert.equal(
      second.body.deletionRequest.confirmationSentAt,
      first.body.deletionRequest.confirmationSentAt,
    );
  });
});