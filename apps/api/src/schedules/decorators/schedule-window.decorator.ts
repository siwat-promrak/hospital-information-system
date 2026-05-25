import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * **DTO-layer / structural** cross-field validator.
 *
 * Applied at the DTO root via `@IsScheduleWindowValid()` so the global
 * `ValidationPipe` catches structural problems BEFORE the controller body
 * (and any Prisma round-trip) runs. Enforces:
 *
 *  - `endAt > startAt`
 *  - if EITHER break field is set, both must be set
 *  - `breakStartAt < breakEndAt`
 *  - break window lies inside `[startAt, endAt]`
 *
 * Pure: no DB access, no async, no "now" comparison. Time-of-day domain
 * checks that need a transaction, a Prisma client, or `dayjs.utc()`
 * (e.g. "startAt is not in the past", overlap with sibling schedules,
 * doctor-in-department) live in the **service-layer** counterpart at
 * `../schedule.validation.ts`.
 *
 * The DB CHECK constraints (`doctor_schedules_end_after_start`,
 * `doctor_schedules_break_valid`) still back-stop anything that slips
 * through — these rules just give a friendlier 400 + `VALIDATION_FAILED`
 * over the 500 Postgres would otherwise produce.
 */
interface ScheduleWindowFields {
  startAt?: string;
  endAt?: string;
  breakStartAt?: string | null;
  breakEndAt?: string | null;
}

export function checkScheduleWindow(value: ScheduleWindowFields): string | null {
  const { startAt, endAt, breakStartAt, breakEndAt } = value;

  const start = typeof startAt === 'string' ? Date.parse(startAt) : NaN;
  const end = typeof endAt === 'string' ? Date.parse(endAt) : NaN;

  if (!Number.isNaN(start) && !Number.isNaN(end)) {
    if (end <= start) {
      return 'endAt must be strictly greater than startAt.';
    }
  }

  const hasBreakStart =
    breakStartAt !== undefined && breakStartAt !== null;
  const hasBreakEnd =
    breakEndAt !== undefined && breakEndAt !== null;

  if (hasBreakStart !== hasBreakEnd) {
    return 'breakStartAt and breakEndAt must be set together (both or neither).';
  }

  if (hasBreakStart && hasBreakEnd) {
    const bs = Date.parse(breakStartAt as string);
    const be = Date.parse(breakEndAt as string);

    if (Number.isNaN(bs) || Number.isNaN(be)) {
      return 'breakStartAt and breakEndAt must be valid ISO datetimes.';
    }

    if (bs >= be) {
      return 'breakStartAt must be strictly less than breakEndAt.';
    }

    if (!Number.isNaN(start) && bs < start) {
      return 'breakStartAt must be >= startAt.';
    }

    if (!Number.isNaN(end) && be > end) {
      return 'breakEndAt must be <= endAt.';
    }
  }

  return null;
}

export function IsScheduleWindowValid(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function register(object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isScheduleWindowValid',
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          return checkScheduleWindow(args.object as ScheduleWindowFields) === null;
        },
        defaultMessage(args: ValidationArguments): string {
          return (
            checkScheduleWindow(args.object as ScheduleWindowFields) ??
            'Invalid schedule window.'
          );
        },
      },
    });
  };
}
