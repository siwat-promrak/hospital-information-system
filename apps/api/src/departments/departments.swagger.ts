import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

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

const PaginatedDepartmentDto = PaginatedDto(DepartmentDto);
const PaginatedDepartmentDoctorDto = PaginatedDto(DepartmentDoctorDto);

export function ApiListDepartments(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(DepartmentDto, PaginatedDepartmentDto),
    ApiOperation({
      summary: 'List active departments (paginated)',
      description:
        'Name-sorted; soft-deleted departments are excluded. Supports ' +
        '`?page=&pageSize=` (defaults: page=1, pageSize=20, max=100).',
    }),
    ApiOkResponse({
      description: 'Department directory page',
      type: PaginatedDepartmentDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.list` permission.',
      schema: { example: FORBIDDEN_EXAMPLE },
    }),
  );
}

export function ApiListDepartmentDoctors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(DepartmentDoctorDto, PaginatedDepartmentDoctorDto),
    ApiOperation({
      summary: 'List doctors affiliated with a department (paginated)',
      description:
        'Includes the `isPrimary` flag from the `doctor_departments` join. ' +
        'Doctors are sorted with primaries first, then by `doctorCode asc`. ' +
        'Supports `?page=&pageSize=` (defaults: page=1, pageSize=20, max=100).',
    }),
    ApiParam({ name: 'id', description: 'Department id (uuid).' }),
    ApiOkResponse({
      description: 'Doctors-in-department page',
      type: PaginatedDepartmentDoctorDto,
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
