import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Disable Express's automatic ETag generation. ETags cause the server to return
// 304 Not Modified even when Acuity has new data (new bookings, updated session
// counts), because the client re-sends the old ETag and Express matches it before
// our route handler can return fresh content.
app.set('etag', false);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Explicit CORS allowlist — never reflect the incoming Origin header.
// Covers Replit dev proxy domains, localhost, and any explicitly set production domain.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.replit\.dev$/,
  /\.repl\.co$/,
];
const extraOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow same-origin / server-to-server requests (no Origin header)
      if (!origin) return callback(null, true);
      // Allow known patterns
      if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
      // Allow explicit env-var overrides (e.g. custom deployed domain)
      if (extraOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve publishable key from incoming request host (supports custom domains)
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Prevent any HTTP-layer caching (proxy or client) on API responses.
// Without this, repeated identical GET requests return 304 and the app
// never sees new data even when Acuity has updated appointments/certs.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api", router);

export default app;
