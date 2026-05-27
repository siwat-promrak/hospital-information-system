import { Test } from '@nestjs/testing';
import { AppointmentStatus, AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ROLE } from '../auth/roles';
import { SCOPE } from '../auth/scope';
import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/users.types';

import {
  SlotsService,
  computeFreeIntervals,
  computeSchedulesSlots,
  overlapsHalfOpen,
  resolveDayBounds,
} from './slots.service';

const dt = (iso: string): Date => new Date(iso);

describe('resolveDayBounds', () => {
  it('returns [startOfDayUtc, startOfNextDayUtc)', () => {
    const { dayStart, dayEnd } = resolveDayBounds('2026-06-15');

    expect(dayStart.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(dayEnd.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });

  it('rolls month boundary correctly', () => {
    const { dayStart, dayEnd } = resolveDayBounds('2026-06-30');

    expect(dayStart.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(dayEnd.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rolls leap-Feb correctly', () => {
    const { dayStart, dayEnd } = resolveDayBounds('2028-02-29');

    expect(dayStart.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(dayEnd.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });
});

describe('overlapsHalfOpen', () => {
  it('returns false for back-to-back windows', () => {
    expect(
      overlapsHalfOpen(
        { startAt: dt('2026-06-15T09:00:00Z'), endAt: dt('2026-06-15T10:00:00Z') },
        { startAt: dt('2026-06-15T10:00:00Z'), endAt: dt('2026-06-15T11:00:00Z') },
      ),
    ).toBe(false);
  });

  it('returns true for partial overlap', () => {
    expect(
      overlapsHalfOpen(
        { startAt: dt('2026-06-15T09:00:00Z'), endAt: dt('2026-06-15T10:00:00Z') },
        { startAt: dt('2026-06-15T09:30:00Z'), endAt: dt('2026-06-15T11:00:00Z') },
      ),
    ).toBe(true);
  });

  it('returns false for disjoint windows', () => {
    expect(
      overlapsHalfOpen(
        { startAt: dt('2026-06-15T09:00:00Z'), endAt: dt('2026-06-15T10:00:00Z') },
        { startAt: dt('2026-06-15T11:00:00Z'), endAt: dt('2026-06-15T12:00:00Z') },
      ),
    ).toBe(false);
  });
});

describe('computeSchedulesSlots', () => {
  // Pick a far-future date so the "past slot" cut-off never accidentally
  // strips a slot just because the test machine's clock drifted.
  const FAR_FUTURE_NOW = dt('2026-05-25T00:00:00.000Z');
  const SCHEDULE_DEPT_ID = 'dept-abc';
  const SCHEDULE_ID = 'sched-abc';
  // F15 — every ScheduleWindow now carries the owning doctor's identity
  // triplet so the pure grid step can echo it onto each emitted slot
  // without a Prisma round-trip.
  const DOCTOR_REF = {
    id: 'doctor-abc',
    doctorCode: 'MD-0001',
    name: 'Jane Doe',
  } as const;

  describe('grid step matches duration', () => {
    it('produces 09:00-09:20, 09:20-09:40, ... for CONSULTATION (20 min)', () => {
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [],
        now: FAR_FUTURE_NOW,
      });

      expect(slots).toEqual([
        {
          startAt: '2026-06-15T09:00:00.000Z',
          endAt: '2026-06-15T09:20:00.000Z',
          departmentId: SCHEDULE_DEPT_ID,
          scheduleId: SCHEDULE_ID,
          doctorId: DOCTOR_REF.id,
          doctorCode: DOCTOR_REF.doctorCode,
          doctorName: DOCTOR_REF.name,
        },
        {
          startAt: '2026-06-15T09:20:00.000Z',
          endAt: '2026-06-15T09:40:00.000Z',
          departmentId: SCHEDULE_DEPT_ID,
          scheduleId: SCHEDULE_ID,
          doctorId: DOCTOR_REF.id,
          doctorCode: DOCTOR_REF.doctorCode,
          doctorName: DOCTOR_REF.name,
        },
        {
          startAt: '2026-06-15T09:40:00.000Z',
          endAt: '2026-06-15T10:00:00.000Z',
          departmentId: SCHEDULE_DEPT_ID,
          scheduleId: SCHEDULE_ID,
          doctorId: DOCTOR_REF.id,
          doctorCode: DOCTOR_REF.doctorCode,
          doctorName: DOCTOR_REF.name,
        },
      ]);
    });

    it('produces a single 60-min slot for PROCEDURE inside a 60-min window', () => {
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [],
        blockingAppointments: [],
        now: FAR_FUTURE_NOW,
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].startAt).toBe('2026-06-15T09:00:00.000Z');
      expect(slots[0].endAt).toBe('2026-06-15T10:00:00.000Z');
    });

    it('truncates trailing partial slot when the window is not a multiple of duration', () => {
      // 09:00–10:00 with 25-min step → 09:00, 09:25; the next slot would end
      // at 10:15, past the window, so it is dropped.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 25,
        bookingWindows: [],
        blockingAppointments: [],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:00:00.000Z',
        '2026-06-15T09:25:00.000Z',
      ]);
    });
  });

  describe('break window exclusion', () => {
    it('excludes every slot whose [startAt, endAt) overlaps the break', () => {
      // Window 09:00–12:00, break 10:00–11:00, 20-min step.
      // 09:00–09:20 keep. 09:20–09:40 keep. 09:40–10:00 keep (back-to-back is NOT overlap).
      // 10:00–10:20, 10:20–10:40, 10:40–11:00 → all overlap break → drop.
      // 11:00–11:20 keep. 11:20–11:40 keep. 11:40–12:00 keep.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T12:00:00Z'),
          breakStartAt: dt('2026-06-15T10:00:00Z'),
          breakEndAt: dt('2026-06-15T11:00:00Z'),
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:00:00.000Z',
        '2026-06-15T09:20:00.000Z',
        '2026-06-15T09:40:00.000Z',
        '2026-06-15T11:00:00.000Z',
        '2026-06-15T11:20:00.000Z',
        '2026-06-15T11:40:00.000Z',
      ]);
    });
  });

  describe('past-slot exclusion', () => {
    it('excludes slots whose startAt <= now', () => {
      // Window 09:00–11:00. "Now" snapped to 09:30 → drop 09:00 and 09:20
      // (9:20 startAt 9:20 vs now 9:30 → past). Keep 09:40 onward.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T11:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [],
        now: dt('2026-06-15T09:30:00Z'),
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:40:00.000Z',
        '2026-06-15T10:00:00.000Z',
        '2026-06-15T10:20:00.000Z',
        '2026-06-15T10:40:00.000Z',
      ]);
    });

    it('excludes a slot whose startAt equals now (boundary)', () => {
      // 09:00 startAt with now also 09:00 → strict > check drops the slot.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [],
        now: dt('2026-06-15T09:00:00Z'),
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:20:00.000Z',
        '2026-06-15T09:40:00.000Z',
      ]);
    });

    it('returns [] when every slot is in the past', () => {
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-05-01T09:00:00Z'),
          endAt: dt('2026-05-01T12:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [],
        now: dt('2026-06-15T00:00:00Z'),
      });

      expect(slots).toEqual([]);
    });
  });

  describe('sliding-window re-anchor (gap reclamation)', () => {
    it("re-anchors after a non-grid-aligned blocker — 15-min booking at 09:00 surfaces a 60-min slot at 09:15", () => {
      // The motivating case: schedule 09:00–12:00, an existing 15-min
      // booking of a different type occupies 09:00–09:15, and the caller
      // searches for a 60-min slot. The previous fixed-grid algorithm
      // anchored at the schedule start (09:00 / 10:00 / 11:00), dropping
      // 09:00–10:00 because it overlapped the 09:15 blocker — leaving the
      // 09:15–10:15 capacity unreclaimed. The sliding-window algorithm
      // re-anchors at the free interval's start (09:15), so 09:15–10:15
      // AND 10:15–11:15 both surface (11:15–12:15 would spill past
      // schedule end, so it's dropped).
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T12:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [],
        blockingAppointments: [
          {
            startAt: dt('2026-06-15T09:00:00Z'),
            endAt: dt('2026-06-15T09:15:00Z'),
          },
        ],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:15:00.000Z',
        '2026-06-15T10:15:00.000Z',
      ]);
    });

    it('re-anchors after each blocker independently (two non-aligned blockers fragment the day)', () => {
      // Schedule 09:00–13:00, 60-min type. Blockers 09:00–09:15 (15 min)
      // and 11:30–11:45 (15 min) leave two free intervals:
      //   [09:15, 11:30) → 09:15–10:15, 10:15–11:15 (11:15–12:15 spills
      //                    past 11:30, drop)
      //   [11:45, 13:00) → 11:45–12:45 (12:45–13:45 spills past 13:00,
      //                    drop)
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T13:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [],
        blockingAppointments: [
          {
            startAt: dt('2026-06-15T09:00:00Z'),
            endAt: dt('2026-06-15T09:15:00Z'),
          },
          {
            startAt: dt('2026-06-15T11:30:00Z'),
            endAt: dt('2026-06-15T11:45:00Z'),
          },
        ],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:15:00.000Z',
        '2026-06-15T10:15:00.000Z',
        '2026-06-15T11:45:00.000Z',
      ]);
    });

    it('re-anchors at the post-break boundary when the break is not grid-aligned', () => {
      // Schedule 09:00–13:00, 60-min type, break 11:30–12:00 (off-grid).
      // Free intervals: [09:00, 11:30), [12:00, 13:00).
      //   [09:00, 11:30) → 09:00–10:00, 10:00–11:00 (11:00–12:00 spills
      //                    past 11:30, drop)
      //   [12:00, 13:00) → 12:00–13:00 (fits exactly).
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T13:00:00Z'),
          breakStartAt: dt('2026-06-15T11:30:00Z'),
          breakEndAt: dt('2026-06-15T12:00:00Z'),
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [],
        blockingAppointments: [],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:00:00.000Z',
        '2026-06-15T10:00:00.000Z',
        '2026-06-15T12:00:00.000Z',
      ]);
    });
  });

  describe('appointment exclusion', () => {
    it('excludes a slot overlapping a BOOKED appointment', () => {
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:00:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [
          {
            startAt: dt('2026-06-15T09:20:00Z'),
            endAt: dt('2026-06-15T09:40:00Z'),
          },
        ],
        now: FAR_FUTURE_NOW,
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2026-06-15T09:00:00.000Z',
        '2026-06-15T09:40:00.000Z',
      ]);
    });

    it('keeps a slot back-to-back with an appointment (half-open)', () => {
      // Appointment 09:20–09:40. Slot 09:40–10:00 does NOT overlap (touch only).
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2026-06-15T09:40:00Z'),
          endAt: dt('2026-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 20,
        bookingWindows: [],
        blockingAppointments: [
          {
            startAt: dt('2026-06-15T09:20:00Z'),
            endAt: dt('2026-06-15T09:40:00Z'),
          },
        ],
        now: FAR_FUTURE_NOW,
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].startAt).toBe('2026-06-15T09:40:00.000Z');
    });
  });

  it('returns empty array for an empty (zero-length) window', () => {
    const slots = computeSchedulesSlots({
      schedule: {
        id: SCHEDULE_ID,
        departmentId: SCHEDULE_DEPT_ID,
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T09:00:00Z'),
        breakStartAt: null,
        breakEndAt: null,
        doctor: DOCTOR_REF,
      },
      durationMinutes: 20,
      bookingWindows: [],
      blockingAppointments: [],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });

  it('echoes departmentId on every produced slot', () => {
    const slots = computeSchedulesSlots({
      schedule: {
        id: SCHEDULE_ID,
        departmentId: 'specific-dept-id',
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T10:00:00Z'),
        breakStartAt: null,
        breakEndAt: null,
        doctor: DOCTOR_REF,
      },
      durationMinutes: 20,
      bookingWindows: [],
      blockingAppointments: [],
      now: FAR_FUTURE_NOW,
    });

    for (const slot of slots) {
      expect(slot.departmentId).toBe('specific-dept-id');
    }
  });

  it('echoes scheduleId on every produced slot', () => {
    const slots = computeSchedulesSlots({
      schedule: {
        id: 'specific-schedule-id',
        departmentId: SCHEDULE_DEPT_ID,
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T10:00:00Z'),
        breakStartAt: null,
        breakEndAt: null,
        doctor: DOCTOR_REF,
      },
      durationMinutes: 20,
      bookingWindows: [],
      blockingAppointments: [],
      now: FAR_FUTURE_NOW,
    });

    for (const slot of slots) {
      expect(slot.scheduleId).toBe('specific-schedule-id');
    }
  });

  describe('booking-window filter (F13)', () => {
    // The test runs in Asia/Bangkok (UTC+7, no DST). The fixtures use a
    // schedule that spans 02:00–05:00 UTC = 09:00–12:00 local so the
    // local minute-of-day math is intuitive (09:00 local = 540 min,
    // 11:00 local = 660 min).
    const ORIGINAL_TZ = process.env.CLINIC_TIMEZONE;

    beforeAll(() => {
      process.env.CLINIC_TIMEZONE = 'Asia/Bangkok';
    });

    afterAll(() => {
      if (ORIGINAL_TZ === undefined) {
        delete process.env.CLINIC_TIMEZONE;
      } else {
        process.env.CLINIC_TIMEZONE = ORIGINAL_TZ;
      }
    });

    it('keeps in-window slots AND drops out-of-window slots (end bound = 11:00 local)', () => {
      // 09:00–12:00 local with a 60-min step → slots at 09:00, 10:00,
      // 11:00 local. End bound = 660 min (= "before 11:00 local") drops
      // the 11:00 slot but keeps 09:00 + 10:00.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          // 02:00 UTC = 09:00 Asia/Bangkok.
          startAt: dt('2099-06-15T02:00:00Z'),
          endAt: dt('2099-06-15T05:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [{ startMinute: 0, endMinute: 660 }],
        blockingAppointments: [],
        now: dt('2099-01-01T00:00:00Z'),
      });

      // 09:00 local = 02:00 UTC, 10:00 local = 03:00 UTC. 11:00 local
      // (= 04:00 UTC) is dropped because startMin >= 660 → outside window [0,660).
      expect(slots.map((s) => s.startAt)).toEqual([
        '2099-06-15T02:00:00.000Z',
        '2099-06-15T03:00:00.000Z',
      ]);
    });

    it('drops a single out-of-window slot when the start bound is set', () => {
      // Start bound = 600 min (= "from 10:00 local"). Schedule
      // 09:00–12:00 local with 60-min step → drop 09:00, keep 10:00 + 11:00.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2099-06-15T02:00:00Z'),
          endAt: dt('2099-06-15T05:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [{ startMinute: 600, endMinute: 1440 }],
        blockingAppointments: [],
        now: dt('2099-01-01T00:00:00Z'),
      });

      expect(slots.map((s) => s.startAt)).toEqual([
        '2099-06-15T03:00:00.000Z',
        '2099-06-15T04:00:00.000Z',
      ]);
    });

    it('drops a slot whose START fits the window but whose END spills past windowEnd', () => {
      // Bug scenario: schedule 09:00–17:00 local with prior bookings at
      // 09:30–10:00, 10:00–10:20, 10:20–10:40 leaves free intervals
      // [09:00, 09:30) and [10:40, 17:00). Booking window end = 660
      // (= 11:00 local). For a 30-min type:
      //   [09:00, 09:30): 09:00–09:30 (slotEndMin = 570 ≤ 660 → kept)
      //   [10:40, 17:00): 10:40–11:10 (slotEndMin = 670 > 660 → DROPPED)
      //   The previous "start-only" check incorrectly kept 10:40–11:10.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          // 02:00 UTC = 09:00 Asia/Bangkok.
          startAt: dt('2099-06-15T02:00:00Z'),
          endAt: dt('2099-06-15T10:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 30,
        bookingWindows: [{ startMinute: 0, endMinute: 660 }],
        blockingAppointments: [
          {
            startAt: dt('2099-06-15T02:30:00Z'),
            endAt: dt('2099-06-15T03:00:00Z'),
          },
          {
            startAt: dt('2099-06-15T03:00:00Z'),
            endAt: dt('2099-06-15T03:20:00Z'),
          },
          {
            startAt: dt('2099-06-15T03:20:00Z'),
            endAt: dt('2099-06-15T03:40:00Z'),
          },
        ],
        now: dt('2099-01-01T00:00:00Z'),
      });

      // Expect ONLY 09:00–09:30 local (02:00–02:30 UTC). 10:40 local
      // would spill to 11:10 local, past the 11:00 window end.
      expect(slots.map((s) => s.startAt)).toEqual([
        '2099-06-15T02:00:00.000Z',
      ]);
    });

    it('keeps the inclusive lower bound + drops the exclusive upper bound', () => {
      // Boundary semantics: start is INCLUSIVE (`localMin >= start`),
      // end is EXCLUSIVE (`localMin < end`). 09:00 local must be kept
      // when start = 540; 12:00 local must be dropped when end = 720.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          startAt: dt('2099-06-15T02:00:00Z'), // 09:00 local
          endAt: dt('2099-06-15T05:00:00Z'),   // 12:00 local
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [{ startMinute: 540, endMinute: 720 }],
        blockingAppointments: [],
        now: dt('2099-01-01T00:00:00Z'),
      });

      // 09:00 (540) kept; 10:00, 11:00 kept; 12:00 (720) would be a slot
      // start but the schedule ends at 12:00 local so it's never emitted
      // by the grid loop. Keep all three emitted slots.
      expect(slots.map((s) => s.startAt)).toEqual([
        '2099-06-15T02:00:00.000Z',
        '2099-06-15T03:00:00.000Z',
        '2099-06-15T04:00:00.000Z',
      ]);
    });

    it('matrix row 11 / midnight-wrap regression (PR #28 adapted): 16:00–00:00 local schedule returns NO slots for before-11 window [0,660)', () => {
      // Matrix row 11: Ranges=[0,660) (before 11 only), Schedule=16:00–00:00
      // local → all candidate slots are after 11:00 → zero slots.
      //
      // Also the original F13 midnight-wrap regression (PR #28): the last
      // slot is 23:30–00:00 local (16:30–17:00 UTC). A naive `minuteOfDay`
      // impl returns slotEnd = 0 (midnight), which passes "0 <= 660" —
      // incorrectly keeping the slot. The F21 day-rollover-aware predicate
      // computes endMin = 0 + 1*1440 = 1440, which fails "1440 <= 660" →
      // slot correctly excluded.
      //
      // Asia/Bangkok is UTC+7:
      //   16:00 local = 09:00 UTC
      //   00:00 local (next day) = 17:00 UTC same calendar day
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          // 09:00 UTC = 16:00 Asia/Bangkok; 17:00 UTC = 00:00 Asia/Bangkok.
          startAt: dt('2099-06-15T09:00:00Z'),
          endAt: dt('2099-06-15T17:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 30,
        bookingWindows: [{ startMinute: 0, endMinute: 660 }], // before 11:00
        blockingAppointments: [],
        now: dt('2099-01-01T00:00:00Z'),
      });

      expect(slots).toEqual([]);
    });

    it('midnight-wrap positive (PR #28 adapted): pre-window slot in an early schedule is still returned', () => {
      // Positive case adapted from PR #28 regression test. A schedule
      // 08:00–11:00 local with window [0,660) should return three 60-min
      // slots: 08:00, 09:00, 10:00 local. The 10:00–11:00 slot has
      // endMin = 660, which satisfies "endMin <= 660" → kept.
      //
      // 08:00 local = 01:00 UTC; 11:00 local = 04:00 UTC.
      const slots = computeSchedulesSlots({
        schedule: {
          id: SCHEDULE_ID,
          departmentId: SCHEDULE_DEPT_ID,
          // 01:00 UTC = 08:00 Asia/Bangkok; 04:00 UTC = 11:00 Asia/Bangkok.
          startAt: dt('2099-06-15T01:00:00Z'),
          endAt: dt('2099-06-15T04:00:00Z'),
          breakStartAt: null,
          breakEndAt: null,
          doctor: DOCTOR_REF,
        },
        durationMinutes: 60,
        bookingWindows: [{ startMinute: 0, endMinute: 660 }], // before 11:00
        blockingAppointments: [],
        now: dt('2099-01-01T00:00:00Z'),
      });

      // 08:00 local (480 min) → end 09:00 (540 min): 480 >= 0 && 540 <= 660 → kept.
      // 09:00 local (540 min) → end 10:00 (600 min): 540 >= 0 && 600 <= 660 → kept.
      // 10:00 local (600 min) → end 11:00 (660 min): 600 >= 0 && 660 <= 660 → kept.
      expect(slots.map((s) => s.startAt)).toEqual([
        '2099-06-15T01:00:00.000Z', // 08:00 local
        '2099-06-15T02:00:00.000Z', // 09:00 local
        '2099-06-15T03:00:00.000Z', // 10:00 local
      ]);
    });
  });

  it('matrix row 10: [00:00,660)∪[900,1440), 16:00–00:00 schedule, 23:30 slot → included (after-15 range)', () => {
    // Row 10 from the E21 matrix: the slot 23:30–00:00 local fits the
    // after-15 range [900,1440) because endMin = 1440 (day-rollover).
    // Asia/Bangkok: 16:30 UTC = 23:30 local; 17:00 UTC = 00:00 local (+1 day).
    const slots = computeSchedulesSlots({
      schedule: {
        id: SCHEDULE_ID,
        departmentId: SCHEDULE_DEPT_ID,
        startAt: dt('2099-06-15T09:00:00Z'), // 16:00 local
        endAt: dt('2099-06-15T17:00:00Z'),   // 00:00 local (+1 day)
        breakStartAt: null,
        breakEndAt: null,
        doctor: DOCTOR_REF,
      },
      durationMinutes: 30,
      bookingWindows: [
        { startMinute: 0, endMinute: 660 },   // before 11:00
        { startMinute: 900, endMinute: 1440 }, // after 15:00
      ],
      blockingAppointments: [],
      now: dt('2099-01-01T00:00:00Z'),
    });

    // All slots are at or after 16:00 local (startMin >= 960 >= 900), and the
    // last slot 23:30–00:00 has endMin = 1440 <= 1440 → all kept.
    const starts = slots.map((s) => s.startAt);

    // 23:30 local (16:30 UTC) → endMin = 1440 → included (after-15 range).
    expect(starts).toContain('2099-06-15T16:30:00.000Z');
    // An earlier in-range slot also fits — 16:00 local (09:00 UTC), startMin=960,
    // endMin=990, both inside [900,1440). Guards against the after-15 range
    // silently matching ONLY the midnight-crossing slot.
    expect(starts).toContain('2099-06-15T09:00:00.000Z');
  });

  it('matrix row 13: [900,1440) after-15, 23:00–01:00 schedule, 23:30 slot → included (endMin=1440)', () => {
    // Row 13: schedule spans midnight, slot 23:30–00:00 has endMin = 1440
    // which satisfies [900,1440): 1410 >= 900 && 1440 <= 1440 → included.
    // The next slot 00:00–00:30 has startMin = 0 < 900 → excluded (row 14).
    // Asia/Bangkok: 16:00 UTC = 23:00 local; 18:00 UTC = 01:00 local (+1 day).
    const slots = computeSchedulesSlots({
      schedule: {
        id: SCHEDULE_ID,
        departmentId: SCHEDULE_DEPT_ID,
        startAt: dt('2099-06-15T16:00:00Z'), // 23:00 local
        endAt: dt('2099-06-15T18:00:00Z'),   // 01:00 local (+1 day)
        breakStartAt: null,
        breakEndAt: null,
        doctor: DOCTOR_REF,
      },
      durationMinutes: 30,
      bookingWindows: [{ startMinute: 900, endMinute: 1440 }], // after 15:00
      blockingAppointments: [],
      now: dt('2099-01-01T00:00:00Z'),
    });

    const starts = slots.map((s) => s.startAt);

    // 23:30 local (16:30 UTC) → endMin = 1440 → included.
    expect(starts).toContain('2099-06-15T16:30:00.000Z');
    // 00:00 local (+1, 17:00 UTC) → startMin = 0 < 900 → excluded (row 14).
    expect(starts).not.toContain('2099-06-15T17:00:00.000Z');
  });
});

