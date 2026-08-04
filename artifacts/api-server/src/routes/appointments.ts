import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  GetUpcomingAppointmentsResponse,
  GetPastAppointmentsResponse,
  GetAppointmentSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ACUITY_USER_ID = process.env.ACUITY_USER_ID;
const ACUITY_API_KEY = process.env.ACUITY_API_KEY;
const ACUITY_BASE_URL = "https://acuityscheduling.com/api/v1";

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

    const today = new Date().toISOString().split("T")[0];
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

    const raw = await response.json();
    const appointments = mapAcuityAppointments(raw);
    res.json(GetUpcomingAppointmentsResponse.parse(appointments));
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

    const today = new Date().toISOString().split("T")[0];
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

    const raw = await response.json();
    const appointments = mapAcuityAppointments(raw);
    res.json(GetPastAppointmentsResponse.parse(appointments));
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

    const today = new Date().toISOString().split("T")[0];

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
      upcomingRes.json(),
      pastRes.json(),
    ]);

    const upcoming = mapAcuityAppointments(upcomingRaw);
    const past = mapAcuityAppointments(pastRaw);

    const summary = {
      upcomingCount: upcoming.length,
      pastCount: past.length,
      nextAppointment: upcoming[0] ?? null,
    };

    res.json(GetAppointmentSummaryResponse.parse(summary));
  },
);

function mapAcuityAppointments(raw: any[]): any[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((appt) => ({
    id: appt.id,
    firstName: appt.firstName ?? "",
    lastName: appt.lastName ?? "",
    email: appt.email ?? "",
    phone: appt.phone ?? null,
    date: appt.date ?? "",
    time: appt.datetime ?? appt.time ?? "",
    endTime: appt.endTime ?? "",
    duration: appt.duration ?? 0,
    type: appt.type ?? "",
    calendar: appt.calendar ?? null,
    calendarID: appt.calendarID ?? null,
    location: appt.location ?? null,
    notes: appt.notes ?? null,
    confirmationPage: appt.confirmationPage ?? null,
  }));
}

export default router;
