import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';

import { AppointmentTypeResponseDto } from './dto/appointment-type.response.dto';

const FORBIDDEN_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT], held: [] },
};

export function ApiListAppointmentTypes(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(AppointmentTypeResponseDto),
    ApiOperation({
      summary: 'List supported appointment types with their slot durations',
      description:
        'Returns the canonical catalog of `AppointmentType` enum values ' +
        'paired with their English label and slot duration in minutes. ' +
        'Static per-deploy — the per-type duration map lives in application ' +
        'code (`appointment-types.const.ts`), not the database. Gated on ' +
        '`appointment.create.own-department` because the caller is about to book; NURSE ' +
        'holds it by default, ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY do not.',
    }),
    ApiOkResponse({
      description: 'Appointment type catalog',
      type: AppointmentTypeResponseDto,
      isArray: true,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `appointment.create.own-department` permission.',
      schema: { example: FORBIDDEN_EXAMPLE },
    }),
  );
}
