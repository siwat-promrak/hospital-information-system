import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import { ScheduleResponseDto } from './dto/schedule.response.dto';

const FORBIDDEN_PERMISSION_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: {
    required: [
      PERMISSION.SCHEDULE_READ_OWN,
      PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      PERMISSION.SCHEDULE_READ_ALL,
    ],
    held: [],
  },
};

const FORBIDDEN_SCOPE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
  message: 'DOCTOR users may only manage their own schedules.',
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.SCHEDULE_NOT_FOUND,
  message: 'Schedule not found.',
};

const VALIDATION_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: 'Request validation failed.',
  details: {
    errors: ['endAt must be strictly greater than startAt.'],
  },
};

const OVERLAP_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.SCHEDULE_OVERLAP,
  message:
    'Schedule conflicts with an existing active schedule for the same doctor.',
  details: { conflictingScheduleId: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' },
};

const NOT_IN_DEPARTMENT_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.DOCTOR_NOT_IN_DEPARTMENT,
  message: 'Doctor is not affiliated with the requested department.',
  details: {
    doctorId: '4f3e2a10-1234-5678-9abc-deadbeef1234',
    departmentId: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
  },
};

const SCHEDULE_HAS_APPOINTMENTS_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.SCHEDULE_HAS_APPOINTMENTS,
  message: 'Cannot mutate a schedule with existing appointments.',
  details: {
    scheduleId: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    blockingAppointmentCount: 2,
  },
};

const PaginatedScheduleDto = PaginatedDto(ScheduleResponseDto);

export function ApiListSchedules(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ScheduleResponseDto, PaginatedScheduleDto),
    ApiOperation({
      summary: 'List doctor schedules (paginated)',
      description:
        'Returns active schedules ordered by `startAt ASC`. ' +
        'Filters: `?doctorId=`, `?departmentId=`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`. ' +
        '`from` / `to` are inclusive calendar-date bounds expanded to ' +
        'start-of-day / end-of-day UTC; the query matches schedules whose ' +
        '`[startAt, endAt)` intersects the range. When BOTH are omitted, ' +
        'the range defaults to the current calendar month. ' +
        'DOCTOR callers are auto-restricted to their own `doctorId` — explicitly ' +
        'asking for another doctor returns `403 INSUFFICIENT_PERMISSION_SCOPE`.',
    }),
    ApiQuery({ name: 'doctorId', required: false }),
    ApiQuery({ name: 'departmentId', required: false }),
    ApiQuery({
      name: 'from',
      required: false,
      example: '2026-06-01',
      description: 'Inclusive lower bound (ISO calendar date YYYY-MM-DD).',
    }),
    ApiQuery({
      name: 'to',
      required: false,
      example: '2026-06-30',
      description: 'Inclusive upper bound (ISO calendar date YYYY-MM-DD).',
    }),
    ApiOkResponse({ description: 'Schedules page', type: PaginatedScheduleDto }),
    ApiForbiddenResponse({
      description:
        'Missing the per-verb schedule permission (`INSUFFICIENT_PERMISSION`) OR DOCTOR scope violation (`INSUFFICIENT_PERMISSION_SCOPE`).',
      schema: { example: FORBIDDEN_PERMISSION_EXAMPLE },
    }),
  );
}

export function ApiGetSchedule(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({ summary: 'Get a schedule by id' }),
    ApiParam({ name: 'id', description: 'Schedule id (uuid).' }),
    ApiOkResponse({ description: 'Schedule detail', type: ScheduleResponseDto }),
    ApiForbiddenResponse({
      description: 'Caller lacks the per-verb schedule permission.',
      schema: { example: FORBIDDEN_PERMISSION_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description:
        'Schedule id is unknown, soft-deleted, or owned by a different doctor (DOCTOR callers only).',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}

export function ApiCreateSchedule(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a doctor schedule',
      description:
        'Body must satisfy DTO + cross-field invariants ' +
        '(`endAt > startAt`, break window strictly inside `[startAt, endAt]`). ' +
        'The service additionally verifies the doctor is affiliated with ' +
        '`departmentId` AND that the new window does not overlap any ' +
        'existing active schedule for the same doctor.',
    }),
    ApiCreatedResponse({
      description: 'Schedule created',
      type: ScheduleResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'DTO validation failed.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description:
        'Missing the per-verb schedule permission OR DOCTOR scope violation (`INSUFFICIENT_PERMISSION_SCOPE`) when `doctorId` is not the caller.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiConflictResponse({
      description:
        '`DOCTOR_NOT_IN_DEPARTMENT` if the doctor lacks the affiliation, ' +
        'or `SCHEDULE_OVERLAP` if the window collides with another active schedule.',
      schema: {
        oneOf: [
          { example: NOT_IN_DEPARTMENT_EXAMPLE },
          { example: OVERLAP_EXAMPLE },
        ],
      },
    }),
  );
}

export function ApiUpdateSchedule(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a schedule (partial)',
      description:
        'Body is a partial of the create payload minus `doctorId`. ' +
        'Affiliation + overlap checks re-run against the merged row. ' +
        'Rejects with `409 SCHEDULE_HAS_APPOINTMENTS` when the schedule ' +
        'already has at least one non-CANCELLED appointment ' +
        '(`status IN (BOOKED, COMPLETED)`) referencing it.',
    }),
    ApiParam({ name: 'id', description: 'Schedule id (uuid).' }),
    ApiOkResponse({ description: 'Schedule updated', type: ScheduleResponseDto }),
    ApiBadRequestResponse({
      description: 'DTO validation failed.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description: 'Missing the per-verb schedule permission OR DOCTOR scope violation.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Schedule id is unknown or soft-deleted.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description:
        '`DOCTOR_NOT_IN_DEPARTMENT`, `SCHEDULE_OVERLAP`, or ' +
        '`SCHEDULE_HAS_APPOINTMENTS` when non-CANCELLED appointments ' +
        'still reference the schedule.',
      schema: {
        oneOf: [
          { example: NOT_IN_DEPARTMENT_EXAMPLE },
          { example: OVERLAP_EXAMPLE },
          { example: SCHEDULE_HAS_APPOINTMENTS_EXAMPLE },
        ],
      },
    }),
  );
}

export function ApiDeleteSchedule(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Soft-delete a schedule',
      description:
        'Sets `deletedAt` / `deletedBy`. Rejects with ' +
        '`409 SCHEDULE_HAS_APPOINTMENTS` when the schedule already has ' +
        'at least one non-CANCELLED appointment ' +
        '(`status IN (BOOKED, COMPLETED)`) referencing it.',
    }),
    ApiParam({ name: 'id', description: 'Schedule id (uuid).' }),
    ApiNoContentResponse({ description: 'Schedule deleted.' }),
    ApiForbiddenResponse({
      description: 'Missing the per-verb schedule permission OR DOCTOR scope violation.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Schedule id is unknown or already deleted.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description:
        '`SCHEDULE_HAS_APPOINTMENTS` when non-CANCELLED appointments ' +
        'still reference the schedule.',
      schema: { example: SCHEDULE_HAS_APPOINTMENTS_EXAMPLE },
    }),
  );
}
