import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOK_TAB_OPTIONS,
  getCompleteBookingConfirmation,
  shouldPreventNestedBookTabPress,
} from './bookingNavigation.ts';

test('Book tab does not reset its nested stack on blur', () => {
  assert.equal('popToTopOnBlur' in BOOK_TAB_OPTIONS, false);
});

test('selecting Book from another tab keeps normal tab navigation', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: false, nestedIndex: 3 }),
    false,
  );
});

test('selecting Book at its root keeps normal behavior', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: true, nestedIndex: 0 }),
    false,
  );
});

test('reselecting Book on Select Service does not bulk-pop', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: true, nestedIndex: 1 }),
    true,
  );
});

test('reselecting Book on Choose Your Time does not bulk-pop', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: true, nestedIndex: 2 }),
    true,
  );
});

test('reselecting Book on Confirm Booking does not bulk-pop', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: true, nestedIndex: 3 }),
    true,
  );
});

test('back-arrow behavior remains outside the tab reselect guard', () => {
  assert.equal(
    shouldPreventNestedBookTabPress({ isFocused: true, nestedIndex: 0 }),
    false,
  );
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