import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test, { mock } from "node:test";
import express from "express";

const dbStub = {};

(mock as any).module("@workspace/db", {
  namedExports: {
    db: dbStub,
    accountDeletionRequests: {},
    ACTIVE_DELETION_REQUEST_STATUSES: [
      "pending",
      "in_review",
      "awaiting_member",
      "approved",
      "deleting",
    ],
  },
});

const clerkUsers = new Map<
  string,
  {
    primaryEmailAddressId?: string | null;
    emailAddresses?: Array<{ id: string; emailAddress: string }>;
  }
>();
const clerkLookupCalls: string[] = [];
const clerkMutationCalls: string[] = [];
let clerkError: Error | null = null;

(mock as any).module("@clerk/express", {
  namedExports: {
    getAuth: (req: { auth?: unknown }) => req.auth,
    clerkClient: {
      users: {
        getUser: async (userId: string) => {
          clerkLookupCalls.push(userId);
          if (clerkError) throw clerkError;
          const user = clerkUsers.get(userId);
          if (!user) throw new Error(`Unknown test user: ${userId}`);
          return user;
        },
        deleteUser: async () => {
          clerkMutationCalls.push("deleteUser");
        },
        updateUser: async () => {
          clerkMutationCalls.push("updateUser");
        },
        updateUserMetadata: async () => {
          clerkMutationCalls.push("updateUserMetadata");
        },
      },
    },
  },
});

const { createDeletionRequestRouter } = await import("./deletion-requests.js");

type TestRequest = {
  id: string;
  status: "pending";
  requestedAt: Date;
  updatedAt: Date;
  primaryEmailSnapshot: string;
  clerkUserId: string;
};

function makeStore() {
  const active = new Map<string, TestRequest>();
  const createCalls: Array<{
    clerkUserId: string;
    primaryEmailSnapshot: string;
  }> = [];
  let createError: Error | null = null;
  let getError: Error | null = null;

  return {
    active,
    createCalls,
    setCreateError(error: Error | null) {
      createError = error;
    },
    setGetError(error: Error | null) {
      getError = error;
    },
    store: {
      async createOrGetActive(input: {
        clerkUserId: string;
        primaryEmailSnapshot: string;
      }) {
        createCalls.push(input);
        if (createError) throw createError;

        const existing = active.get(input.clerkUserId);
        if (existing) return { request: existing, created: false };

        const now = new Date("2030-01-15T15:00:00.000Z");
        const request: TestRequest = {
          id: `request-${active.size + 1}`,
          status: "pending",
          requestedAt: now,
          updatedAt: now,
          primaryEmailSnapshot: input.primaryEmailSnapshot,
          clerkUserId: input.clerkUserId,
        };
        active.set(input.clerkUserId, request);
        return { request, created: true };
      },
      async getActive(userId: string) {
        if (getError) throw getError;
        return active.get(userId) ?? null;
      },
    },
  };
}

function requestJson(
  server: http.Server,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }

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
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
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
  store: ReturnType<typeof makeStore>,
  callback: (server: http.Server) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = authenticatedUserId ? { userId: authenticatedUserId } : {};
    next();
  });
  app.use(createDeletionRequestRouter(store.store as any));

  const server = app.listen(0);
  await once(server, "listening");
  try {
    await callback(server);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function addUser(
  userId: string,
  primaryEmail: string | null,
) {
  clerkUsers.set(userId, primaryEmail
    ? {
        primaryEmailAddressId: "primary",
        emailAddresses: [{ id: "primary", emailAddress: primaryEmail }],
      }
    : {
        primaryEmailAddressId: null,
        emailAddresses: [],
      });
}

test("unauthenticated submission returns 401", async () => {
  const store = makeStore();
  await withServer(null, store, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: "Unauthorized" });
  });
  assert.equal(store.createCalls.length, 0);
});

test("missing and incorrect confirmation return 400 before Clerk lookup", async () => {
  const store = makeStore();
  const userId = "user_confirmation_test";
  addUser(userId, "member@example.com");
  clerkLookupCalls.length = 0;

  await withServer(userId, store, async (server) => {
    for (const body of [{}, { confirmation: "delete" }]) {
      const response = await requestJson(
        server,
        "POST",
        "/user/deletion-request",
        body,
      );
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, {
        error:
          'Confirmation must be exactly "DELETE" to submit an account deletion request.',
      });
    }
  });

  assert.equal(clerkLookupCalls.length, 0);
  assert.equal(store.createCalls.length, 0);
});

