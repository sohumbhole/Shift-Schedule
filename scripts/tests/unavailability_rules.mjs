// Checks findUnavailability / unavailabilityAround in src/lib/shiftRules.js, in particular that a
// shift which crosses midnight is checked against the NEXT weekday's unavailability (the bug found
// 2026-11-16: a cook unavailable Friday 12 AM to 3 AM could be scheduled Thursday 9 PM to 3 AM with
// no warning). Pure unit test, no network. Run from the repo root:
//   node scripts/tests/unavailability_rules.mjs
import assert from 'node:assert/strict';
import { findUnavailability, unavailabilityAround } from '../../src/lib/shiftRules.js';

// 2026-11-19 is a Thursday, 2026-11-20 a Friday, 2026-11-18 a Wednesday.
const THU = '2026-11-19';
const FRI = '2026-11-20';
const WED = '2026-11-18';

const cook = {
  name: 'Cook',
  unavailable_hours: [
    { day: 'Friday', start_time: '00:00', end_time: '03:00' },
    { day: 'Monday', start_time: '08:00', end_time: '12:00' },
  ],
};
let checks = 0;
const is = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1; };
const block = (r) => (r ? `${r.day} ${r.start_time}-${r.end_time}` : null);

// The reported bug: Thursday shift running into Friday's early block.
is(block(findUnavailability(cook, THU, '21:00', '03:00')), 'Friday 00:00-03:00', 'Thu 9 PM to 3 AM meets the Friday 12 to 3 AM block');
is(block(findUnavailability(cook, THU, '22:00', '01:00')), 'Friday 00:00-03:00', 'Thu 10 PM to 1 AM meets it too');
is(block(findUnavailability(cook, THU, '23:30', '00:30')), 'Friday 00:00-03:00', 'a short shift over midnight meets it');
// A Thursday shift that ends at midnight exactly does not touch a block starting at midnight.
is(block(findUnavailability(cook, THU, '18:00', '00:00')), null, 'Thu 6 PM to midnight is clear');
is(block(findUnavailability(cook, THU, '10:00', '19:00')), null, 'Thu 10 AM to 7 PM is clear');
// The same block on its own date still works, including the website's shifted after midnight form.
is(block(findUnavailability(cook, FRI, '00:00', '03:00')), 'Friday 00:00-03:00', 'Fri 12 to 3 AM, dated Friday');
is(block(findUnavailability(cook, FRI, '02:00', '06:00')), 'Friday 00:00-03:00', 'Fri 2 to 6 AM, dated Friday');
is(block(findUnavailability(cook, FRI, '03:00', '11:00')), null, 'Fri 3 to 11 AM starts when the block ends');
// Next day blocks never leak onto shifts that stay on their own date.
is(block(findUnavailability(cook, WED, '21:00', '03:00')), null, 'Wed night does not meet a Friday block');
is(block(findUnavailability(cook, '2026-11-22', '18:00', '02:00')), null, 'Sunday night does not meet Monday 8 AM to noon');
// Same day blocks win over next day blocks when both overlap.
const both = { unavailable_hours: [{ day: 'Friday', start_time: '00:00', end_time: '03:00' }, { day: 'Thursday', start_time: '22:00', end_time: '23:59' }] };
is(block(findUnavailability(both, THU, '21:00', '02:00')), 'Thursday 22:00-23:59', 'the Thursday block is reported first');
// A block that itself crosses midnight reaches into the next date.
const late = { unavailable_hours: [{ day: 'Wednesday', start_time: '22:00', end_time: '02:00' }] };
is(block(findUnavailability(late, THU, '00:00', '04:00')), 'Wednesday 22:00-02:00', 'Wed 10 PM to 2 AM covers Thu 12 to 2 AM');
is(block(findUnavailability(late, THU, '02:00', '10:00')), null, 'Thu from 2 AM is clear');
is(block(findUnavailability(late, WED, '20:00', '23:00')), 'Wednesday 22:00-02:00', 'and still warns on Wednesday itself');
// Employees without blocks, or with none on those days.
is(findUnavailability({ unavailable_hours: [] }, THU, '21:00', '03:00'), null, 'no blocks');
is(findUnavailability({}, THU, '21:00', '03:00'), null, 'no field');
is(findUnavailability(null, THU, '21:00', '03:00'), null, 'no employee');

// unavailabilityAround places blocks on the date's clock for the day view overlay.
const around = unavailabilityAround(cook, THU).map((u) => [u.block.day, u.start, u.end]);
is(around, [['Friday', 1440, 1620]], 'Friday 12 to 3 AM sits at minutes 1440 to 1620 of Thursday');
const aroundFri = unavailabilityAround(cook, FRI).map((u) => [u.block.day, u.start, u.end]);
is(aroundFri, [['Friday', 0, 180]], 'and at 0 to 180 of Friday itself');
const aroundThuLate = unavailabilityAround(late, THU).map((u) => [u.block.day, u.start, u.end]);
is(aroundThuLate, [['Wednesday', -120, 120]], 'Wed 10 PM to 2 AM sits at minutes -120 to 120 of Thursday');

console.log(`unavailability_rules: ${checks} checks passed`);
