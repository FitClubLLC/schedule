export type BookingRouteParam = string | string[] | undefined;

export interface BookingConfirmationRouteParams {
  appointmentId?: BookingRouteParam;
  appointmentType?: BookingRouteParam;
  dateDisplay?: BookingRouteParam;
  timeDisplay?: BookingRouteParam;
  locationName?: BookingRouteParam;
  calendar?: BookingRouteParam;
}

export interface CompleteBookingConfirmation {
  appointmentId: string;
  appointmentType: string;
  dateDisplay: string;
  timeDisplay: string;
  locationName: string;
}

export function firstBookingRouteParam(value: BookingRouteParam): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

/**
 * Confirmation is a terminal success state, so it must have both the
 * appointment identity returned by the create request and every value shown
 * in the summary card.
 */
export function getCompleteBookingConfirmation(
  params: BookingConfirmationRouteParams,
): CompleteBookingConfirmation | null {
  const appointmentId = firstBookingRouteParam(params.appointmentId);
  const appointmentType = firstBookingRouteParam(params.appointmentType);
  const dateDisplay = firstBookingRouteParam(params.dateDisplay);
  const timeDisplay = firstBookingRouteParam(params.timeDisplay);
  const locationName =
    firstBookingRouteParam(params.calendar) || firstBookingRouteParam(params.locationName);

  if (!appointmentId || !appointmentType || !dateDisplay || !timeDisplay || !locationName) {
    return null;
  }

  return {
    appointmentId,
    appointmentType,
    dateDisplay,
    timeDisplay,
    locationName,
  };
}

/**
 * Android's classic tab navigator preserves each tab's nested stack by
 * default. Book must return to its entry screen after a member leaves it.
 */
export const BOOK_TAB_OPTIONS = {
  popToTopOnBlur: true,
} as const;