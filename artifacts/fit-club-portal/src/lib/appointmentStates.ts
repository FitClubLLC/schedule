export type AppointmentListState = "loading" | "error" | "empty" | "ready";

export const APPOINTMENTS_LOAD_ERROR_TITLE = "Could not load appointments";
export const APPOINTMENTS_LOAD_ERROR_DESCRIPTION =
  "We couldn't load your appointments right now. Please try again.";
export const CANCELLATION_ERROR_MESSAGE =
  "We couldn't cancel this appointment. Please try again.";

export function getAppointmentListState({
  isLoading,
  isError,
  count,
}: {
  isLoading: boolean;
  isError: boolean;
  count: number;
}): AppointmentListState {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (count === 0) return "empty";
  return "ready";
}