test("authenticated submission stores a pending request and returns safe metadata", async () => {
  const store = makeStore();
  const userId = "user_valid_submission";
  addUser(userId, "member@example.com");

  await withServer(userId, store, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      deletionRequest: {
        id: "request-1",
        status: "pending",
        requestedAt: "2030-01-15T15:00:00.000Z",
        updatedAt: "2030-01-15T15:00:00.000Z",
      },
    });
  });

  assert.deepEqual(store.createCalls, [
    {
      clerkUserId: userId,
      primaryEmailSnapshot: "member@example.com",
    },
  ]);
});

test("server-derived identity wins over client-supplied identity fields", async () => {
  const store = makeStore();
  const userId = "user_server_identity";
  addUser(userId, "clerk-primary@example.com");

  await withServer(userId, store, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
      userId: "attacker-user",
      email: "attacker@example.com",
      requestedAt: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(response.status, 201);
  });

  assert.deepEqual(store.createCalls[0], {
    clerkUserId: userId,
    primaryEmailSnapshot: "clerk-primary@example.com",
  });
});

test("duplicate submission returns the existing active request", async () => {
  const store = makeStore();
  const userId = "user_duplicate_submission";
  addUser(userId, "member@example.com");

  await withServer(userId, store, async (server) => {
    const first = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    const second = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, first.body);
  });

  assert.equal(store.active.size, 1);
  assert.equal(store.createCalls.length, 2);
});

test("active status lookup is account-scoped and does not expose another member's request", async () => {
  const store = makeStore();
  const firstUserId = "user_status_owner";
  const secondUserId = "user_status_other";
  addUser(firstUserId, "first@example.com");
  addUser(secondUserId, "second@example.com");

  await withServer(firstUserId, store, async (server) => {
    const created = await requestJson(
      server,
      "POST",
      "/user/deletion-request",
      { confirmation: "DELETE" },
    );
    assert.equal(created.status, 201);
  });

  await withServer(secondUserId, store, async (server) => {
    const response = await requestJson(
      server,
      "GET",
      "/user/deletion-request?userId=user_status_owner",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { deletionRequest: null });
  });
});

test("the request owner can retrieve their current active status", async () => {
  const store = makeStore();
  const userId = "user_status_owner_read";
  addUser(userId, "member@example.com");

  await withServer(userId, store, async (server) => {
    const created = await requestJson(
      server,
      "POST",
      "/user/deletion-request",
      { confirmation: "DELETE" },
    );
    const status = await requestJson(
      server,
      "GET",
      "/user/deletion-request",
    );

    assert.equal(created.status, 201);
    assert.equal(status.status, 200);
    assert.deepEqual(status.body, created.body);
  });
});

test("missing Clerk primary email returns a safe response without persistence", async () => {
  const store = makeStore();
  const userId = "user_missing_primary_email";
  addUser(userId, null);

  await withServer(userId, store, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error:
        "A primary email address is required to submit an account deletion request.",
    });
  });

  assert.equal(store.createCalls.length, 0);
});

test("submission invokes no Clerk mutation or Acuity request", async () => {
  const store = makeStore();
  const userId = "user_no_external_mutation";
  addUser(userId, "member@example.com");
  clerkMutationCalls.length = 0;

  const originalFetch = globalThis.fetch;
  let acuityRequestCount = 0;
  globalThis.fetch = async () => {
    acuityRequestCount += 1;
    throw new Error("Deletion request submission must not call Acuity.");
  };

  try {
    await withServer(userId, store, async (server) => {
      const response = await requestJson(
        server,
        "POST",
        "/user/deletion-request",
        { confirmation: "DELETE" },
      );
      assert.equal(response.status, 201);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(clerkMutationCalls, []);
  assert.equal(acuityRequestCount, 0);
});

test("unexpected Clerk and persistence errors return the same safe 500 response", async () => {
  const userId = "user_error_handling";
  addUser(userId, "member@example.com");

  const clerkFailureStore = makeStore();
  clerkError = new Error("private Clerk failure");
  await withServer(userId, clerkFailureStore, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: "Unable to process the account deletion request.",
    });
  });
  clerkError = null;

  const databaseFailureStore = makeStore();
  databaseFailureStore.setCreateError(new Error("private database failure"));
  await withServer(userId, databaseFailureStore, async (server) => {
    const response = await requestJson(server, "POST", "/user/deletion-request", {
      confirmation: "DELETE",
    });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: "Unable to process the account deletion request.",
    });
  });
});

test("status retrieval returns null when no active request exists", async () => {
  const store = makeStore();
  const userId = "user_no_active_request";
  addUser(userId, "member@example.com");

  await withServer(userId, store, async (server) => {
    const response = await requestJson(
      server,
      "GET",
      "/user/deletion-request",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { deletionRequest: null });
  });
});