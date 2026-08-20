import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test, { mock } from "node:test";
import express from "express";

process.env.ACUITY_USER_ID = "test-acuity-user";
process.env.ACUITY_API_KEY = "test-acuity-key";

(mock as any).module("@clerk/express", {
  namedExports: {
    getAuth: (req: { auth?: unknown }) => req.auth,
    clerkClient: {
      users: {
        getUser: async () => {
          throw new Error("Certificate guard must run before Clerk user lookup");
        },
      },
    },
  },
});

const [{ default: bookingRouter }, { getAcuityConfig }] = await Promise.all([
  import("./booking.js"),
  import("../config/acuity.js"),
]);

function postJson(
  server: http.Server,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }

  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
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

test("rejects native Workout for 1 without a certificate before contacting Acuity", async () => {
  const config = getAcuityConfig();
  const workoutLocation = config.locations.find((location) =>
    location.services.some(
      (service) =>
        service.appointmentTypeID === config.appointmentTypes.workoutFor1 &&
        service.bookingMode === "native",
    ),
  );
  assert.ok(workoutLocation, "Workout for 1 must have a native location");

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = { userId: "user_test", sessionClaims: {} };
    req.log = { warn() {}, error() {}, info() {} };
    next();
  });
  app.use(bookingRouter);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("A certificate-free Workout for 1 request must not call Acuity");
  };

  const server = app.listen(0);
  await once(server, "listening");
  try {
    const response = await postJson(server, "/booking/appointments", {
      locationId: workoutLocation.id,
      appointmentTypeID: config.appointmentTypes.workoutFor1,
      datetime: "2030-01-15T10:00:00-05:00",
      termsAccepted: true,
    });

    assert.equal(response.status, 422);
    assert.deepEqual(response.body, {
      error: "Choose an active package for this session, or continue through Acuity to purchase it.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
    await once(server, "close");
  }
});