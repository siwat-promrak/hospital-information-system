import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
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

const FORBIDDEN_SCOPE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
  message: 'DOCTOR users may only update medical records they authored.',
};

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.NOT_FOUND,
  message: 'Medical record not found.',
};

const VALIDATION_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: 'Request validation failed.',
};

const PaginatedMedicalRecordDto = PaginatedDto(MedicalRecordResponseDto);

export function ApiListMedicalRecords(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(MedicalRecordResponseDto, PaginatedMedicalRecordDto),
    ApiOperation({
      summary: 'List medical records (paginated)',
      description:
        'Returns medical records ordered by `createdAt DESC`. ' +
        'Filters: `?patientId=`, `?doctorId=`, `?appointmentId=`. ' +
        'All filters are AND-combined; missing filters mean no constraint. ' +
        'Reads are scope-less — every caller holding ' +
        '`medical_records.read.all` sees the full result set.',
    }),
    ApiQuery({ name: 'patientId', required: false }),
    ApiQuery({ name: 'doctorId', required: false }),
    ApiQuery({ name: 'appointmentId', required: false }),
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

export function ApiCreateMedicalRecord(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a medical record (DOCTOR only)',
      description:
        '`doctorId` is read from the caller’s JWT (`caller.doctor.id`) — ' +
        'never from the request body. `departmentId` is mirrored from the ' +
        'referenced appointment’s doctor. The caller MUST be the doctor ' +
        'assigned to the referenced appointment.',
    }),
    ApiCreatedResponse({
      description: 'Medical record created',
      type: MedicalRecordResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'DTO validation failed OR patientId does not match the referenced appointment.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description:
        'Missing `medical_records.create.own` OR caller is not the doctor on the appointment.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Referenced appointment is unknown.',
      schema: { example: { ...NOT_FOUND_EXAMPLE, message: 'Appointment not found.' } },
    }),
  );
}

export function ApiUpdateMedicalRecord(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a medical record (partial)',
      description:
        'Patch body is a subset of `{ note, drug }`. `medical_records.update.own` ' +
        '(DOCTOR) requires the record’s authoring doctor to be the caller; ' +
        '`medical_records.update.all` (MEDICAL_RECORDS_OFFICER) skips that ' +
        'check.',
    }),
    ApiParam({ name: 'id', description: 'Medical record id (uuid).' }),
    ApiOkResponse({
      description: 'Medical record updated',
      type: MedicalRecordResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'DTO validation failed.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description:
        'Missing the per-verb update permission OR DOCTOR caller is not the authoring doctor.',
      schema: { example: FORBIDDEN_SCOPE_EXAMPLE },
    }),
    ApiNotFoundResponse({
      description: 'Medical record id is unknown.',
      schema: { example: NOT_FOUND_EXAMPLE },
    }),
  );
}
