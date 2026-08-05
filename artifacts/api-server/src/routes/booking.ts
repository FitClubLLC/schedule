import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { getAcuityConfig } from "../config/acuity.js";

const router: IRouter = Router();

const ACUITY_USER_ID = process.env.ACUITY_USER_ID;
const ACUITY_API_KEY = process.env.ACUITY_API_KEY;
const ACUITY_BASE_URL = "https://acuityscheduling.com/api/v1";
// Default to Eastern Time — the studio's timezone
const TIMEZONE = process.env.BOOKING_TIMEZONE ?? "America/New_York";

/** Resolves a locationId ("1" or "2") to the actual Acuity calendarID. */
function resolveCalendarId(locationId: string): string | null {
  return getAcuityConfig().locations.find((l) => l.id === locationId)?.calendarId ?? null;
}

function acuityAuth(): string {
  const token = Buffer.from(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`).toString("base64");
  return `Basic ${token}`;
}

async function getClerkUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? null;
  } catch { return null; }
}

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = auth.userId;
  next();
}

function requireAcuity(req: any, res: any): boolean {
  if (!ACUITY_API_KEY || !ACUITY_USER_ID) {
    res.status(500).json({ error: "Acuity credentials not configured" });
    return false;
  }
  return true;
}

// ── GET /api/booking/config ───────────────────────────────────────────────────
// Returns all Acuity IDs needed to build booking URLs.
// Values come from env vars (with production defaults) so an ID change only
// requires updating a secret — no code deploy needed.
router.get("/booking/config", requireAuth, async (req: any, res): Promise<void> => {
  try {
    res.json(getAcuityConfig());
  } catch (err) {
    req.log.error({ err }, "booking/config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/locations ────────────────────────────────────────────────
// Returns the two studio locations. Names come from env vars (defaults: POTOMAC / KENTLANDS).
router.get("/booking/locations", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { locations } = getAcuityConfig();
    res.json(locations.map(({ id, name }) => ({ id, name })));
  } catch (err) {
    req.log.error({ err }, "booking/locations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/appointment-types ───────────────────────────────────────
router.get("/booking/appointment-types", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const response = await fetch(`${ACUITY_BASE_URL}/appointment-types`, {
      headers: { Authorization: acuityAuth() },
    });
    if (!response.ok) {
      req.log.error({ status: response.status }, "Acuity appointment-types error");
      res.status(502).json({ error: "Failed to fetch appointment types" });
      return;
    }
    const raw = await response.json();
    const types = (Array.isArray(raw) ? raw : [])
      .filter((t: any) => !t.deleted && !t.isHidden)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        price: t.price ?? "0.00",
        description: t.description ?? null,
        category: t.category ?? null,
      }));
    res.json(types);
  } catch (err) {
    req.log.error({ err }, "booking/appointment-types error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/availability/dates ──────────────────────────────────────
// Query params: locationId, appointmentTypeID, month (YYYY-MM)
router.get("/booking/availability/dates", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const { locationId, appointmentTypeID, month } = req.query as Record<string, string>;
    if (!locationId || !appointmentTypeID || !month) {
      res.status(400).json({ error: "Missing required params: locationId, appointmentTypeID, month" });
      return;
    }
    const calendarId = resolveCalendarId(locationId);
    if (!calendarId) {
      res.status(400).json({
        error: `Location ${locationId} is not yet configured. Please set LOCATION_${locationId}_CALENDAR_ID.`,
      });
      return;
    }
    const url =
      `${ACUITY_BASE_URL}/availability/dates` +
      `?appointmentTypeID=${encodeURIComponent(appointmentTypeID)}` +
      `&calendarID=${encodeURIComponent(calendarId)}` +
      `&month=${encodeURIComponent(month)}` +
      `&timezone=${encodeURIComponent(TIMEZONE)}`;

    const response = await fetch(url, { headers: { Authorization: acuityAuth() } });
    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status, body }, "Acuity availability/dates error");
      res.status(502).json({ error: "Failed to fetch available dates" });
      return;
    }
    // Acuity returns [{ date: "YYYY-MM-DD" }, ...]
    const data = await response.json();
    const dates: string[] = Array.isArray(data) ? data.map((d: any) => d.date).filter(Boolean) : [];
    res.json(dates);
  } catch (err) {
    req.log.error({ err }, "booking/availability/dates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/availability/times ──────────────────────────────────────
// Query params: locationId, appointmentTypeID, date (YYYY-MM-DD)
router.get("/booking/availability/times", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const { locationId, appointmentTypeID, date } = req.query as Record<string, string>;
    if (!locationId || !appointmentTypeID || !date) {
      res.status(400).json({ error: "Missing required params: locationId, appointmentTypeID, date" });
      return;
    }
    const calendarId = resolveCalendarId(locationId);
    if (!calendarId) {
      res.status(400).json({ error: `Location ${locationId} is not yet configured` });
      return;
    }
    const url =
      `${ACUITY_BASE_URL}/availability/times` +
      `?appointmentTypeID=${encodeURIComponent(appointmentTypeID)}` +
      `&calendarID=${encodeURIComponent(calendarId)}` +
      `&date=${encodeURIComponent(date)}` +
      `&timezone=${encodeURIComponent(TIMEZONE)}`;

    const response = await fetch(url, { headers: { Authorization: acuityAuth() } });
    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status, body }, "Acuity availability/times error");
      res.status(502).json({ error: "Failed to fetch available times" });
      return;
    }
    // Acuity returns [{ time: "ISO", slotsAvailable: N }, ...]
    const data = await response.json();
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    req.log.error({ err }, "booking/availability/times error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/certificates ────────────────────────────────────────────
// Returns all active certificates (remainingValue > 0) for the signed-in member.
router.get("/booking/certificates", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const email = await getClerkUserEmail(req.userId);
    if (!email) { res.status(400).json({ error: "Could not resolve user email" }); return; }

    const url = `${ACUITY_BASE_URL}/certificates?email=${encodeURIComponent(email)}`;
    const response = await fetch(url, { headers: { Authorization: acuityAuth() } });
    if (!response.ok) {
      req.log.error({ status: response.status }, "Acuity certificates error");
      res.status(502).json({ error: "Failed to fetch certificates" });
      return;
    }
    const data = await response.json();
    const certs = (Array.isArray(data) ? data : [])
      .filter((c: any) => {
        // Dollar-value certificates/packages
        if (c.remainingValue !== null && c.remainingValue !== undefined) {
          return parseFloat(c.remainingValue) > 0;
        }
        // Session-count subscriptions (remainingCounts map of typeID → count)
        if (c.remainingCounts && typeof c.remainingCounts === "object") {
          return Object.values(c.remainingCounts).some((v: any) => Number(v) > 0);
        }
        return false;
      })
      .map((c: any) => {
        // Build a human-readable remaining label
        let remaining: string;
        if (c.remainingValue !== null && c.remainingValue !== undefined) {
          remaining = c.remainingValue;
        } else if (c.remainingCounts && typeof c.remainingCounts === "object") {
          const total = Object.values(c.remainingCounts).reduce(
            (sum: number, v: any) => sum + Number(v), 0
          );
          remaining = `${total} session${total !== 1 ? "s" : ""}`;
        } else {
          remaining = "0";
        }
        return {
          code: c.certificate,
          productName: c.name ?? c.productName ?? "Package",
          remainingValue: remaining,
          appointmentTypeIDs: c.appointmentTypeIDs ?? [],
          appliesToAllProducts: c.appliesToAllProducts ?? false,
        };
      });
    res.json(certs);
  } catch (err) {
    req.log.error({ err }, "booking/certificates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/certificates/check ──────────────────────────────────────
// Query params: certificate (the code string)
router.get("/booking/certificates/check", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const { certificate } = req.query as Record<string, string>;
    if (!certificate?.trim()) {
      res.status(400).json({ error: "Missing required param: certificate" });
      return;
    }
    const trimmedCode = certificate.trim();

    // Try Acuity code-based lookup first (works for gift certificates)
    let cert: any = null;
    const codeUrl = `${ACUITY_BASE_URL}/certificates?certificate=${encodeURIComponent(trimmedCode)}`;
    const codeRes = await fetch(codeUrl, { headers: { Authorization: acuityAuth() } });
    if (codeRes.ok) {
      const codeData = await codeRes.json();
      const codeCerts = Array.isArray(codeData) ? codeData : [codeData];
      cert = codeCerts.find((c: any) => c?.name || c?.productName) ?? null;
    }

    // Fallback: look up member's certificates by email (handles subscription packages)
    if (!cert && req.userId) {
      const email = await getClerkUserEmail(req.userId);
      if (email) {
        const emailUrl = `${ACUITY_BASE_URL}/certificates?email=${encodeURIComponent(email)}`;
        const emailRes = await fetch(emailUrl, { headers: { Authorization: acuityAuth() } });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          cert = (Array.isArray(emailData) ? emailData : []).find(
            (c: any) => c?.certificate === trimmedCode
          ) ?? null;
        }
      }
    }

    const productName = cert?.name ?? cert?.productName;
    if (!cert || !productName) {
      res.status(422).json({ error: "Invalid or expired certificate" });
      return;
    }
    // Remaining — dollar value or session count
    let remainingValue: string;
    if (cert.remainingValue !== null && cert.remainingValue !== undefined) {
      remainingValue = cert.remainingValue;
    } else if (cert.remainingCounts && typeof cert.remainingCounts === "object") {
      const total = Object.values(cert.remainingCounts).reduce(
        (sum: number, v: any) => sum + Number(v), 0
      );
      remainingValue = `${total} session${total !== 1 ? "s" : ""}`;
    } else {
      remainingValue = "0";
    }
    res.json({
      valid: true,
      productName,
      remainingValue,
      appliesToAllProducts: cert.appliesToAllProducts ?? false,
      productIDs: cert.appointmentTypeIDs ?? cert.productIDs ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "booking/certificates/check error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/booking/appointments ───────────────────────────────────────────
// Body: { locationId, appointmentTypeID, datetime, phone?, notes?, certificate? }
// firstName, lastName, and email are derived from the authenticated Clerk user —
// never trusted from the request body — to prevent booking under another user's identity.
router.post("/booking/appointments", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const { locationId, appointmentTypeID, datetime, phone, notes, certificate } = req.body ?? {};
    if (!locationId || !appointmentTypeID || !datetime) {
      res.status(400).json({ error: "Missing required fields: locationId, appointmentTypeID, datetime" });
      return;
    }
    const calendarId = resolveCalendarId(String(locationId));
    if (!calendarId) {
      res.status(400).json({ error: `Location ${locationId} is not configured` });
      return;
    }

    // Derive identity from Clerk — do not trust client-submitted values
    const clerkUser = await clerkClient.users.getUser(req.userId);
    const email =
      clerkUser.emailAddresses.find((e: any) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      res.status(400).json({ error: "Authenticated user has no email address on file" });
      return;
    }
    const firstName = clerkUser.firstName ?? "";
    const lastName = clerkUser.lastName ?? "";

    const payload: Record<string, unknown> = {
      appointmentTypeID: Number(appointmentTypeID),
      calendarID: Number(calendarId),
      datetime,
      firstName,
      lastName,
      email,
    };
    if (phone) payload.phone = phone;
    if (notes) payload.notes = notes;
    if (certificate) payload.certificate = String(certificate);

    const response = await fetch(`${ACUITY_BASE_URL}/appointments`, {
      method: "POST",
      headers: { Authorization: acuityAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status, body }, "Acuity appointment creation error");
      let message = "Failed to create appointment";
      try {
        const errJson = JSON.parse(body);
        if (errJson.message) message = errJson.message;
      } catch { /* ignore */ }
      res.status(422).json({ error: message });
      return;
    }
    const appt = await response.json();
    res.json({
      id: appt.id,
      type: appt.type,
      date: appt.date,
      time: appt.datetime,
      calendar: appt.calendar,
      location: appt.location ?? null,
      confirmationPage: appt.confirmationPage ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "booking/appointments POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
