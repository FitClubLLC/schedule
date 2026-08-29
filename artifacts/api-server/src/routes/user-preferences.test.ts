import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test, { mock } from "node:test";
import express from "express";

const users = new Map<string, { publicMetadata: Record<string, unknown> }>();
const updateUserMetadataCalls: Array<{
  userId: string;
  publicMetadata: Record<string, unknown>;
}> = [];

(mock as any).module("@clerk/express", {
  namedExports: {
    getAuth: (req: { auth?: unknown }) => req.auth,
    clerkClient: {
      users: {
        getUser: async (userId: string) => {
          const user = users.get(userId);
          if (!user) throw new Error(`Unknown test user: ${userId}`);
          return user;
        },
        updateUserMetadata: async (
          userId: string,
          update: { publicMetadata: Record<string, unknown> },
        ) => {
          const user = users.get(userId);
          if (!user) throw new Error(`Unknown test user: ${userId}`);
          user.publicMetadata = update.publicMetadata;
          updateUserMetadataCalls.push({ userId, ...update });
          return user;
        },
      },
    },
  },
});

const { default: userRouter } = await import("./user.js");

function requestJson(
  server: http.Server,
  method: "GET" | "PATCH",
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
  callback: (server: http.Server) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = authenticatedUserId ? { userId: authenticatedUserId } : {};
    next();
  });
  app.use(userRouter);

  const server = app.listen(0);
  await once(server, "listening");
  try {
    await callback(server);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("unauthenticated preference read and write return 401", async () => {
  await withServer(null, async (server) => {
    const read = await requestJson(server, "GET", "/user/preferences");
    assert.equal(read.status, 401);
    assert.deepEqual(read.body, { error: "Unauthorized" });

    const write = await requestJson(server, "PATCH", "/user/preferences", {
      preferredLocationKey: "potomac",
    });
    assert.equal(write.status, 401);
    assert.deepEqual(write.body, { error: "Unauthorized" });
  });
});

test("preference routes support valid write, explicit clear, and unset read", async () => {
  const userId = "user_preferences_test";
  users.set(userId, { publicMetadata: { firstName: "Invited" } });
  updateUserMetadataCalls.length = 0;

  await withServer(userId, async (server) => {
    const unset = await requestJson(server, "GET", "/user/preferences");
    assert.equal(unset.status, 200);
    assert.deepEqual(unset.body, { preferredLocationKey: null });

    const write = await requestJson(server, "PATCH", "/user/preferences", {
      preferredLocationKey: "kentlands",
    });
    assert.equal(write.status, 200);
    assert.deepEqual(write.body, { preferredLocationKey: "kentlands" });
    assert.equal(updateUserMetadataCalls.length, 1);
    assert.equal(updateUserMetadataCalls[0]?.userId, userId);
    assert.deepEqual(users.get(userId)?.publicMetadata, {
      firstName: "Invited",
      fitClubPreferences: { preferredLocationKey: "kentlands" },
    });

    const clear = await requestJson(server, "PATCH", "/user/preferences", {
      preferredLocationKey: null,
    });
    assert.equal(clear.status, 200);
    assert.deepEqual(clear.body, { preferredLocationKey: null });

    const afterClear = await requestJson(server, "GET", "/user/preferences");
    assert.equal(afterClear.status, 200);
    assert.deepEqual(afterClear.body, { preferredLocationKey: null });
  });
});

test("preference write rejects invalid values without a Clerk mutation", async () => {
  const userId = "user_invalid_preference_test";
  users.set(userId, { publicMetadata: { lastName: "Member" } });
  updateUserMetadataCalls.length = 0;

  await withServer(userId, async (server) => {
    for (const value of ["1", "Potomac", undefined, false, 2]) {
      const body =
        value === undefined
          ? {}
          : { preferredLocationKey: value };
      const response = await requestJson(server, "PATCH", "/user/preferences", body);
      assert.equal(response.status, 400);
    }
  });

  assert.equal(updateUserMetadataCalls.length, 0);
  assert.deepEqual(users.get(userId)?.publicMetadata, {
    lastName: "Member",
  });
});