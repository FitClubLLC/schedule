/**
 * BookingProgress — compact step indicator for the mobile booking flow.
 *
 * Shows proportional progress bars (one per step) above the current step label.
 * Completed steps are dimmed gold; the current step is full gold; upcoming
 * steps are the border colour.
 *
 * Usage:
 *   const steps = from === 'select-service'
 *     ? ['Location', 'Service', 'Date & Time', 'Confirm']
 *     : ['Location', 'Date & Time', 'Confirm'];
 *
 *   <BookingProgress steps={steps} currentStep="Date & Time" />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface BookingProgressProps {
  /** Ordered step labels for this booking path. */
  steps: string[];
  /** Label of the step the member is on. */
  currentStep: string;
}

export function BookingProgress({ steps, currentStep }: BookingProgressProps) {
  const colors = useColors();
  const currentIndex = steps.indexOf(currentStep);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${currentIndex + 1} of ${steps.length}: ${currentStep}`}
    >
      {/* Progress bars */}
      <View style={styles.bars}>
        {steps.map((step, i) => (
          <View
            key={step}
            style={[
              styles.bar,
              {
                backgroundColor:
                  i < currentIndex
                    ? 'rgba(211,175,55,0.38)'
                    : i === currentIndex
                    ? colors.primary
                    : colors.border,
              },
            ]}
          />
        ))}
      </View>

      {/* Step label */}
      <Text
        style={[styles.label, { color: colors.mutedForeground }]}
        accessibilityElementsHidden
      >
        {currentStep}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    gap: 6,
  },
  bars: {
    flexDirection: 'row',
    gap: 3,
  },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
