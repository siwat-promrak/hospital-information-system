import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';

import { SlotResponseDto } from './dto/slot.response.dto';

const APPOINTMENT_TYPE_VALUES = Object.values(AppointmentType);

const FORBIDDEN_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: {
    required: [
      PERMISSION.APPOINTMENT_CREATE_OWN,
      PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
      PERMISSION.SCHEDULE_READ_ALL,
      PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      PERMISSION.SCHEDULE_READ_OWN,
    ],
    held: [],
  },
};

const FORBIDDEN_SCOPE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
  message: 'Slot finder is restricted to your own department.',
  details: {
    required: [
      PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
      PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    ],
    scope: 'own-department',
    requestedDepartmentId: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
  },
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Doctor not found.',
};

const DEPARTMENT_TYPE_NOT_ALLOWED_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.DEPARTMENT_TYPE_NOT_ALLOWED,
  message: 'Department does not offer this appointment type.',
  details: {
    departmentId: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    appointmentType: AppointmentType.PROCEDURE,
  },
};

const VALIDATION_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: 'Request validation failed.',
  details: {
    errors: ['doctorId must be a UUID.'],
  },
};

export function ApiFindSlots(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(SlotResponseDto),
    ApiOperation({
      summary: 'Find open booking slots for a (department, date, type) triple — optionally narrowed by doctor',
      description:
        'Computes the chronologically-sorted list of open slots for a ' +
        '`(department, date, appointmentType)` triple. When `doctorId` is ' +
        'supplied the finder restricts to that single doctor; when ' +
        'omitted (F15) it fans out across every doctor with an active ' +
        'schedule in `departmentId` on `date` and merges the resulting ' +
        'grids. Slots are stepped by the per-(department, type) ' +
        '`durationMinutes` (F13) across every active `DoctorSchedule` ' +
        'whose `[startAt, endAt)` intersects the chosen UTC calendar ' +
        'day. Excluded: slots that intersect the schedule break window, ' +
        'slots that intersect a `BOOKED` / `COMPLETED` appointment on ' +
        'the SAME doctor (CANCELLED frees the slot), and slots whose ' +
        '`startAt <= now`. Returns `[]` (200, never 404) when no slots ' +
        'are available — including a fully-past `date` (US-6.2). Every ' +
        'emitted slot carries the owning doctor\'s `doctorId`, ' +
        '`doctorCode`, and display name (F15). Permission gate (any-of): ' +
        '`appointment.create.own`, `appointment.create.own-department`, ' +
        '`schedule.read.all`, `schedule.read.own-department`, OR ' +
        '`schedule.read.own`. Service-layer scope is widest-wins across ' +
        'the union of these codes — DOCTOR (who holds both ' +
        '`schedule.read.own-department` AND `schedule.read.own` + ' +
        '`appointment.create.own`) gets `OWN_DEPARTMENT` semantics in ' +
        'their own dept and falls through to `OWN` for cross-coverage ' +
        'probes of themselves in non-home departments. MRO is ' +
        '`SCOPE.ALL` via `schedule.read.all`. PHARMACY holds none of ' +
        'these codes and is rejected.',
    }),
    ApiQuery({
      name: 'doctorId',
      required: false,
      description:
        'Doctor to find slots for (F15 OPTIONAL). When omitted, the ' +
        'finder fans out across every doctor with an active schedule in ' +
        '`departmentId` on `date` and merges the resulting grids. A ' +
        '`.own`-only caller (DOCTOR with only `appointment.create.own`) ' +
        'MUST pass their own `doctorId`; omitting it is rejected with ' +
        '`INSUFFICIENT_PERMISSION_SCOPE` because `.own` cannot probe ' +
        'multiple doctors.',
    }),
    ApiQuery({
      name: 'departmentId',
      required: true,
      description:
        'Department to find slots for. The slot finder only considers ' +
        'schedules whose `departmentId` matches.',
    }),
    ApiQuery({
      name: 'date',
      required: true,
      example: '2026-06-15',
      description:
        'Calendar date (ISO `YYYY-MM-DD`). Interpreted as a UTC day.',
    }),
    ApiQuery({
      name: 'type',
      required: true,
      enum: APPOINTMENT_TYPE_VALUES,
      example: AppointmentType.CONSULTATION,
      description:
        'Appointment type — drives the slot grid step. The `(departmentId, ' +
        'type)` pair must exist in `department_appointment_types`.',
    }),
    ApiOkResponse({
      description: 'Open slots in chronological order (may be empty).',
      type: SlotResponseDto,
      isArray: true,
    }),
    ApiBadRequestResponse({
      description:
        '`VALIDATION_FAILED` when a query param is missing / malformed, ' +
        'OR `DEPARTMENT_TYPE_NOT_ALLOWED` when the `(departmentId, type)` ' +
        'pair is not in `department_appointment_types`.',
      schema: {
        oneOf: [
          { example: VALIDATION_EXAMPLE },
          { example: DEPARTMENT_TYPE_NOT_ALLOWED_EXAMPLE },
        ],
      },
    }),
    ApiForbiddenResponse({
      description:
        '`INSUFFICIENT_PERMISSION` when the caller holds none of the ' +
        'accepted gating codes. `INSUFFICIENT_PERMISSION_SCOPE` when an ' +
        '`OWN_DEPARTMENT`-scope caller queries a foreign department AND ' +
        'has no `.own` fall-through, OR when a `.own`-only caller omits ' +
        '`doctorId` / probes a foreign doctor (the multi-doctor fan-out ' +
        'is not available at `.own` scope).',
      schema: {
        oneOf: [
          { example: FORBIDDEN_EXAMPLE },
          { example: FORBIDDEN_SCOPE_EXAMPLE },
        ],
      },
    }),
    ApiNotFoundResponse({
      description: 'Doctor id is unknown or soft-deleted.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}
