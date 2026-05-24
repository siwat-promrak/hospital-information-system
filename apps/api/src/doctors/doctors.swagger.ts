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

import { ErrorCode } from '../common/errors';
import { PaginatedDto } from '../common/pagination';

import { DoctorDetailDto, DoctorDto } from './dto/doctor.dto';

const FORBIDDEN_EXAMPLE = (required: string) => ({
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [required], held: [] },
});

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Doctor not found.',
};

const PaginatedDoctorDto = PaginatedDto(DoctorDto);

export function ApiListDoctors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(DoctorDto, PaginatedDoctorDto),
    ApiOperation({
      summary: 'List active doctors with department affiliations (paginated)',
      description:
        'Sort: `doctorCode asc`. Optional `?departmentId=<uuid>` filters ' +
        'to doctors affiliated with that department (primary or secondary). ' +
        'Supports `?page=&pageSize=` (defaults: page=1, pageSize=20, max=100).',
    }),
    ApiQuery({
      name: 'departmentId',
      required: false,
      description: 'Restrict to doctors affiliated with this department.',
    }),
    ApiOkResponse({
      description: 'Doctors directory page',
      type: PaginatedDoctorDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.list` permission.',
      schema: { example: FORBIDDEN_EXAMPLE('doctor.list') },
    }),
  );
}

export function ApiGetDoctor(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a doctor by id',
      description:
        'Includes all department affiliations and the count of active ' +
        'schedule rows. Full schedule CRUD ships in F06.',
    }),
    ApiParam({ name: 'id', description: 'Doctor id (uuid).' }),
    ApiOkResponse({
      description: 'Doctor detail',
      type: DoctorDetailDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing the `doctor.read` permission.',
      schema: { example: FORBIDDEN_EXAMPLE('doctor.read') },
    }),
    ApiNotFoundResponse({
      description: 'Doctor id is unknown or soft-deleted.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}
