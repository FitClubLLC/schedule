import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-fetch from Acuity every 60 seconds so new bookings appear automatically.
      refetchInterval: 60_000,
      // Always consider cached data stale so focus/tab-switch also triggers a refresh.
      staleTime: 0,
    },
  },
});
