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

// F14 — continuation + referral error examples.
const PREVIOUS_APPOINTMENT_NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.PREVIOUS_APPOINTMENT_NOT_FOUND,
  message: 'Previous appointment not found.',
};

const PREVIOUS_APPOINTMENT_CANCELLED_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.PREVIOUS_APPOINTMENT_CANCELLED,
  message: 'Cannot continue from a cancelled appointment.',
};

const PREVIOUS_APPOINTMENT_NOT_COMPLETED_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.PREVIOUS_APPOINTMENT_NOT_COMPLETED,
  message:
    'Previous appointment must be COMPLETED before a continuation can be booked.',
  details: {
    previousAppointmentId: '7c8e2a10-1234-5678-9abc-deadbeefcafe',
    previousStatus: AppointmentStatus.BOOKED,
  },
};

const CONTINUATION_APPOINTMENT_TYPE_INVALID_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.CONTINUATION_APPOINTMENT_TYPE_INVALID,
  message: 'Continuation visits must be FOLLOW_UP or PROCEDURE.',
  details: {
    previousAppointmentId: '7c8e2a10-1234-5678-9abc-deadbeefcafe',
    appointmentType: AppointmentType.CONSULTATION,
    allowedAppointmentTypes: [
      AppointmentType.FOLLOW_UP,
      AppointmentType.PROCEDURE,
    ],
  },
};

const APPOINTMENT_GROUP_CLOSED_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.APPOINTMENT_GROUP_CLOSED,
  message: 'Appointment group is closed — cannot attach further visits.',
};

const APPOINTMENT_GROUP_PATIENT_MISMATCH_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.APPOINTMENT_GROUP_PATIENT_MISMATCH,
  message:
    "Continuation booking patient must match the previous appointment's patient.",
};

const REFERRAL_DEPARTMENT_MISMATCH_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.REFERRAL_DEPARTMENT_MISMATCH,
  message:
    "Continuation department must match the previous appointment's referral destination.",
};

const REFERRAL_ALREADY_FULFILLED_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.REFERRAL_ALREADY_FULFILLED,
  message: 'This referral has already been picked up by another appointment.',
};

const APPOINTMENT_ALREADY_REFERRED_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.APPOINTMENT_ALREADY_REFERRED,
  message: 'Appointment has already been referred.',
};

const APPOINTMENT_NOT_BOOKED_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.APPOINTMENT_NOT_BOOKED,
  message:
    'Appointment is not in a bookable state and cannot be completed.',
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
        '`SLOT_OUTSIDE_SCHEDULE`, `SLOT_OVERLAPS_BREAK`, ' +
        '`PREVIOUS_APPOINTMENT_CANCELLED`, ' +
        '`PREVIOUS_APPOINTMENT_NOT_COMPLETED`, ' +
        '`CONTINUATION_APPOINTMENT_TYPE_INVALID`, ' +
        '`APPOINTMENT_GROUP_CLOSED`, ' +
        '`APPOINTMENT_GROUP_PATIENT_MISMATCH`, or ' +
        '`REFERRAL_DEPARTMENT_MISMATCH`.',
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
          { example: PREVIOUS_APPOINTMENT_CANCELLED_EXAMPLE },
          { example: PREVIOUS_APPOINTMENT_NOT_COMPLETED_EXAMPLE },
          { example: CONTINUATION_APPOINTMENT_TYPE_INVALID_EXAMPLE },
          { example: APPOINTMENT_GROUP_CLOSED_EXAMPLE },
          { example: APPOINTMENT_GROUP_PATIENT_MISMATCH_EXAMPLE },
          { example: REFERRAL_DEPARTMENT_MISMATCH_EXAMPLE },
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
      description: 'Doctor, patient, or previous appointment id is unknown / soft-deleted.',
      schema: {
        oneOf: [
          { example: NOT_FOUND_DOCTOR_EXAMPLE },
          { example: PREVIOUS_APPOINTMENT_NOT_FOUND_EXAMPLE },
        ],
      },
    }),
    ApiConflictResponse({
      description:
        '`SLOT_TAKEN` (slot just claimed) OR `REFERRAL_ALREADY_FULFILLED` ' +
        '(the chosen previous appointment was already picked up by another booking).',
      schema: {
        oneOf: [
          { example: SLOT_TAKEN_EXAMPLE },
          { example: REFERRAL_ALREADY_FULFILLED_EXAMPLE },
        ],
      },
    }),
  );
}

export function ApiCompleteAppointment(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Complete an appointment (DOCTOR-only)',
      description:
        'Transitions `BOOKED → COMPLETED`. Idempotent on `COMPLETED`. ' +
        'Rejects from `CANCELLED` with `409 APPOINTMENT_NOT_BOOKED`. ' +
        'No group / referral side-effect — this is the "completion-only" ' +
        'ending, symmetric with `cancel`.',
    }),
    ApiParam({ name: 'id', description: 'Appointment id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment completed (or already completed)',
      type: AppointmentResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is not the doctor of the appointment.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Appointment id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description: 'Appointment status is CANCELLED.',
      schema: { example: APPOINTMENT_NOT_BOOKED_EXAMPLE },
    }),
  );
}

export function ApiReferAppointment(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Refer an appointment to another department (DOCTOR-only)',
      description:
        'Atomic: sets `status = COMPLETED`, `referredToDepartmentId = ' +
        'body.toDepartmentId`, and `referredAt = now()`. The group stays ' +
        'open — closing is a separate action ' +
        '(`POST /appointment-groups/:id/close`). A second refer attempt ' +
        'on the same row returns `409 APPOINTMENT_ALREADY_REFERRED`. Free ' +
        'department choice — any valid `departmentId` is accepted.',
    }),
    ApiParam({ name: 'id', description: 'Appointment id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment referred',
      type: AppointmentResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        '`VALIDATION_FAILED` OR `NOT_FOUND` (`toDepartmentId` is unknown).',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description: 'Caller is not the doctor of the appointment.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Appointment id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description:
        'Appointment has already been referred OR is CANCELLED.',
      schema: {
        oneOf: [
          { example: APPOINTMENT_ALREADY_REFERRED_EXAMPLE },
          { example: APPOINTMENT_NOT_BOOKED_EXAMPLE },
        ],
      },
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
    ApiQuery({
      name: 'pendingReferralOnly',
      required: false,
      type: Boolean,
      description:
        'F14 — when `true`, narrows to the pending-referral pickup queue: ' +
        '`status = COMPLETED` AND `referredToDepartmentId IS NOT NULL` AND ' +
        '`referralFulfilledByAppointmentId IS NULL`. The destination-dept ' +
        'narrowing comes from the caller\'s permission scope.',
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
