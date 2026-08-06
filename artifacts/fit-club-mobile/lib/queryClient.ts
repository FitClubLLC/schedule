import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient shared across the app.
 * Exported so it can be cleared on sign-out (index.tsx) and provided
 * via QueryClientProvider in the root layout.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always consider cached data stale so focus/foreground also triggers a refresh.
      staleTime: 0,
      // Don't retry 4xx errors — they won't fix themselves without user action.
      // Errors thrown by authFetch carry a .status property for this check.
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      // Polling is opt-in per query — not every query needs 60-second intervals.
      // Appointment and certificate queries define their own refetchInterval where needed.
      refetchIntervalInBackground: false,
    },
  },
});
