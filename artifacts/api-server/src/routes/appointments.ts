import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  GetUpcomingAppointmentsResponse,
  GetPastAppointmentsResponse,
  GetAppointmentSummaryResponse,
} from "@workspace/api-zod";
import {
  appointmentStudioDate,
  EASTERN_TIME_ZONE,
  partitionAppointmentsByEasternTime,
  studioDateKey,
} from "../lib/appointment-time.js";
import type {
  AcuityAppointmentListResponse,
  AcuityAppointmentResponse,
  AcuityRescheduleResponse,
} from "../lib/acuity-response-types.js";

const router: IRouter = Router();

const ACUITY_USER_ID = process.env.ACUITY_USER_ID;
const ACUITY_API_KEY = process.env.ACUITY_API_KEY;
const ACUITY_BASE_URL = "https://acuityscheduling.com/api/v1";
const STUDIO_TIME_ZONE = process.env.BOOKING_TIMEZONE ?? EASTERN_TIME_ZONE;

function acuityAuthHeader(): string {
  const token = Buffer.from(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`).toString(
    "base64",
  );
  return `Basic ${token}`;
}

async function getClerkUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
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

// GET /appointments/upcoming
router.get(
  "/appointments/upcoming",
  requireAuth,
  async (req: any, res): Promise<void> => {
    if (!ACUITY_API_KEY || !ACUITY_USER_ID) {
      res.status(500).json({ error: "Acuity credentials not configured" });
      return;
    }

    const email = await getClerkUserEmail(req.userId);
    if (!email) {
      res.status(400).json({ error: "Could not resolve user email" });
      return;
    }

    const now = new Date();
    const today = studioDateKey(now, STUDIO_TIME_ZONE);
    const url = `${ACUITY_BASE_URL}/appointments?email=${encodeURIComponent(email)}&minDate=${today}&direction=ASC&max=50`;

    const response = await fetch(url, {
      headers: { Authorization: acuityAuthHeader() },
    });

    if (!response.ok) {
      req.log.error(
        { status: response.status },
        "Acuity API error for upcoming appointments",
      );
      res
        .status(502)
        .json({ error: "Failed to fetch appointments from Acuity" });
      return;
    }

    const raw = (await response.json()) as AcuityAppointmentListResponse;
    const appointments = mapAcuityAppointments(raw);
    const { upcoming } = partitionAppointmentsByEasternTime(
      appointments,
      now,
      STUDIO_TIME_ZONE,
    );
    res.json(GetUpcomingAppointmentsResponse.parse(upcoming));
  },
);

// GET /appointments/past
router.get(
  "/appointments/past",
  requireAuth,
  async (req: any, res): Promise<void> => {
    if (!ACUITY_API_KEY || !ACUITY_USER_ID) {
      res.status(500).json({ error: "Acuity credentials not configured" });
      return;
    }

    const email = await getClerkUserEmail(req.userId);
    if (!email) {
      res.status(400).json({ error: "Could not resolve user email" });
      return;
    }

    const now = new Date();
    const today = studioDateKey(now, STUDIO_TIME_ZONE);
    const url = `${ACUITY_BASE_URL}/appointments?email=${encodeURIComponent(email)}&maxDate=${today}&direction=DESC&max=50`;

    const response = await fetch(url, {
      headers: { Authorization: acuityAuthHeader() },
    });

    if (!response.ok) {
      req.log.error(
        { status: response.status },
        "Acuity API error for past appointments",
      );
      res
        .status(502)
        .json({ error: "Failed to fetch appointments from Acuity" });
      return;
    }

    const raw = (await response.json()) as AcuityAppointmentListResponse;
    const appointments = mapAcuityAppointments(raw);
    const { past } = partitionAppointmentsByEasternTime(
      appointments,
      now,
      STUDIO_TIME_ZONE,
    );
    res.json(GetPastAppointmentsResponse.parse(past));
  },
);

// GET /appointments/summary
router.get(
  "/appointments/summary",
  requireAuth,
  async (req: any, res): Promise<void> => {
    if (!ACUITY_API_KEY || !ACUITY_USER_ID) {
      res.status(500).json({ error: "Acuity credentials not configured" });
      return;
    }

    const email = await getClerkUserEmail(req.userId);
    if (!email) {
      res.status(400).json({ error: "Could not resolve user email" });
      return;
    }

    const now = new Date();
    const today = studioDateKey(now, STUDIO_TIME_ZONE);

    const [upcomingRes, pastRes] = await Promise.all([
      fetch(
        `${ACUITY_BASE_URL}/appointments?email=${encodeURIComponent(email)}&minDate=${today}&direction=ASC&max=50`,
        { headers: { Authorization: acuityAuthHeader() } },
      ),
      fetch(
        `${ACUITY_BASE_URL}/appointments?email=${encodeURIComponent(email)}&maxDate=${today}&direction=DESC&max=50`,
        { headers: { Authorization: acuityAuthHeader() } },
      ),
    ]);

    if (!upcomingRes.ok || !pastRes.ok) {
      res.status(502).json({ error: "Failed to fetch summary from Acuity" });
      return;
    }

    const [upcomingRaw, pastRaw] = await Promise.all([
      upcomingRes.json() as Promise<AcuityAppointmentListResponse>,
      pastRes.json() as Promise<AcuityAppointmentListResponse>,
    ]);

    const upcoming = partitionAppointmentsByEasternTime(
      mapAcuityAppointments(upcomingRaw),
      now,
      STUDIO_TIME_ZONE,
    ).upcoming;
    const past = partitionAppointmentsByEasternTime(
      mapAcuityAppointments(pastRaw),
      now,
      STUDIO_TIME_ZONE,
    ).past;

    const summary = {
      upcomingCount: upcoming.length,
      pastCount: past.length,
      nextAppointment: upcoming[0] ?? null,
    };

    res.json(GetAppointmentSummaryResponse.parse(summary));
  },
);

// DELETE /appointments/:id  — cancel an appointment
router.delete(
  "/appointments/:id",
  requireAuth,
  async (req: any, res): Promise<void> => {
    const { id } = req.params;
    const email = await getClerkUserEmail(req.userId);
    if (!email) { res.status(400).json({ error: "Could not resolve user email" }); return; }

    // Verify the appointment belongs to this user before cancelling.
    const apptRes = await fetch(`${ACUITY_BASE_URL}/appointments/${id}`, {
      headers: { Authorization: acuityAuthHeader() },
    });
    if (!apptRes.ok) { res.status(404).json({ error: "Appointment not found" }); return; }
    const appt = (await apptRes.json()) as AcuityAppointmentResponse;
    if (appt.email?.toLowerCase() !== email.toLowerCase()) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const cancelRes = await fetch(`${ACUITY_BASE_URL}/appointments/${id}/cancel`, {
      method: "PUT",
      headers: { Authorization: acuityAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ cancelNote: "Cancelled via Fit Club app" }),
    });
    if (!cancelRes.ok) {
      res.status(502).json({ error: "Failed to cancel appointment" }); return;
    }
    res.json({ success: true });
  },
);

// GET /appointments/:id/times?date=YYYY-MM-DD — available slots for rescheduling
router.get(
  "/appointments/:id/times",
  requireAuth,
  async (req: any, res): Promise<void> => {
    const { id } = req.params;
    const { date } = req.query as { date?: string };
    if (!date) { res.status(400).json({ error: "date query param required" }); return; }

    const email = await getClerkUserEmail(req.userId);
    if (!email) { res.status(400).json({ error: "Could not resolve user email" }); return; }

    const apptRes = await fetch(`${ACUITY_BASE_URL}/appointments/${id}`, {
      headers: { Authorization: acuityAuthHeader() },
    });
    if (!apptRes.ok) { res.status(404).json({ error: "Appointment not found" }); return; }
    const appt = (await apptRes.json()) as AcuityAppointmentResponse;
    if (appt.email?.toLowerCase() !== email.toLowerCase()) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const timesUrl =
      `${ACUITY_BASE_URL}/availability/times` +
      `?date=${date}` +
      `&appointmentTypeID=${appt.appointmentTypeID}` +
      `&calendarID=${appt.calendarID}`;

    const timesRes = await fetch(timesUrl, { headers: { Authorization: acuityAuthHeader() } });
    if (!timesRes.ok) {
      res.status(502).json({ error: "Failed to fetch available times" }); return;
    }
    const times = await timesRes.json();
    // Return only what the client needs.
    res.json(
      Array.isArray(times)
        // Acuity's availability/times response uses "time" for the ISO datetime string.
        // There is no separate "datetime" field — map t.time to both slots so the
        // client's selectedSlot.datetime is always a valid ISO string, not undefined.
        ? times.map((t: any) => ({ time: t.time, datetime: t.time }))
        : [],
    );
  },
);

// PUT /appointments/:id  — reschedule to a new datetime
// NOTE: Acuity's PUT /appointments/:id only updates metadata (notes, fields, etc.).
// Rescheduling requires POST /appointments/:id/reschedule — that is the correct endpoint.
router.put(
  "/appointments/:id",
  requireAuth,
  async (req: any, res): Promise<void> => {
    const { id } = req.params;
    const { datetime } = req.body as { datetime?: string };
    if (!datetime) { res.status(400).json({ error: "datetime required in body" }); return; }

    const email = await getClerkUserEmail(req.userId);
    if (!email) { res.status(400).json({ error: "Could not resolve user email" }); return; }

    // Verify ownership before rescheduling.
    const apptRes = await fetch(`${ACUITY_BASE_URL}/appointments/${id}`, {
      headers: { Authorization: acuityAuthHeader() },
    });
    if (!apptRes.ok) { res.status(404).json({ error: "Appointment not found" }); return; }
    const appt = (await apptRes.json()) as AcuityAppointmentResponse;
    if (appt.email?.toLowerCase() !== email.toLowerCase()) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Use the dedicated /reschedule endpoint — PUT /appointments/:id only updates
    // metadata and silently ignores datetime, returning 200 without moving the slot.
    const payload = { datetime };
    req.log.info({ appointmentId: id, datetime }, "Rescheduling appointment via Acuity");

    const reschedRes = await fetch(`${ACUITY_BASE_URL}/appointments/${id}/reschedule`, {
      method: "PUT",
      headers: { Authorization: acuityAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const reschedBody = (await reschedRes.json().catch(() => null)) as
      | AcuityRescheduleResponse
      | null;

    if (!reschedRes.ok) {
      req.log.error(
        { appointmentId: id, datetime, status: reschedRes.status },
        "Acuity reschedule failed",
      );
      res.status(502).json({
        error: reschedBody?.message ?? reschedBody?.error ?? "Failed to reschedule appointment",
      });
      return;
    }

    req.log.info(
      { appointmentId: id, newDatetime: reschedBody?.datetime },
      "Appointment rescheduled successfully",
    );
    res.json({ success: true, datetime: reschedBody?.datetime });
  },
);

function mapAcuityAppointments(raw: AcuityAppointmentListResponse) {
  if (!Array.isArray(raw)) return [];
  return raw.map((appt) => ({
    id: appt.id,
    firstName: appt.firstName ?? "",
    lastName: appt.lastName ?? "",
    email: appt.email ?? "",
    phone: appt.phone ?? null,
    // `datetime` may be expressed in UTC. Convert it to the studio calendar
    // date so display and "today" grouping agree with classification.
    date: appointmentStudioDate(appt.datetime, appt.date ?? "", STUDIO_TIME_ZONE),
    time: appt.datetime ?? appt.time ?? "",
    endTime: appt.endTime ?? "",
    duration: Number(appt.duration ?? 0),
    type: appt.type ?? "",
    calendar: appt.calendar ?? null,
    calendarID: appt.calendarID ?? null,
    location: appt.location ?? null,
    notes: appt.notes ?? null,
    confirmationPage: appt.confirmationPage ?? null,
  }));
}

export default router;
