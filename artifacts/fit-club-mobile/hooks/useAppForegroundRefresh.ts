import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Invalidates the given query keys whenever the app returns to the foreground.
 * Use this on screens that display data that may have changed while the user
 * was in an external browser (e.g. after completing a booking in Acuity).
 */
export function useAppForegroundRefresh(queryKeys: ReadonlyArray<ReadonlyArray<string>>) {
  const queryClient = useQueryClient();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        queryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  // queryKeys is an array of arrays — stringify for stable dep comparison
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
