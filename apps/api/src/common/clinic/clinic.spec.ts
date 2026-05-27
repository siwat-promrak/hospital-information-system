/**
 * Focused unit tests for `isSlotWithinBookingWindows` (F21).
 *
 * The E21 test matrix (17 rows) is the acceptance bar. Every row that
 * exercises the predicate logic (rows 1–14) is covered here. Rows 15–17
 * (migration conversion and range validation) are covered in e2e and DTO
 * validation tests respectively.
 *
 * All times use `CLINIC_TIMEZONE=Asia/Bangkok` (UTC+7). The env var is
 * pinned before each test via `process.env` so no DB / app context is
 * needed — the function is pure.
 *
 * UTC ↔ Asia/Bangkok conversions used in this file:
 *   hh:mm local − 7h = UTC
 *   09:00 local = 02:00 UTC   (540 min local)
 *   11:00 local = 04:00 UTC   (660 min local)
 *   14:00 local = 07:00 UTC   (840 min local)
 *   16:00 local = 09:00 UTC   (960 min local)
 *   23:30 local = 16:30 UTC   (1410 min local)
 *   00:00 local (next day) = 17:00 UTC same calendar day
 *   23:00 local = 16:00 UTC
 *   01:00 local (next day) = 18:00 UTC same calendar day
 */
import '../../dayjs';

import { isSlotWithinBookingWindows } from './clinic';

// Pin timezone so tests are hermetic regardless of the server's TZ.
beforeAll(() => {
  process.env['CLINIC_TIMEZONE'] = 'Asia/Bangkok';
});

afterAll(() => {
  delete process.env['CLINIC_TIMEZONE'];
});

/**
 * Build a UTC Date from local Asia/Bangkok wall-clock time by subtracting
 * 7 hours. Accepts an ISO-style string `"YYYY-MM-DDThh:mm"` in local time.
 * Overflow into the next calendar day is handled by the Date constructor.
 */