describe('computeFreeIntervals', () => {
  it('returns the full window when there are no blockers', () => {
    const out = computeFreeIntervals(
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T12:00:00Z'),
      },
      [],
    );

    expect(out).toEqual([
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T12:00:00Z'),
      },
    ]);
  });

  it('returns [] for a zero-length window', () => {
    const out = computeFreeIntervals(
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T09:00:00Z'),
      },
      [{ startAt: dt('2026-06-15T08:00:00Z'), endAt: dt('2026-06-15T10:00:00Z') }],
    );

    expect(out).toEqual([]);
  });

  it('clamps a blocker that pokes out the left edge of the window', () => {
    // Blocker 08:30–09:15 with window 09:00–10:00 → effective
    // blocker 09:00–09:15 → free interval [09:15, 10:00).
    const out = computeFreeIntervals(
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T10:00:00Z'),
      },
      [{ startAt: dt('2026-06-15T08:30:00Z'), endAt: dt('2026-06-15T09:15:00Z') }],
    );

    expect(out).toEqual([
      {
        startAt: dt('2026-06-15T09:15:00Z'),
        endAt: dt('2026-06-15T10:00:00Z'),
      },
    ]);
  });

  it('merges overlapping blockers without emitting zero-length intervals', () => {
    // Blockers 09:15–09:45 and 09:30–10:00 overlap → effective single
    // blocker 09:15–10:00 → free interval [09:00, 09:15) only (the
    // post-blocker tail is empty since 10:00 is the window end).
    const out = computeFreeIntervals(
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T10:00:00Z'),
      },
      [
        { startAt: dt('2026-06-15T09:15:00Z'), endAt: dt('2026-06-15T09:45:00Z') },
        { startAt: dt('2026-06-15T09:30:00Z'), endAt: dt('2026-06-15T10:00:00Z') },
      ],
    );

    expect(out).toEqual([
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T09:15:00Z'),
      },
    ]);
  });

  it('emits an interval between two non-touching blockers', () => {
    // Schedule 09:00–12:00, blockers 09:30–09:45 and 11:00–11:15 →
    // free intervals [09:00, 09:30), [09:45, 11:00), [11:15, 12:00).
    const out = computeFreeIntervals(
      {
        startAt: dt('2026-06-15T09:00:00Z'),
        endAt: dt('2026-06-15T12:00:00Z'),
      },
      [
        { startAt: dt('2026-06-15T09:30:00Z'), endAt: dt('2026-06-15T09:45:00Z') },
        { startAt: dt('2026-06-15T11:00:00Z'), endAt: dt('2026-06-15T11:15:00Z') },
      ],
    );

    expect(out).toEqual([
      { startAt: dt('2026-06-15T09:00:00Z'), endAt: dt('2026-06-15T09:30:00Z') },
      { startAt: dt('2026-06-15T09:45:00Z'), endAt: dt('2026-06-15T11:00:00Z') },
      { startAt: dt('2026-06-15T11:15:00Z'), endAt: dt('2026-06-15T12:00:00Z') },
    ]);
  });
});

