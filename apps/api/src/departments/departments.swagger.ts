import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ErrorCode } from '../common/errors';

import { DepartmentDoctorDto, DepartmentDto } from './dto/department.dto';

const FORBIDDEN_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: ['doctor.list'], held: [] },
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Department not found.',
};

export function ApiListDepartments(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List all active departments',
      description: 'Name-sorted; soft-deleted departments are excluded.',
    }),
    ApiOkResponse({
      description: 'Department directory',
      type: DepartmentDto,
      isArray: true,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.list` permission.',
      schema: { example: FORBIDDEN_EXAMPLE },
    }),
  );
}

export function ApiListDepartmentDoctors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List doctors affiliated with a department',
      description:
        'Includes the `isPrimary` flag from the `doctor_departments` join. ' +
        'Doctors are sorted with primaries first.',
    }),
    ApiParam({ name: 'id', description: 'Department id (uuid).' }),
    ApiOkResponse({
      description: 'Doctors in the department',
      type: DepartmentDoctorDto,
      isArray: true,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.list` permission.',
      schema: { example: FORBIDDEN_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Department id is unknown or soft-deleted.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}
