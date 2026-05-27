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

import { MedicalRecordResponseDto } from './dto/medical-record.response.dto';

const FORBIDDEN_READ_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [PERMISSION.MEDICAL_RECORDS_READ_ALL], held: [] },
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Medical record not found.',
};

const PaginatedMedicalRecordDto = PaginatedDto(MedicalRecordResponseDto);

export function ApiListMedicalRecords(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(MedicalRecordResponseDto, PaginatedMedicalRecordDto),
    ApiOperation({
      summary: 'List medical records (paginated)',
      description:
        'Returns medical records ordered by `createdAt DESC`. ' +
        'Filters: `?patientId=`, `?doctorId=`, `?appointmentId=`, ' +
        '`?appointmentGroupId=` (F18 — visit-thread view). ' +
        'All filters are AND-combined; missing filters mean no constraint. ' +
        'Reads are scope-less — every caller holding ' +
        '`medical_records.read.all` sees the full result set.',
    }),
    ApiQuery({ name: 'patientId', required: false }),
    ApiQuery({ name: 'doctorId', required: false }),
    ApiQuery({ name: 'appointmentId', required: false }),
    ApiQuery({
      name: 'appointmentGroupId',
      required: false,
      description:
        'F18 — Restrict to records whose linked appointment belongs to this group. ' +
        'Use with `pageSize=all` for the visit-thread view.',
    }),
    ApiOkResponse({
      description: 'Medical records page',
      type: PaginatedMedicalRecordDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing `medical_records.read.all`.',
      schema: { example: FORBIDDEN_READ_EXAMPLE },
    }),
  );
}

export function ApiGetMedicalRecord(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({ summary: 'Get a medical record by id' }),
    ApiParam({ name: 'id', description: 'Medical record id (uuid).' }),
    ApiOkResponse({
      description: 'Medical record detail',
      type: MedicalRecordResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing `medical_records.read.all`.',
      schema: { example: FORBIDDEN_READ_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Medical record id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}
