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
  details: { required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT], held: [] },
};

const FORBIDDEN_SCOPE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
  message: 'Slot finder is restricted to your own department.',
  details: {
    required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT],
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
      summary: 'Find open booking slots for a (doctor, department, date, type) tuple',
      description:
        'Computes the chronologically-sorted list of open slots for one ' +
        '`(doctor, department, date, appointmentType)` tuple. Slots are ' +
        'stepped by the per-type duration (`APPOINTMENT_TYPE_DURATION_MINUTES`) ' +
        'across every active `DoctorSchedule` for the doctor in the chosen ' +
        'department on the chosen UTC calendar day. Excluded: slots that ' +
        'intersect the schedule break window, slots that intersect a ' +
        '`BOOKED` / `COMPLETED` appointment (CANCELLED frees the slot), ' +
        'and slots whose `startAt <= now`. Returns `[]` (200, never 404) ' +
        'when no slots are available — including a fully-past `date` ' +
        '(US-6.2). Gated on `appointment.create.own-department`; NURSE ' +
        'holds it by default, ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY ' +
        'do not.',
    }),
    ApiQuery({
      name: 'doctorId',
      required: true,
      description:
        'Doctor to find slots for. The slot finder is locked to one ' +
        'doctor per call.',
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
        '`INSUFFICIENT_PERMISSION` when the caller lacks ' +
        '`appointment.create.own-department`, OR ' +
        '`INSUFFICIENT_PERMISSION_SCOPE` when a NURSE queries slots for a ' +
        'doctor in a different department from the caller.',
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
