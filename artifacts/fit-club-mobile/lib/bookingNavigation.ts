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
 * Keep the Book tab on the navigator's default nested-stack behavior.
 * A blur-time pop caused Android Expo Go to remain in a pending Book query
 * after returning from another tab. The confirmation route guard remains the
 * safety boundary for stale or malformed confirmation routes.
 */
export const BOOK_TAB_OPTIONS = {} as const;

export interface BookTabPressState {
  isFocused: boolean;
  nestedIndex?: number;
}

/**
 * Prevent the native-stack default tab reselect pop only when Book is already
 * focused on a nested booking step. Selecting Book from another tab and
 * selecting it at the Book root must continue with default behavior.
 */
export function shouldPreventNestedBookTabPress({
  isFocused,
  nestedIndex = 0,
}: BookTabPressState): boolean {
  return isFocused && nestedIndex > 0;
}