import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOK_TAB_OPTIONS,
  getCompleteBookingConfirmation,
} from './bookingNavigation.ts';

test('Book tab does not reset its nested stack on blur', () => {
  assert.equal('popToTopOnBlur' in BOOK_TAB_OPTIONS, false);
});

test('parameterless confirmation data is rejected', () => {
  assert.equal(getCompleteBookingConfirmation({}), null);
});

test('incomplete confirmation data is rejected', () => {
  assert.equal(
    getCompleteBookingConfirmation({
      appointmentId: 'apt-123',
      appointmentType: 'Workout for 1',
      dateDisplay: 'Thursday, August 20',
      timeDisplay: '',
      locationName: 'Main Studio',
    }),
    null,
  );
});

test('complete confirmation data is normalized for rendering', () => {
  assert.deepEqual(
    getCompleteBookingConfirmation({
      appointmentId: ['apt-123'],
      appointmentType: ['Workout for 1'],
      dateDisplay: ['Thursday, August 20'],
      timeDisplay: ['2:30 PM'],
      locationName: ['Main Studio'],
    }),
    {
      appointmentId: 'apt-123',
      appointmentType: 'Workout for 1',
      dateDisplay: 'Thursday, August 20',
      timeDisplay: '2:30 PM',
      locationName: 'Main Studio',
    },
  );
});