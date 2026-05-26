import { applyDecorators } from '@nestjs/common';
import {
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