describe('localMinuteOfDay (F13)', () => {
  const ORIGINAL_TZ = process.env.CLINIC_TIMEZONE;

  beforeAll(() => {
    process.env.CLINIC_TIMEZONE = 'Asia/Bangkok';
  });

  afterAll(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.CLINIC_TIMEZONE;
    } else {
      process.env.CLINIC_TIMEZONE = ORIGINAL_TZ;
    }
  });

  it('returns 540 for 02:00 UTC = 09:00 Asia/Bangkok', async () => {
    const { localMinuteOfDay } = await import('../common/clinic/clinic');

    expect(localMinuteOfDay('2099-06-15T02:00:00.000Z')).toBe(540);
  });

  it('returns 660 for 04:00 UTC = 11:00 Asia/Bangkok', async () => {
    const { localMinuteOfDay } = await import('../common/clinic/clinic');

    expect(localMinuteOfDay('2099-06-15T04:00:00.000Z')).toBe(660);
  });

  it('rolls correctly across the UTC date boundary (23:00 local = 16:00 UTC)', async () => {
    const { localMinuteOfDay } = await import('../common/clinic/clinic');

    // 16:00 UTC on day N = 23:00 Asia/Bangkok the same day. 23 * 60 = 1380.
    expect(localMinuteOfDay('2099-06-15T16:00:00.000Z')).toBe(1380);
  });
});

