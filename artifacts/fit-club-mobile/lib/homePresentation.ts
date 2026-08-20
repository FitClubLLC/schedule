export type HomeUpcomingState = "loading" | "error" | "ready";

export function getHomeUpcomingState(input: {
  isLoading: boolean;
  isError: boolean;
}): HomeUpcomingState {
  if (input.isError) return "error";
  if (input.isLoading) return "loading";
  return "ready";
}