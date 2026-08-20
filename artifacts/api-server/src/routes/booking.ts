import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { getAcuityConfig } from "../config/acuity.js";
import {
  certificateBalanceState,
  configuredAppointmentTypeIds,
  formatCertificateRemaining,
  nativeBookingRequiresCertificate,
  validateLocationService,
} from "../lib/booking-eligibility.js";
import type { AcuityCreatedAppointmentResponse } from "../lib/acuity-response-types.js";

const router: IRouter = Router();

const ACUITY_USER_ID = process.env.ACUITY_USER_ID;
const ACUITY_API_KEY = process.env.ACUITY_API_KEY;
const ACUITY_BASE_URL = "https://acuityscheduling.com/api/v1";
// Default to Eastern Time — the studio's timezone
const TIMEZONE = process.env.BOOKING_TIMEZONE ?? "America/New_York";

function acuityAuth(): string {
  const token = Buffer.from(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`).toString("base64");
  return `Basic ${token}`;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validPhoneNumber(value: unknown): string | undefined {
  const phone = nonEmptyString(value);
  if (!phone) return undefined;

  const digitCount = phone.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15 ? phone : undefined;
}

async function getClerkUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return (
      user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch { return null; }
}

/**
 * Acuity treats /certificates/check as the authority for a code's expiry,
 * remaining balance, product compatibility, and optional client-email rule.
 * A 4xx response means the code cannot be used for that appointment type.
 */
async function isCertificateValidForAppointmentType(
  certificate: string,
  appointmentTypeId: string,
  email: string,
): Promise<boolean> {
  const query = new URLSearchParams({
    certificate,
    appointmentTypeID: appointmentTypeId,
    email,
  });
  const response = await fetch(`${ACUITY_BASE_URL}/certificates/check?${query}`, {
    headers: { Authorization: acuityAuth() },
  });

  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) return false;
    throw new Error(`Acuity certificate validation failed with status ${response.status}`);
  }

  const body: any = await response.json().catch(() => null);
  return typeof body?.valid === "boolean" ? body.valid : true;
}

interface CertificateEligibility {
  eligibleTypeIds: string[];
  productName: string;
  remainingValue: string;
}

/**
 * Resolves the currently usable appointment types for a certificate code.
 * Raw certificate metadata is used only for display and an early empty-balance
 * check; Acuity's validation endpoint remains the authoritative decision.
 */
async function getCertificateEligibility(
  certificate: string,
  email: string,
  certificateMetadata?: any,
): Promise<CertificateEligibility> {
  const config = getAcuityConfig();
  const trimmedCode = certificate.trim();
  let metadata = certificateMetadata ?? null;

  if (!metadata) {
    const codeUrl = `${ACUITY_BASE_URL}/certificates?certificate=${encodeURIComponent(trimmedCode)}`;
    const codeResponse = await fetch(codeUrl, { headers: { Authorization: acuityAuth() } });
    if (codeResponse.ok) {
      const codeData = await codeResponse.json();
      const candidates = Array.isArray(codeData) ? codeData : [codeData];
      metadata = candidates.find((item: any) => item?.certificate === trimmedCode) ??
        candidates.find((item: any) => item?.name || item?.productName) ??
        null;
    } else if (codeResponse.status >= 500) {
      throw new Error(`Acuity certificate lookup failed with status ${codeResponse.status}`);
    }
  }

  if (metadata && certificateBalanceState(metadata) === "empty") {
    return {
      eligibleTypeIds: [],
      productName: metadata.name ?? metadata.productName ?? "Package",
      remainingValue: formatCertificateRemaining(metadata),
    };
  }

  const appointmentTypeIds = configuredAppointmentTypeIds(config);
  const checks = await Promise.all(
    appointmentTypeIds.map(async (appointmentTypeId) => ({
      appointmentTypeId,
      valid: await isCertificateValidForAppointmentType(trimmedCode, appointmentTypeId, email),
    })),
  );
  const eligibleTypeIds = checks
    .filter((check) => check.valid)
    .map((check) => check.appointmentTypeId);

  return {
    eligibleTypeIds,
    productName: metadata?.name ?? metadata?.productName ?? "Package",
    remainingValue: metadata ? formatCertificateRemaining(metadata) : "0",
  };
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
  } catch {
    req.log.error({ errorCode: "booking_config_error" }, "booking/config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/booking/locations ────────────────────────────────────────────────
// Returns the two studio locations. Names come from env vars (defaults: POTOMAC / KENTLANDS).
router.get("/booking/locations", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { locations } = getAcuityConfig();
    res.json(locations.map(({ id, name }) => ({ id, name })));
  } catch {
    req.log.error({ errorCode: "booking_locations_error" }, "booking/locations error");
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
  } catch {
    req.log.error({ errorCode: "booking_appointment_types_error" }, "booking/appointment-types error");
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
    const locationValidation = validateLocationService(
      getAcuityConfig(),
      String(locationId),
      String(appointmentTypeID),
    );
    if (!locationValidation.ok) {
      res.status(locationValidation.status).json({ error: locationValidation.error });
      return;
    }
    const calendarId = locationValidation.service.calendarId;
    const url =
      `${ACUITY_BASE_URL}/availability/dates` +
      `?appointmentTypeID=${encodeURIComponent(appointmentTypeID)}` +
      `&calendarID=${encodeURIComponent(calendarId)}` +
      `&month=${encodeURIComponent(month)}` +
      `&timezone=${encodeURIComponent(TIMEZONE)}`;

    const response = await fetch(url, { headers: { Authorization: acuityAuth() } });
    if (!response.ok) {
      await response.text();
      req.log.error({ status: response.status }, "Acuity availability/dates error");
      res.status(502).json({ error: "Failed to fetch available dates" });
      return;
    }
    // Acuity returns [{ date: "YYYY-MM-DD" }, ...]
    const data = await response.json();
    const dates: string[] = Array.isArray(data) ? data.map((d: any) => d.date).filter(Boolean) : [];
    res.json(dates);
  } catch {
    req.log.error({ errorCode: "booking_availability_dates_error" }, "booking/availability/dates error");
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
    const locationValidation = validateLocationService(
      getAcuityConfig(),
      String(locationId),
      String(appointmentTypeID),
    );
    if (!locationValidation.ok) {
      res.status(locationValidation.status).json({ error: locationValidation.error });
      return;
    }
    const calendarId = locationValidation.service.calendarId;
    const url =
      `${ACUITY_BASE_URL}/availability/times` +
      `?appointmentTypeID=${encodeURIComponent(appointmentTypeID)}` +
      `&calendarID=${encodeURIComponent(calendarId)}` +
      `&date=${encodeURIComponent(date)}` +
      `&timezone=${encodeURIComponent(TIMEZONE)}`;

    const response = await fetch(url, { headers: { Authorization: acuityAuth() } });
    if (!response.ok) {
      await response.text();
      req.log.error({ status: response.status }, "Acuity availability/times error");
      res.status(502).json({ error: "Failed to fetch available times" });
      return;
    }
    // Acuity returns [{ time: "ISO", slotsAvailable: N }, ...]
    const data = await response.json();
    res.json(Array.isArray(data) ? data : []);
  } catch {
    req.log.error({ errorCode: "booking_availability_times_error" }, "booking/availability/times error");
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
    const rawCertificates = (Array.isArray(data) ? data : [])
      .filter((certificate: any) => certificate?.certificate)
      .filter((certificate: any) => certificateBalanceState(certificate) !== "empty");
    const certs = (await Promise.all(rawCertificates.map(async (certificate: any) => {
      const eligibility = await getCertificateEligibility(certificate.certificate, email, certificate);
      if (eligibility.eligibleTypeIds.length === 0) return null;
      return {
        code: certificate.certificate,
        productName: eligibility.productName,
        remainingValue: eligibility.remainingValue,
        appointmentTypeIDs: eligibility.eligibleTypeIds,
        appliesToAllProducts:
          eligibility.eligibleTypeIds.length === configuredAppointmentTypeIds(getAcuityConfig()).length,
      };
    }))).filter(Boolean);
    res.json(certs);
  } catch {
    req.log.error({ errorCode: "booking_certificates_error" }, "booking/certificates error");
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

    const email = await getClerkUserEmail(req.userId);
    if (!email) {
      res.status(400).json({ error: "Could not resolve user email" });
      return;
    }
    const eligibility = await getCertificateEligibility(trimmedCode, email);
    if (eligibility.eligibleTypeIds.length === 0) {
      res.status(422).json({ error: "Invalid or expired certificate" });
      return;
    }
    res.json({
      valid: true,
      productName: eligibility.productName,
      remainingValue: eligibility.remainingValue,
      appliesToAllProducts:
        eligibility.eligibleTypeIds.length === configuredAppointmentTypeIds(getAcuityConfig()).length,
      productIDs: eligibility.eligibleTypeIds,
    });
  } catch {
    req.log.error({ errorCode: "booking_certificate_check_error" }, "booking/certificates/check error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/booking/appointments ───────────────────────────────────────────
// Body: { locationId, appointmentTypeID, datetime, firstName?, lastName?, phone?, termsAccepted, notes?, certificate? }
// The authenticated Clerk user remains authoritative when it has a name; the
// booking form supplies a fallback when a required Acuity identity field is
// missing from the Production Clerk profile.
router.post("/booking/appointments", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireAcuity(req, res)) return;
  try {
    const {
      locationId,
      appointmentTypeID,
      datetime,
      firstName: bookingFirstName,
      lastName: bookingLastName,
      phone: bookingPhone,
      termsAccepted,
      notes,
      certificate,
    } = req.body ?? {};
    if (!locationId || !appointmentTypeID || !datetime) {
      res.status(400).json({ error: "Missing required fields: locationId, appointmentTypeID, datetime" });
      return;
    }
    const requestedAppointmentTypeId = String(appointmentTypeID);
    const locationValidation = validateLocationService(
      getAcuityConfig(),
      String(locationId),
      requestedAppointmentTypeId,
    );
    if (!locationValidation.ok) {
      req.log.warn(
        {
          locationId: String(locationId),
          appointmentTypeID: requestedAppointmentTypeId,
        },
        "Acuity booking location/service validation failed",
      );
      res.status(locationValidation.status).json({ error: locationValidation.error });
      return;
    }
    const calendarId = locationValidation.service.calendarId;
    const certificateCode = nonEmptyString(certificate);
    if (
      nativeBookingRequiresCertificate(
        locationValidation.service,
        getAcuityConfig().appointmentTypes.workoutFor1,
      ) &&
      !certificateCode
    ) {
      req.log.warn(
        {
          locationId: String(locationId),
          appointmentTypeID: requestedAppointmentTypeId,
        },
        "Acuity native booking requires an eligible certificate",
      );
      res.status(422).json({
        error: "Choose an active package for this session, or continue through Acuity to purchase it.",
      });
      return;
    }

    // Use the verified Clerk session that authenticated this exact request rather
    // than a mutable request property. The Admin API is authoritative, while the
    // signed session claims provide a safe fallback if its user representation is
    // temporarily missing a profile field.
    const auth = getAuth(req);
    const userId = auth.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find((e: any) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      res.status(400).json({ error: "Authenticated user has no email address on file" });
      return;
    }
    const sessionClaims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
    const clerkFirstName = nonEmptyString(clerkUser.firstName);
    const clerkLastName = nonEmptyString(clerkUser.lastName);
    const clerkPhone = validPhoneNumber(clerkUser.primaryPhoneNumber?.phoneNumber);
    const sessionFirstName = nonEmptyString(sessionClaims.first_name);
    const sessionLastName = nonEmptyString(sessionClaims.last_name);
    const sessionPhone = validPhoneNumber(sessionClaims.phone_number);
    const formFirstName = nonEmptyString(bookingFirstName);
    const formLastName = nonEmptyString(bookingLastName);
    const formPhone = validPhoneNumber(bookingPhone);
    const trustedFirstName = clerkFirstName ?? sessionFirstName;
    const trustedLastName = clerkLastName ?? sessionLastName;
    const trustedPhone = clerkPhone ?? sessionPhone;
    const firstName = trustedFirstName ?? formFirstName;
    const lastName = trustedLastName ?? formLastName;
    const phone = trustedPhone ?? formPhone;

    if (!firstName) {
      req.log.error(
        {
          userId,
        },
        "Acuity booking identity is missing firstName",
      );
      res.status(422).json({
        error: "A first name is required to complete booking.",
      });
      return;
    }

    if (!phone) {
      req.log.error(
        {
          userId,
        },
        "Acuity booking identity is missing a valid phone number",
      );
      res.status(422).json({
        error: "A valid phone number is required to complete booking.",
      });
      return;
    }

    if (termsAccepted !== true) {
      req.log.warn({ userId }, "Acuity booking terms acknowledgement is missing");
      res.status(422).json({
        error: "You must agree to the Terms & Conditions to complete booking.",
      });
      return;
    }

    if (certificateCode) {
      const certificateEligibility = await getCertificateEligibility(
        certificateCode,
        email,
      );
      if (!certificateEligibility.eligibleTypeIds.includes(requestedAppointmentTypeId)) {
        req.log.warn({ userId }, "Acuity booking certificate is no longer eligible");
        res.status(422).json({
          error: "That package is no longer valid for this service. Please choose another package.",
        });
        return;
      }
    }

    const termsFieldId = Number(getAcuityConfig().termsAcknowledgement.fieldId);
    if (!Number.isInteger(termsFieldId) || termsFieldId <= 0) {
      req.log.error({ userId }, "Acuity terms field configuration is invalid");
      res.status(500).json({ error: "Booking configuration is invalid" });
      return;
    }

    req.log.info(
      {
        userId,
        firstNameSource: trustedFirstName ? "clerk" : "booking-form",
        lastNameSource: trustedLastName ? "clerk" : formLastName ? "booking-form" : "missing",
        phoneSource: trustedPhone ? "clerk" : "booking-form",
        termsAccepted: true,
      },
      "Acuity booking identity resolved",
    );

    const payload: Record<string, unknown> = {
      appointmentTypeID: Number(appointmentTypeID),
      calendarID: Number(calendarId),
      datetime,
      firstName,
      email,
    };
    if (lastName) payload.lastName = lastName;
    payload.phone = phone;
    payload.fields = [{ id: termsFieldId, value: "true" }];
    if (notes) payload.notes = notes;
    if (certificateCode) payload.certificate = certificateCode;

    const response = await fetch(`${ACUITY_BASE_URL}/appointments`, {
      method: "POST",
      headers: { Authorization: acuityAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status }, "Acuity appointment creation error");
      let message = "Failed to create appointment";
      try {
        const errJson = JSON.parse(body);
        if (errJson.message) message = errJson.message;
      } catch { /* ignore */ }
      res.status(422).json({ error: message });
      return;
    }
    const appt = (await response.json()) as AcuityCreatedAppointmentResponse;
    res.json({
      id: appt.id,
      type: appt.type,
      date: appt.date,
      time: appt.datetime,
      calendar: appt.calendar,
      location: appt.location ?? null,
      confirmationPage: appt.confirmationPage ?? null,
    });
  } catch {
    req.log.error({ errorCode: "booking_appointment_creation_error" }, "booking/appointments POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