function bkk(localIso: string): Date {
  const [datePart, timePart] = localIso.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  // Subtract 7 hours to convert Bangkok local → UTC.
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

describe('isSlotWithinBookingWindows — E21 test matrix', () => {
  /**
   * Matrix row 1: No windows (empty) → unrestricted (any slot included).
   */
  it('row 1: empty windows → unrestricted (any in-schedule slot included)', () => {
    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T09:30'), // 09:30 local
      bkk('2099-06-15T10:00'), // 10:00 local
      [],
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 2: [09:00,11:00), slot 10:30–11:00 → included (ends == 11:00).
   * endMin = 660, window.endMinute = 660 → 660 <= 660 → included.
   */
  it('row 2: [09:00,11:00), 10:30–11:00 → included (endMin == endMinute)', () => {
    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T10:30'), // startMin = 630
      bkk('2099-06-15T11:00'), // endMin   = 660
      [{ startMinute: 540, endMinute: 660 }],
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 3: [09:00,11:00), slot 11:00–11:30 → excluded (starts == end).
   * startMin = 660 >= 540 but endMin = 690 > 660 → excluded.
   */
  it('row 3: [09:00,11:00), 11:00–11:30 → excluded (startMin == window end)', () => {
    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T11:00'), // startMin = 660
      bkk('2099-06-15T11:30'), // endMin   = 690
      [{ startMinute: 540, endMinute: 660 }],
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 4: [09:00,11:00), slot 10:45–11:15 → excluded (straddles end).
   * startMin = 645 >= 540, but endMin = 675 > 660 → excluded.
   */
  it('row 4: [09:00,11:00), 10:45–11:15 → excluded (straddles window end)', () => {
    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T10:45'), // startMin = 645
      bkk('2099-06-15T11:15'), // endMin   = 675
      [{ startMinute: 540, endMinute: 660 }],
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 5: [09:00,11:00) ∪ [14:00,16:00), slot 09:30–10:00 →
   * included (fits range 1).
   */
  it('row 5: [09:00,11:00)∪[14:00,16:00), 09:30–10:00 → included (range 1)', () => {
    const windows = [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ];

    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T09:30'), // startMin = 570
      bkk('2099-06-15T10:00'), // endMin   = 600
      windows,
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 6: [09:00,11:00) ∪ [14:00,16:00), slot 14:00–14:30 →
   * included (fits range 2).
   */
  it('row 6: [09:00,11:00)∪[14:00,16:00), 14:00–14:30 → included (range 2)', () => {
    const windows = [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ];

    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T14:00'), // startMin = 840
      bkk('2099-06-15T14:30'), // endMin   = 870
      windows,
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 7: [09:00,11:00) ∪ [14:00,16:00), slot 11:30–12:00 →
   * excluded (midday gap).
   */
  it('row 7: [09:00,11:00)∪[14:00,16:00), 11:30–12:00 → excluded (midday gap)', () => {
    const windows = [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ];

    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T11:30'), // startMin = 690
      bkk('2099-06-15T12:00'), // endMin   = 720
      windows,
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 8: [09:00,11:00) ∪ [14:00,16:00), slot 13:30–14:00 →
   * excluded (starts before range 2, ends == range 2 start).
   * startMin = 810 < 840 → doesn't fit range 2.
   */
  it('row 8: [09:00,11:00)∪[14:00,16:00), 13:30–14:00 → excluded (gap, ends ==14:00)', () => {
    const windows = [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ];

    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T13:30'), // startMin = 810
      bkk('2099-06-15T14:00'), // endMin   = 840
      windows,
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 9: [09:00,11:00) ∪ [14:00,16:00), slot 15:30–16:00 →
   * included (ends == 16:00 = range 2 end).
   */
  it('row 9: [09:00,11:00)∪[14:00,16:00), 15:30–16:00 → included (endMin == range 2 end)', () => {
    const windows = [
      { startMinute: 540, endMinute: 660 },
      { startMinute: 840, endMinute: 960 },
    ];

    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T15:30'), // startMin = 930
      bkk('2099-06-15T16:00'), // endMin   = 960
      windows,
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 10: [00:00,660) ∪ [900,1440), slot 23:30–00:00 →
   * INCLUDED (after-15 range; endMin = 1440 via day-rollover).
   *
   * The schedule is 16:00–00:00 local (09:00–17:00 UTC).
   * 23:30 local = 16:30 UTC; 00:00 local (next day) = 17:00 UTC.
   *
   * Day-rollover-aware endMin: rawEndMin = 0 (midnight wraps to 0),
   * dayDiff = 1 (local end is in the next calendar day), endMin = 0 + 1440 = 1440.
   * Range [900,1440): 1410 >= 900 && 1440 <= 1440 → INCLUDED.
   */
  it('row 10: [00:00,660)∪[900,1440), 23:30–00:00 → INCLUDED (after-15 range; endMin=1440)', () => {
    const windows = [
      { startMinute: 0, endMinute: 660 },
      { startMinute: 900, endMinute: 1440 },
    ];

    // 16:30 UTC = 23:30 Asia/Bangkok; 17:00 UTC = 00:00 Asia/Bangkok (next day).
    const result = isSlotWithinBookingWindows(
      new Date('2099-06-15T16:30:00Z'), // 23:30 local
      new Date('2099-06-15T17:00:00Z'), // 00:00 local (next day)
      windows,
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 11: [00:00,660) (before-11 only), slot 23:30–00:00 →
   * EXCLUDED ← the F13 midnight-wrap regression.
   *
   * A naive `minuteOfDay(slotEnd)` returns 0, which passes "0 <= 660" →
   * the slot would INCORRECTLY be included. The day-rollover-aware predicate
   * computes endMin = 0 + 1440 = 1440, which fails "1440 <= 660" → EXCLUDED.
   */
  it('row 11: [00:00,660), 23:30–00:00 → EXCLUDED ← F13 midnight-wrap regression', () => {
    const windows = [{ startMinute: 0, endMinute: 660 }];

    // 16:30 UTC = 23:30 Asia/Bangkok; 17:00 UTC = 00:00 Asia/Bangkok (next day).
    const result = isSlotWithinBookingWindows(
      new Date('2099-06-15T16:30:00Z'), // 23:30 local
      new Date('2099-06-15T17:00:00Z'), // 00:00 local (next day)
      windows,
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 12: [00:00,660), 16:00–00:00 schedule → all slots excluded.
   * Every slot in the schedule starts at or after 16:00 local (960 min),
   * which is >= 660 → startMin >= endMinute → no range matches.
   *
   * We test the first and last slot of the schedule.
   */
  it('row 12: [00:00,660), 16:00–16:30 (first slot of schedule) → excluded', () => {
    const result = isSlotWithinBookingWindows(
      new Date('2099-06-15T09:00:00Z'), // 16:00 local, startMin = 960
      new Date('2099-06-15T09:30:00Z'), // 16:30 local, endMin   = 990
      [{ startMinute: 0, endMinute: 660 }],
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 13: [900,1440) (after-15), schedule 23:00–01:00 (crosses midnight),
   * slot 23:30–00:00 → INCLUDED (endMin = 1440).
   *
   * startMin = 1410 (23:30 local) >= 900.
   * endMin = 0 + 1*1440 = 1440 <= 1440 → INCLUDED.
   */
  it('row 13: [900,1440), 23:30–00:00 (crossing midnight) → INCLUDED (endMin=1440)', () => {
    // 16:30 UTC = 23:30 Asia/Bangkok; 17:00 UTC = 00:00 Asia/Bangkok (next day).
    const result = isSlotWithinBookingWindows(
      new Date('2099-06-15T16:30:00Z'), // 23:30 local
      new Date('2099-06-15T17:00:00Z'), // 00:00 local (next day)
      [{ startMinute: 900, endMinute: 1440 }],
    );

    expect(result).toBe(true);
  });

  /**
   * Matrix row 14: [900,1440) (after-15), slot 00:00–00:30 next local day →
   * EXCLUDED (startMin = 0 < 900).
   *
   * A slot at local 00:00 the next day has startMin = 0, which fails
   * the "0 >= 900" condition → excluded (this is "tomorrow morning", not
   * "after 15:00 today").
   */
  it('row 14: [900,1440), 00:00–00:30 next local day → EXCLUDED (startMin=0 < 900)', () => {
    // 17:00 UTC = 00:00 Asia/Bangkok (next day); 17:30 UTC = 00:30 local.
    const result = isSlotWithinBookingWindows(
      new Date('2099-06-15T17:00:00Z'), // 00:00 local (+1 day), startMin = 0
      new Date('2099-06-15T17:30:00Z'), // 00:30 local (+1 day), endMin   = 30
      [{ startMinute: 900, endMinute: 1440 }],
    );

    expect(result).toBe(false);
  });

  /**
   * Matrix row 17: range with end=1440 and start=0 → accepted (boundary values).
   */
  it('row 17: range [0,1440) → accepts any slot within the same local day', () => {
    // A slot spanning the full day should be accepted.
    const result = isSlotWithinBookingWindows(
      bkk('2099-06-15T09:00'), // startMin = 540
      bkk('2099-06-15T10:00'), // endMin   = 600
      [{ startMinute: 0, endMinute: 1440 }],
    );

    expect(result).toBe(true);
  });
});

describe('isSlotWithinBookingWindows — boundary and edge cases', () => {
  it('returns true for empty windows regardless of slot times', () => {
    expect(
      isSlotWithinBookingWindows(
        bkk('2099-06-15T00:00'),
        bkk('2099-06-15T23:59'),
        [],
      ),
    ).toBe(true);
  });

  it('slot fitting exactly within a range is included (both bounds tight)', () => {
    // [09:00, 10:00): slot 09:00–10:00. startMin=540, endMin=600.
    // 540 >= 540 && 600 <= 600 → included.
    expect(
      isSlotWithinBookingWindows(
        bkk('2099-06-15T09:00'),
        bkk('2099-06-15T10:00'),
        [{ startMinute: 540, endMinute: 600 }],
      ),
    ).toBe(true);
  });

  it('a slot that spans exactly the wrong range is excluded', () => {
    // [14:00, 16:00): slot 13:00–14:00. endMin = 840 = range start.
    // startMin = 780 < 840 → excluded from range 2.
    expect(
      isSlotWithinBookingWindows(
        bkk('2099-06-15T13:00'), // startMin = 780
        bkk('2099-06-15T14:00'), // endMin   = 840
        [{ startMinute: 840, endMinute: 960 }],
      ),
    ).toBe(false);
  });

  it('multi-range: slot fits the second range but not the first', () => {
    const windows = [
      { startMinute: 0, endMinute: 300 }, // before 05:00
      { startMinute: 900, endMinute: 1440 }, // after 15:00
    ];

    expect(
      isSlotWithinBookingWindows(
        bkk('2099-06-15T16:00'), // startMin = 960
        bkk('2099-06-15T16:30'), // endMin   = 990
        windows,
      ),
    ).toBe(true);
  });
});