describe('SlotsService.findSlots — full pipeline (mocked Prisma)', () => {
  interface PrismaMock {
    doctor: { findFirst: jest.Mock };
    departmentAppointmentType: { findFirst: jest.Mock };
    doctorSchedule: { findMany: jest.Mock };
    appointment: { findMany: jest.Mock };
  }

  const FAR_FUTURE_DATE = '2026-05-25';
  const DOCTOR_ID = '4f3e2a10-1234-5678-9abc-deadbeef1234';
  const DOCTOR_CODE = 'MD-0001';
  const DOCTOR_FIRST_NAME = 'Jane';
  const DOCTOR_LAST_NAME = 'Doe';
  const DOCTOR_DISPLAY_NAME = `${DOCTOR_FIRST_NAME} ${DOCTOR_LAST_NAME}`;
  const DEPARTMENT_ID = 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9';

  // F15 — every mocked `doctorSchedule.findMany` row carries the doctor
  // include shape (`doctorId` + nested `doctor: { doctorCode, user }`).
  // Centralising the literal here keeps the mocks readable.
  function scheduleRow(overrides: {
    id: string;
    startAt: Date;
    endAt: Date;
    breakStartAt?: Date | null;
    breakEndAt?: Date | null;
    doctorId?: string;
    doctorCode?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    departmentId?: string;
  }): Record<string, unknown> {
    return {
      id: overrides.id,
      doctorId: overrides.doctorId ?? DOCTOR_ID,
      departmentId: overrides.departmentId ?? DEPARTMENT_ID,
      startAt: overrides.startAt,
      endAt: overrides.endAt,
      breakStartAt: overrides.breakStartAt ?? null,
      breakEndAt: overrides.breakEndAt ?? null,
      doctor: {
        doctorCode: overrides.doctorCode ?? DOCTOR_CODE,
        user: {
          firstNameEn: overrides.firstNameEn ?? DOCTOR_FIRST_NAME,
          lastNameEn: overrides.lastNameEn ?? DOCTOR_LAST_NAME,
        },
      },
    };
  }

  const NURSE_CALLER: AuthenticatedUser = {
    id: 'user-nurse',
    email: 'nurse@example.com',
    roleId: 'role-nurse',
    roleCode: ROLE.NURSE,
    firstNameEn: 'Nurse',
    lastNameEn: 'Test',
    firstNameTh: null,
    lastNameTh: null,
    picture: null,
    departmentId: DEPARTMENT_ID,
    permissionCodes: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
    doctor: null,
  };

  function buildPrisma(overrides: Partial<PrismaMock> = {}): PrismaMock {
    return {
      doctor: {
        findFirst: jest.fn().mockResolvedValue({ id: DOCTOR_ID }),
      },
      departmentAppointmentType: {
        // Default mock — 20-min CONSULTATION duration with no booking
        // windows (unrestricted). Tests that need a different duration
        // or windows override the whole mock.
        findFirst: jest.fn().mockResolvedValue({
          durationMinutes: 20,
          windows: [],
        }),
      },
      doctorSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  async function buildService(prisma: PrismaMock): Promise<SlotsService> {
    const module = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    return module.get(SlotsService);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    // Anchor "now" well before the test schedule's start so slot
    // exclusion never accidentally drops valid grid steps.
    jest.setSystemTime(new Date('2099-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws 404 NOT_FOUND when the doctor does not exist', async () => {
    const prisma = buildPrisma({
      doctor: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = await buildService(prisma);

    try {
      await service.findSlots(NURSE_CALLER, {
        doctorId: DOCTOR_ID,
        departmentId: DEPARTMENT_ID,
        date: FAR_FUTURE_DATE,
        type: AppointmentType.CONSULTATION,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.NOT_FOUND);
      expect((err as AppException).getStatus()).toBe(404);
    }
  });

  it('throws 400 DEPARTMENT_TYPE_NOT_ALLOWED when the pair is missing', async () => {
    const prisma = buildPrisma({
      departmentAppointmentType: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = await buildService(prisma);

    try {
      await service.findSlots(NURSE_CALLER, {
        doctorId: DOCTOR_ID,
        departmentId: DEPARTMENT_ID,
        date: FAR_FUTURE_DATE,
        type: AppointmentType.PROCEDURE,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED);
      expect((err as AppException).getStatus()).toBe(400);
      expect((err as AppException).details).toEqual({
        departmentId: DEPARTMENT_ID,
        appointmentType: AppointmentType.PROCEDURE,
      });
    }
  });

  it('returns empty array when the day has no schedules', async () => {
    const prisma = buildPrisma();
    const service = await buildService(prisma);

    const out = await service.findSlots(NURSE_CALLER, {
      doctorId: DOCTOR_ID,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    expect(out).toEqual([]);
  });

  it('computes slots from a single schedule and CANCELLED appointments do NOT exclude', async () => {
    // The findMany mock for `appointment` should already be filtered to
    // BOOKED + COMPLETED on the BE — assert here that the service passes
    // exactly that filter (CANCELLED never reaches the in-memory loop).
    const apptFindMany = jest.fn().mockResolvedValue([]);

    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-1',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
          }),
        ]),
      },
      appointment: { findMany: apptFindMany },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(NURSE_CALLER, {
      doctorId: DOCTOR_ID,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION, // 20 min
    });

    expect(slots).toEqual([
      {
        startAt: '2099-06-15T09:00:00.000Z',
        endAt: '2099-06-15T09:20:00.000Z',
        departmentId: DEPARTMENT_ID,
        scheduleId: 'sched-1',
        doctorId: DOCTOR_ID,
        doctorCode: DOCTOR_CODE,
        doctorName: DOCTOR_DISPLAY_NAME,
      },
      {
        startAt: '2099-06-15T09:20:00.000Z',
        endAt: '2099-06-15T09:40:00.000Z',
        departmentId: DEPARTMENT_ID,
        scheduleId: 'sched-1',
        doctorId: DOCTOR_ID,
        doctorCode: DOCTOR_CODE,
        doctorName: DOCTOR_DISPLAY_NAME,
      },
      {
        startAt: '2099-06-15T09:40:00.000Z',
        endAt: '2099-06-15T10:00:00.000Z',
        departmentId: DEPARTMENT_ID,
        scheduleId: 'sched-1',
        doctorId: DOCTOR_ID,
        doctorCode: DOCTOR_CODE,
        doctorName: DOCTOR_DISPLAY_NAME,
      },
    ]);

    // Verify the appointment filter only includes BOOKED + COMPLETED —
    // CANCELLED is NEVER fetched, so it cannot block a slot.
    expect(apptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [AppointmentStatus.BOOKED, AppointmentStatus.COMPLETED] },
        }),
      }),
    );
  });

  it('merges slots from multiple schedules on the same day in chronological order', async () => {
    const prisma = buildPrisma({
      // Test asks for PROCEDURE (60-min slot) — override the default
      // 20-min mock so each 60-min window produces exactly one slot.
      departmentAppointmentType: {
        findFirst: jest.fn().mockResolvedValue({
          durationMinutes: 60,
          windows: [],
        }),
      },
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-pm',
            startAt: new Date('2099-06-15T14:00:00.000Z'),
            endAt: new Date('2099-06-15T15:00:00.000Z'),
          }),
          scheduleRow({
            id: 'sched-am',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
          }),
        ]),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(NURSE_CALLER, {
      doctorId: DOCTOR_ID,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.PROCEDURE, // 60 min
    });

    expect(slots.map((s) => s.startAt)).toEqual([
      '2099-06-15T09:00:00.000Z',
      '2099-06-15T14:00:00.000Z',
    ]);
  });

  it('queries blocking appointments across the schedule union (not just the requested UTC day)', async () => {
    // A schedule spans 23:00 (day N) UTC → 01:00 (day N+1) UTC. The
    // blocking-appointment filter MUST cover the schedule's full range,
    // not just the requested date's UTC bounds — otherwise an appointment
    // booked into the post-midnight portion would be silently dropped
    // from the blocker set and the slot finder would re-emit a slot that
    // is already booked. This test pins the Prisma `where` bounds to the
    // union [min(schedule.startAt), max(schedule.endAt)).
    const apptFindMany = jest.fn().mockResolvedValue([]);

    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-boundary',
            startAt: new Date('2099-06-15T23:00:00.000Z'),
            endAt: new Date('2099-06-16T01:00:00.000Z'),
          }),
        ]),
      },
      appointment: { findMany: apptFindMany },
    });
    const service = await buildService(prisma);

    await service.findSlots(NURSE_CALLER, {
      doctorId: DOCTOR_ID,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    expect(apptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { lt: new Date('2099-06-16T01:00:00.000Z') },
          endAt: { gt: new Date('2099-06-15T23:00:00.000Z') },
        }),
      }),
    );
  });

  it('returns [] (200) for a fully-past date', async () => {
    // Mocked Prisma still echoes a schedule on the date, but every slot
    // sits in the past and gets dropped — the response is `[]`, never 404
    // or 400 (US-6.2).
    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-past',
            startAt: new Date('2020-01-01T09:00:00.000Z'),
            endAt: new Date('2020-01-01T12:00:00.000Z'),
          }),
        ]),
      },
    });
    const service = await buildService(prisma);

    // jest fake-timer's "now" is 2099-01-01, so 2020-01-01 is fully past.
    const slots = await service.findSlots(NURSE_CALLER, {
      doctorId: DOCTOR_ID,
      departmentId: DEPARTMENT_ID,
      date: '2020-01-01',
      type: AppointmentType.CONSULTATION,
    });

    expect(slots).toEqual([]);
  });

  // ─── F15 — multi-doctor fan-out + widened permission gate ─────────────

  /**
   * F15 — when `doctorId` is omitted the finder fans out across every
   * doctor with an active schedule in `departmentId` on `date` and merges
   * the resulting grids. The slot stream is sorted by `startAt`.
   */
  it('F15: merges slots from multiple doctors when doctorId is omitted', async () => {
    const DOCTOR_A_ID = '11111111-1111-4111-8111-111111111111';
    const DOCTOR_B_ID = '22222222-2222-4222-8222-222222222222';

    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-a',
            startAt: new Date('2099-06-15T14:00:00.000Z'),
            endAt: new Date('2099-06-15T15:00:00.000Z'),
            doctorId: DOCTOR_A_ID,
            doctorCode: 'MD-AAA',
            firstNameEn: 'Alice',
            lastNameEn: 'Anderson',
          }),
          scheduleRow({
            id: 'sched-b',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
            doctorId: DOCTOR_B_ID,
            doctorCode: 'MD-BBB',
            firstNameEn: 'Bob',
            lastNameEn: 'Brown',
          }),
        ]),
      },
      departmentAppointmentType: {
        findFirst: jest.fn().mockResolvedValue({
          durationMinutes: 60,
          windows: [],
        }),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(NURSE_CALLER, {
      doctorId: undefined,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.PROCEDURE,
    });

    // Merged + sorted: Bob's 09:00 first, then Alice's 14:00.
    expect(slots).toHaveLength(2);
    expect(slots[0].startAt).toBe('2099-06-15T09:00:00.000Z');
    expect(slots[0].doctorId).toBe(DOCTOR_B_ID);
    expect(slots[0].doctorCode).toBe('MD-BBB');
    expect(slots[0].doctorName).toBe('Bob Brown');
    expect(slots[0].scheduleId).toBe('sched-b');

    expect(slots[1].startAt).toBe('2099-06-15T14:00:00.000Z');
    expect(slots[1].doctorId).toBe(DOCTOR_A_ID);
    expect(slots[1].doctorCode).toBe('MD-AAA');
    expect(slots[1].doctorName).toBe('Alice Anderson');
    expect(slots[1].scheduleId).toBe('sched-a');
  });

  /**
   * F15 — a `.own`-only caller (synthetic DOCTOR fixture with ONLY
   * `appointment.create.own` — no `schedule.read.*` codes) MUST pin
   * their own `doctorId`. Omitting it falls into
   * `INSUFFICIENT_PERMISSION_SCOPE` because `.own` cannot probe
   * multiple doctors. NOTE: the seeded baseline DOCTOR also holds
   * `schedule.read.own-department`, which short-circuits to
   * `OWN_DEPARTMENT` before this branch — see the
   * `F15: DOCTOR with own-dept read scope fans out` case below for the
   * realistic-DOCTOR path.
   */
  it('F15: .own-only caller omitting doctorId is rejected with INSUFFICIENT_PERMISSION_SCOPE', async () => {
    const OWN_DOCTOR_ID = '99999999-9999-4999-8999-999999999999';
    const DOCTOR_CALLER: AuthenticatedUser = {
      ...NURSE_CALLER,
      id: 'user-doctor',
      email: 'doctor@example.com',
      roleId: 'role-doctor',
      roleCode: ROLE.DOCTOR,
      permissionCodes: [PERMISSION.APPOINTMENT_CREATE_OWN],
      doctor: { id: OWN_DOCTOR_ID, departmentId: DEPARTMENT_ID },
    };
    const prisma = buildPrisma();
    const service = await buildService(prisma);

    try {
      await service.findSlots(DOCTOR_CALLER, {
        doctorId: undefined,
        departmentId: DEPARTMENT_ID,
        date: FAR_FUTURE_DATE,
        type: AppointmentType.CONSULTATION,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).getStatus()).toBe(403);
      expect((err as AppException).details).toEqual(
        expect.objectContaining({
          required: [
            PERMISSION.SCHEDULE_READ_OWN,
            PERMISSION.APPOINTMENT_CREATE_OWN,
          ],
          scope: SCOPE.OWN,
          ownDoctorId: OWN_DOCTOR_ID,
        }),
      );
    }
  });

  /**
   * F15 — the realistic seeded DOCTOR caller holds
   * `schedule.read.own-department` + `schedule.read.own` +
   * `appointment.create.own`. The widest-scope-wins resolver promotes
   * them to `OWN_DEPARTMENT` for the slot finder, so omitting `doctorId`
   * (the F15 fan-out path) succeeds when the requested `departmentId`
   * matches the caller's home. US-15.2 — DOCTOR in
   * `OWN_PLUS_DEPT + dept` scope sees every doctor in their dept.
   */
  it('F15: DOCTOR with own-dept read scope fans out across own department', async () => {
    const OWN_DOCTOR_ID = '99999999-9999-4999-8999-999999999999';
    const DOCTOR_CALLER: AuthenticatedUser = {
      ...NURSE_CALLER,
      id: 'user-doctor-realistic',
      email: 'doctor-realistic@example.com',
      roleId: 'role-doctor',
      roleCode: ROLE.DOCTOR,
      permissionCodes: [
        PERMISSION.APPOINTMENT_CREATE_OWN,
        PERMISSION.SCHEDULE_READ_OWN,
        PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      ],
      doctor: { id: OWN_DOCTOR_ID, departmentId: DEPARTMENT_ID },
    };
    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-doctor-realistic-1',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
          }),
        ]),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(DOCTOR_CALLER, {
      doctorId: undefined,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual(
      expect.objectContaining({
        startAt: '2099-06-15T09:00:00.000Z',
        doctorId: DOCTOR_ID,
        doctorCode: DOCTOR_CODE,
        doctorName: DOCTOR_DISPLAY_NAME,
      }),
    );
  });

  /**
   * F15 — when the realistic DOCTOR caller probes a department OUTSIDE
   * their home, the `OWN_DEPARTMENT` branch's dept gate fails. The
   * caller falls through to `OWN`, which requires a pinned own
   * `doctorId`. With `doctorId` omitted the fall-through also fails,
   * and the resolver throws an `OWN_DEPARTMENT`-flavoured
   * `INSUFFICIENT_PERMISSION_SCOPE` (dept-gate failure outranks
   * doctor-gate failure as the widest applicable scope).
   */
  it('F15: DOCTOR probing a foreign dept WITHOUT pinning own doctorId is rejected with INSUFFICIENT_PERMISSION_SCOPE', async () => {
    const OWN_DOCTOR_ID = '99999999-9999-4999-8999-999999999999';
    const FOREIGN_DEPARTMENT_ID = 'bb1d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9';
    const DOCTOR_CALLER: AuthenticatedUser = {
      ...NURSE_CALLER,
      id: 'user-doctor-realistic',
      email: 'doctor-realistic@example.com',
      roleId: 'role-doctor',
      roleCode: ROLE.DOCTOR,
      permissionCodes: [
        PERMISSION.APPOINTMENT_CREATE_OWN,
        PERMISSION.SCHEDULE_READ_OWN,
        PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      ],
      doctor: { id: OWN_DOCTOR_ID, departmentId: DEPARTMENT_ID },
    };
    const prisma = buildPrisma();
    const service = await buildService(prisma);

    try {
      await service.findSlots(DOCTOR_CALLER, {
        doctorId: undefined,
        departmentId: FOREIGN_DEPARTMENT_ID,
        date: FAR_FUTURE_DATE,
        type: AppointmentType.CONSULTATION,
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      );
      expect((err as AppException).details).toEqual(
        expect.objectContaining({
          required: [
            PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
            PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
          ],
          scope: SCOPE.OWN_DEPARTMENT,
          requestedDepartmentId: FOREIGN_DEPARTMENT_ID,
        }),
      );
    }
  });

  /**
   * F15 — cross-coverage path: a realistic DOCTOR probing a NON-home
   * department WITH their own `doctorId` pinned falls through from
   * `OWN_DEPARTMENT` (dept gate fails) to `OWN` (doctor gate passes
   * because the request pinned `caller.doctor.id`). This keeps the
   * existing F09 cross-coverage workflow intact even though
   * `schedule.read.own-department` would otherwise have rejected the
   * foreign-dept probe.
   */
  it('F15: DOCTOR probing own doctorId in a non-home dept succeeds via OWN fall-through', async () => {
    const OWN_DOCTOR_ID = DOCTOR_ID;
    const FOREIGN_DEPARTMENT_ID = 'bb1d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9';
    const DOCTOR_CALLER: AuthenticatedUser = {
      ...NURSE_CALLER,
      id: 'user-doctor-realistic',
      email: 'doctor-realistic@example.com',
      roleId: 'role-doctor',
      roleCode: ROLE.DOCTOR,
      permissionCodes: [
        PERMISSION.APPOINTMENT_CREATE_OWN,
        PERMISSION.SCHEDULE_READ_OWN,
        PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      ],
      doctor: { id: OWN_DOCTOR_ID, departmentId: DEPARTMENT_ID },
    };
    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-doctor-cross-coverage',
            departmentId: FOREIGN_DEPARTMENT_ID,
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
          }),
        ]),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(DOCTOR_CALLER, {
      doctorId: OWN_DOCTOR_ID,
      departmentId: FOREIGN_DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    expect(slots).toHaveLength(3);
    expect(slots[0].doctorId).toBe(OWN_DOCTOR_ID);
    expect(slots[0].departmentId).toBe(FOREIGN_DEPARTMENT_ID);
  });

  /**
   * F15 / US-15.3 — an MRO holding only `schedule.read.all` (no
   * `appointment.create.*`) can use the slot finder as a read-only
   * visibility tool. The scope guard short-circuits on
   * `schedule.read.all` so no doctor / department narrowing applies.
   */
  it('F15: schedule.read.all caller (MRO) succeeds with no doctor/department narrowing', async () => {
    const MRO_CALLER: AuthenticatedUser = {
      ...NURSE_CALLER,
      id: 'user-mro',
      email: 'mro@example.com',
      roleId: 'role-mro',
      roleCode: ROLE.MEDICAL_RECORDS_OFFICER,
      // MRO holds schedule.read.all but NOT appointment.create.*. Cross-
      // dept too: departmentId is null in production for MRO.
      departmentId: null,
      permissionCodes: [PERMISSION.SCHEDULE_READ_ALL],
      doctor: null,
    };

    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-mro-1',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
          }),
        ]),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(MRO_CALLER, {
      // Note: doctorId omitted to prove the MRO path also covers fan-out.
      doctorId: undefined,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual(
      expect.objectContaining({
        startAt: '2099-06-15T09:00:00.000Z',
        doctorId: DOCTOR_ID,
        doctorCode: DOCTOR_CODE,
        doctorName: DOCTOR_DISPLAY_NAME,
      }),
    );
  });

  /**
   * F15 — blocking appointments must be grouped by `doctorId` so a
   * BOOKED appointment on doctor A does not block a candidate slot on
   * doctor B in the multi-doctor fan-out. Asserts that the per-schedule
   * grid step only sees its own doctor's blockers.
   */
  it('F15: blocking appointments are grouped by doctorId (cross-doctor isolation)', async () => {
    const DOCTOR_A_ID = '11111111-1111-4111-8111-111111111111';
    const DOCTOR_B_ID = '22222222-2222-4222-8222-222222222222';

    const prisma = buildPrisma({
      doctorSchedule: {
        findMany: jest.fn().mockResolvedValue([
          scheduleRow({
            id: 'sched-a',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
            doctorId: DOCTOR_A_ID,
            doctorCode: 'MD-AAA',
            firstNameEn: 'Alice',
            lastNameEn: 'Anderson',
          }),
          scheduleRow({
            id: 'sched-b',
            startAt: new Date('2099-06-15T09:00:00.000Z'),
            endAt: new Date('2099-06-15T10:00:00.000Z'),
            doctorId: DOCTOR_B_ID,
            doctorCode: 'MD-BBB',
            firstNameEn: 'Bob',
            lastNameEn: 'Brown',
          }),
        ]),
      },
      appointment: {
        // Block ONLY doctor A's 09:20–09:40 — doctor B's matching slot
        // must remain open.
        findMany: jest.fn().mockResolvedValue([
          {
            doctorId: DOCTOR_A_ID,
            startAt: new Date('2099-06-15T09:20:00.000Z'),
            endAt: new Date('2099-06-15T09:40:00.000Z'),
          },
        ]),
      },
    });
    const service = await buildService(prisma);

    const slots = await service.findSlots(NURSE_CALLER, {
      doctorId: undefined,
      departmentId: DEPARTMENT_ID,
      date: '2099-06-15',
      type: AppointmentType.CONSULTATION,
    });

    // Doctor A: 09:00–09:20 (kept), 09:20–09:40 (blocked), 09:40–10:00 (kept).
    // Doctor B: all three slots kept — A's blocker does not affect B.
    const slotsByDoctor = (id: string): typeof slots =>
      slots.filter((s) => s.doctorId === id);

    expect(slotsByDoctor(DOCTOR_A_ID).map((s) => s.startAt)).toEqual([
      '2099-06-15T09:00:00.000Z',
      '2099-06-15T09:40:00.000Z',
    ]);
    expect(slotsByDoctor(DOCTOR_B_ID).map((s) => s.startAt)).toEqual([
      '2099-06-15T09:00:00.000Z',
      '2099-06-15T09:20:00.000Z',
      '2099-06-15T09:40:00.000Z',
    ]);
  });
});

describe('SlotsService (DI wiring smoke)', () => {
  it('constructs with a mock PrismaService', async () => {
    const module = await Test.createTestingModule({
      providers: [
        SlotsService,
        {
          provide: PrismaService,
          useValue: {
            doctor: { findFirst: jest.fn() },
            departmentAppointmentType: { findFirst: jest.fn() },
            doctorSchedule: { findMany: jest.fn() },
            appointment: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    expect(module.get(SlotsService)).toBeInstanceOf(SlotsService);
  });
});
