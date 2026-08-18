import { Stack } from 'expo-router';

export default function BookLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {/*
       * Disable the back gesture on the Confirmed screen.
       * By the time the member lands here the booking has already been
       * submitted to Acuity.  Allowing them to swipe back would return
       * them to Select Time with stale availability state, and they could
       * accidentally re-confirm and create a duplicate appointment.
       */}
      <Stack.Screen name="confirmed" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
