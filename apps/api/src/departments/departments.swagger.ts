import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import {
  BookingWindowDto,
  DepartmentAppointmentTypeResponseDto,
} from './dto/department-appointment-type.response.dto';
import { DepartmentResponseDto } from './dto/department.response.dto';

const FORBIDDEN_LIST_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [PERMISSION.DOCTOR_READ], held: [] },
};

const FORBIDDEN_APPOINTMENT_TYPES_EXAMPLE = {
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

const NOT_FOUND_DEPARTMENT_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Department not found.',
};

const PaginatedDepartmentDto = PaginatedDto(DepartmentResponseDto);

export function ApiListDepartments(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(DepartmentResponseDto, PaginatedDepartmentDto),
    ApiOperation({
      summary: 'List active departments (paginated)',
      description:
        'Name-sorted; soft-deleted departments are excluded. Supports ' +
        '`?page=&pageSize=`. For "doctors in a department" use ' +
        '`GET /doctors?departmentId=<uuid>` (the previous companion ' +
        '`GET /departments/:id/doctors` was retired).',
    }),
    ApiOkResponse({
      description: 'Department directory page',
      type: PaginatedDepartmentDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.read` permission.',
      schema: { example: FORBIDDEN_LIST_EXAMPLE },
    }),
  );
}

export function ApiListDepartmentAppointmentTypes(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(BookingWindowDto, DepartmentAppointmentTypeResponseDto),
    ApiOperation({
      summary: 'List per-(department, type) booking rules for one department',
      description:
        'Returns one row per `department_appointment_types` entry for the ' +
        'chosen department with `code` + `label` + `durationMinutes` + ' +
        '`bookingWindows` (ordered array of wall-clock [startMinute,endMinute) ' +
        'ranges in `CLINIC_TIMEZONE`; F21). Empty array = unrestricted. Consumed ' +
        'by the booking wizard after the user picks a department so the type chip ' +
        'can render multi-range copy (e.g. "09:00–11:00 or 14:00–16:00"). Gated ' +
        'on any-of the `appointment.read.*` family.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Department id.',
    }),
    ApiOkResponse({
      description: 'Per-(department, type) booking-rule catalog.',
      type: DepartmentAppointmentTypeResponseDto,
      isArray: true,
    }),
    ApiForbiddenResponse({
      description: 'Caller holds none of the required `appointment.read.*` permissions.',
      schema: { example: FORBIDDEN_APPOINTMENT_TYPES_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Department not found (or soft-deleted).',
      schema: { example: NOT_FOUND_DEPARTMENT_EXAMPLE },
    }),
  );
}
