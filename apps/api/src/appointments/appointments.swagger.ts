import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentStatus, AppointmentType } from '@prisma/client';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import { AppointmentResponseDto } from './dto/appointment.response.dto';
import { APPOINTMENT_LIST_ORDER } from './appointments.const';

const VALIDATION_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: 'Request validation failed.',
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

const DOCTOR_DEPARTMENT_MISMATCH_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.DOCTOR_DEPARTMENT_MISMATCH,
  message: "Appointment departmentId must match the doctor's current department.",
};

const APPOINTMENT_START_IN_PAST_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.APPOINTMENT_START_IN_PAST,
  message: 'Appointment start time cannot be in the past.',
};

const SCHEDULE_NOT_FOUND_FOR_BOOKING_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.SCHEDULE_NOT_FOUND_FOR_BOOKING,
  message: 'No bookable schedule matches the booking payload.',
};

const SCHEDULE_NOT_BOOKABLE_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.SCHEDULE_NOT_BOOKABLE,
  message: 'The selected schedule does not accept booking.',
};

const SLOT_OUTSIDE_SCHEDULE_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.SLOT_OUTSIDE_SCHEDULE,
  message: 'Requested slot is outside the schedule window.',
};

const SLOT_OVERLAPS_BREAK_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.SLOT_OVERLAPS_BREAK,
  message: 'Requested slot overlaps the schedule break window.',
};

const FORBIDDEN_CREATE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: {
    required: [
      PERMISSION.APPOINTMENT_CREATE_OWN,
      PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    ],
    held: [],
  },
};

const FORBIDDEN_SCOPE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
  message: 'Caller may only book appointments within their own department.',
  details: {
    required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
    scope: 'own-department',
  },
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.APPOINTMENT_NOT_FOUND,
  message: 'Appointment not found.',
};

const NOT_FOUND_DOCTOR_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Doctor not found.',
};

const SLOT_TAKEN_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.SLOT_TAKEN,
  message: 'Another booking has just claimed this slot.',
};

const APPOINTMENT_ALREADY_CANCELLED_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.APPOINTMENT_ALREADY_CANCELLED,
  message: 'Appointment is already cancelled.',
};

const APPOINTMENT_ALREADY_COMPLETED_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.APPOINTMENT_ALREADY_COMPLETED,
  message: 'Appointment is already completed and cannot be cancelled.',
};

const PaginatedAppointmentDto = PaginatedDto(AppointmentResponseDto);

export function ApiCreateAppointment(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Book an appointment',
      description:
        'Runs the booking transaction at SERIALIZABLE isolation: re-validates ' +
        'department/type allowance, doctor existence + home-department match, ' +
        'schedule containment + `acceptsBooking`, break window, and slot ' +
        'collision against other BOOKED / COMPLETED appointments. `endAt` is ' +
        'computed by the BE from `APPOINTMENT_TYPE_DURATION_MINUTES[type]` — ' +
        'the wizard never sends it. `reason` is REQUIRED when ' +
        '`appointmentType === PROCEDURE`.',
    }),
    ApiCreatedResponse({
      description: 'Appointment booked',
      type: AppointmentResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        '`VALIDATION_FAILED`, `APPOINTMENT_START_IN_PAST`, ' +
        '`DEPARTMENT_TYPE_NOT_ALLOWED`, `DOCTOR_DEPARTMENT_MISMATCH`, ' +
        '`SCHEDULE_NOT_FOUND_FOR_BOOKING`, `SCHEDULE_NOT_BOOKABLE`, ' +
        '`SLOT_OUTSIDE_SCHEDULE`, or `SLOT_OVERLAPS_BREAK`.',
      schema: {
        oneOf: [
          { example: VALIDATION_EXAMPLE },
          { example: APPOINTMENT_START_IN_PAST_EXAMPLE },
          { example: DEPARTMENT_TYPE_NOT_ALLOWED_EXAMPLE },
          { example: DOCTOR_DEPARTMENT_MISMATCH_EXAMPLE },
          { example: SCHEDULE_NOT_FOUND_FOR_BOOKING_EXAMPLE },
          { example: SCHEDULE_NOT_BOOKABLE_EXAMPLE },
          { example: SLOT_OUTSIDE_SCHEDULE_EXAMPLE },
          { example: SLOT_OVERLAPS_BREAK_EXAMPLE },
        ],
      },
    }),
    ApiForbiddenResponse({
      description:
        'Caller is missing `appointment.create.*` OR holds it but only for a ' +
        'different doctor / department scope.',
      schema: {
        oneOf: [
          { example: FORBIDDEN_CREATE_EXAMPLE },
          { example: FORBIDDEN_SCOPE_EXAMPLE },
        ],
      },
    }),
    ApiNotFoundResponse({
      description: 'Doctor or patient id is unknown / soft-deleted.',
      schema: { example: NOT_FOUND_DOCTOR_EXAMPLE },
    }),
    ApiConflictResponse({
      description: 'Slot has just been claimed by another booking.',
      schema: { example: SLOT_TAKEN_EXAMPLE },
    }),
  );
}

export function ApiListAppointments(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(AppointmentResponseDto, PaginatedAppointmentDto),
    ApiOperation({
      summary: 'List appointments (paginated, scope-aware)',
      description:
        'Returns appointments ordered by `startAt` (asc by default). The ' +
        'caller scope narrows the result: `appointment.read.own` → only the ' +
        "caller's own doctor; `appointment.read.own-department` → the " +
        "caller's department; `appointment.read.all` → no narrowing. " +
        'A filter that crosses the caller scope returns 403.',
    }),
    ApiQuery({ name: 'doctorId', required: false }),
    ApiQuery({ name: 'patientId', required: false }),
    ApiQuery({ name: 'departmentId', required: false }),
    ApiQuery({ name: 'from', required: false }),
    ApiQuery({ name: 'to', required: false }),
    ApiQuery({ name: 'status', required: false, enum: AppointmentStatus }),
    ApiQuery({
      name: 'order',
      required: false,
      enum: Object.values(APPOINTMENT_LIST_ORDER),
    }),
    ApiOkResponse({
      description: 'Appointments page',
      type: PaginatedAppointmentDto,
    }),
    ApiForbiddenResponse({
      description:
        '`INSUFFICIENT_PERMISSION` when the caller lacks every read variant, ' +
        'OR `INSUFFICIENT_PERMISSION_SCOPE` when a filter crosses the caller ' +
        'scope.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
  );
}

export function ApiGetAppointment(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({ summary: 'Get an appointment by id' }),
    ApiParam({ name: 'id', description: 'Appointment id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment detail',
      type: AppointmentResponseDto,
    }),
    ApiNotFoundResponse({
      description:
        'Appointment id is unknown OR out of the caller scope (no existence leak).',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}

export function ApiCancelAppointment(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancel an appointment',
      description:
        'Sets `status = CANCELLED` and records `cancelledAt` / `cancelledBy` / ' +
        '`cancellationReason`. The slot is freed for immediate reuse. ' +
        'Cancelling an already-CANCELLED appointment returns 409; cancelling ' +
        'a COMPLETED appointment returns 409.',
    }),
    ApiParam({ name: 'id', description: 'Appointment id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment cancelled',
      type: AppointmentResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'DTO validation failed.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description: 'Caller scope does not allow cancelling this appointment.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Appointment id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description: 'Appointment is already cancelled OR already completed.',
      schema: {
        oneOf: [
          { example: APPOINTMENT_ALREADY_CANCELLED_EXAMPLE },
          { example: APPOINTMENT_ALREADY_COMPLETED_EXAMPLE },
        ],
      },
    }),
  );
}
