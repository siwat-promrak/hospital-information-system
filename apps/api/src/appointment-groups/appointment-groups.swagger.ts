import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import { APPOINTMENT_GROUP_STATUS_VALUES } from './appointment-groups.const';
import {
  AppointmentGroupDetailResponseDto,
  AppointmentGroupResponseDto,
} from './dto/appointment-group.response.dto';

const FORBIDDEN_READ_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: {
    required: [
      PERMISSION.APPOINTMENT_READ_OWN,
      PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
      PERMISSION.APPOINTMENT_READ_ALL,
    ],
    held: [],
  },
};

const FORBIDDEN_CLOSE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.APPOINTMENT_GROUP_CLOSE_FORBIDDEN,
  message:
    'Only the doctor on the latest non-cancelled appointment may close this case.',
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.APPOINTMENT_GROUP_NOT_FOUND,
  message: 'Appointment group not found.',
};

const PaginatedAppointmentGroupDto = PaginatedDto(AppointmentGroupResponseDto);

export function ApiListAppointmentGroups(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(AppointmentGroupResponseDto, PaginatedAppointmentGroupDto),
    ApiOperation({
      summary: "List a patient's appointment groups (paginated, scope-aware)",
      description:
        'Returns paginated groups for the requested patient, newest-opened ' +
        'first. Each row carries `memberCount` + `latestVisit` summary so ' +
        'the patient-detail timeline can render in one round-trip. The ' +
        'caller scope on `appointment.read.*` filters the result: a group ' +
        'with no member visible to the caller is excluded.',
    }),
    ApiQuery({ name: 'patientId', required: true }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: APPOINTMENT_GROUP_STATUS_VALUES,
    }),
    ApiOkResponse({
      description: 'Appointment groups page',
      type: PaginatedAppointmentGroupDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing every `appointment.read.*` variant.',
      schema: { example: FORBIDDEN_READ_EXAMPLE },
    }),
  );
}

export function ApiGetAppointmentGroup(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get an appointment group with full chronological member list',
      description:
        'Returns the group + every member appointment (chronologically by ' +
        '`startAt`). Out-of-scope or unknown id returns 404 — no existence ' +
        'leak.',
    }),
    ApiParam({ name: 'id', description: 'Appointment group id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment group detail',
      type: AppointmentGroupDetailResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'Group id is unknown OR no member intersects caller scope.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}

export function ApiCloseAppointmentGroup(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Close a case (latest visit → COMPLETED + group → closed)',
      description:
        'Atomic: sets `group.closedAt = now()` AND transitions the ' +
        "group's latest non-cancelled appointment from `BOOKED` to " +
        '`COMPLETED` (idempotent on `COMPLETED`). Idempotent on an ' +
        'already-closed group. Caller MUST be the doctor on the latest ' +
        'non-cancelled appointment in the group; otherwise 403 ' +
        '`APPOINTMENT_GROUP_CLOSE_FORBIDDEN`.',
    }),
    ApiParam({ name: 'id', description: 'Appointment group id (uuid).' }),
    ApiOkResponse({
      description: 'Appointment group closed (or already closed)',
      type: AppointmentGroupDetailResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is not the doctor of the latest non-cancelled visit.',
      schema: { example: FORBIDDEN_CLOSE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Group id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
    ApiConflictResponse({
      description: 'Group has no non-cancelled appointment to complete.',
      schema: { example: FORBIDDEN_CLOSE_EXAMPLE },
    }),
  );
}
