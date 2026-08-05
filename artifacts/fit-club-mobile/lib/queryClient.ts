import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient shared across the app.
 * Exported so it can be cleared on sign-out (index.tsx) and provided
 * via QueryClientProvider in the root layout.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-fetch from Acuity every 60 seconds so new bookings appear automatically.
      refetchInterval: 60_000,
      // Always consider cached data stale so focus/tab-switch also triggers a refresh.
      staleTime: 0,
      // Don't retry 4xx errors — they won't fix themselves without a config change.
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      // Don't keep polling when the last request failed.
      refetchIntervalInBackground: false,
    },
  },
});
