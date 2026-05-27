import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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

import { PatientResponseDto } from './dto/patient.response.dto';

const VALIDATION_EXAMPLE = {
  statusCode: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: 'Request validation failed.',
};

const CONFLICT_DUPLICATE_EMAIL_EXAMPLE = {
  statusCode: 409,
  code: ErrorCode.PATIENT_EMAIL_EXISTS,
  message: 'A patient with this email already exists.',
  details: { email: 'praewa@example.com' },
};

const FORBIDDEN_CREATE_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [PERMISSION.PATIENT_CREATE], held: [] },
};

const FORBIDDEN_READ_EXAMPLE = {
  statusCode: 403,
  code: ErrorCode.INSUFFICIENT_PERMISSION,
  message: 'Caller is missing the required permission(s).',
  details: { required: [PERMISSION.PATIENT_READ], held: [] },
};

const PATIENT_NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  code: ErrorCode.PATIENT_NOT_FOUND,
  message: 'Patient not found.',
};

const PaginatedPatientDto = PaginatedDto(PatientResponseDto);

export function ApiGetPatient(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a patient by id',
      description:
        'Returns the patient detail for `:id`. Gated on `patient.read`. ' +
        'Soft-deleted patients return 404.',
    }),
    ApiParam({ name: 'id', description: 'Patient id (uuid).' }),
    ApiOkResponse({
      description: 'Patient detail',
      type: PatientResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'Patient not found',
      schema: { example: PATIENT_NOT_FOUND_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing `patient.read`.',
      schema: { example: FORBIDDEN_READ_EXAMPLE },
    }),
  );
}

export function ApiCreatePatient(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Register a walk-in patient',
      description:
        '`hn` is minted server-side as `<YY><sequence>` (zero-padded to 8 ' +
        'chars). `email` is optional; when present the service lowercases ' +
        'and trims it, and rejects duplicates with `409 ' +
        'PATIENT_EMAIL_EXISTS`. `bloodGroup` defaults to `UNKNOWN` when ' +
        'omitted.',
    }),
    ApiCreatedResponse({
      description: 'Patient registered',
      type: PatientResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'DTO validation failed.',
      schema: { example: VALIDATION_EXAMPLE },
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing `patient.create`.',
      schema: { example: FORBIDDEN_CREATE_EXAMPLE },
    }),
    ApiConflictResponse({
      description: 'A patient with this email already exists.',
      schema: { example: CONFLICT_DUPLICATE_EMAIL_EXAMPLE },
    }),
  );
}

export function ApiListPatients(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(PatientResponseDto, PaginatedPatientDto),
    ApiOperation({
      summary: 'Search / list patients (paginated)',
      description:
        'Returns patients ordered by `createdAt DESC`. The `?q=` filter ' +
        'runs a case-insensitive `contains` across `firstNameEn` / ' +
        '`lastNameEn` / `firstNameTh` / `lastNameTh` / `phone` / ' +
        '`identificationNo` / `hn` — missing `q` returns the unfiltered ' +
        'paginated list. Soft-deleted rows are excluded.',
    }),
    ApiQuery({ name: 'q', required: false }),
    ApiOkResponse({
      description: 'Patients page',
      type: PaginatedPatientDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is missing `patient.read`.',
      schema: { example: FORBIDDEN_READ_EXAMPLE },
    }),
  );
}
