import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import { DepartmentResponseDto } from './dto/department.response.dto';

const FORBIDDEN_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: ['doctor.list'], held: [] },
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
      description: 'Caller is missing the `doctor.list` permission.',
      schema: { example: FORBIDDEN_EXAMPLE },
    }),
  );
}
