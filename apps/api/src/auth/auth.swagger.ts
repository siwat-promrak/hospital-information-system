import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorCode } from '../common/errors';

import { ResolveResponseDto } from './dto/resolve.dto';
import { PERMISSION } from './permissions';
import { ROLE } from './roles';

const ENVELOPE_EXAMPLE = (code: string, message: string, statusCode: number) => ({
  statusCode,
  code,
  message,
});

/**
 * `POST /auth/resolve` — guarded by the shared `X-Internal-Secret` header
 * (Next.js server → Nest server). Resolves a Google profile to an existing
 * user and returns the identity + permission tuple the FE writes into the
 * session JWT.
 */
export function ApiAuthResolve(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Resolve a Google profile to an internal user + permission set',
      description:
        'Server-to-server endpoint called by the Next.js NextAuth signIn ' +
        'callback. Requires the shared `X-Internal-Secret` header.',
    }),
    ApiOkResponse({
      description: 'Resolved user + permission codes',
      type: ResolveResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Request body failed validation',
      schema: {
        example: ENVELOPE_EXAMPLE(
          ErrorCode.VALIDATION_FAILED,
          'Request validation failed.',
          400,
        ),
      },
    }),
    ApiUnauthorizedResponse({
      description:
        'Caller is not invited / is disabled / email is unverified / ' +
        'shared secret is missing or invalid',
      schema: {
        oneOf: [
          {
            example: ENVELOPE_EXAMPLE(
              ErrorCode.AUTH_INTERNAL_FORBIDDEN,
              'Missing or invalid internal API secret.',
              401,
            ),
          },
          {
            example: ENVELOPE_EXAMPLE(
              ErrorCode.EMAIL_UNVERIFIED,
              'Google email is not verified.',
              401,
            ),
          },
          {
            example: ENVELOPE_EXAMPLE(
              ErrorCode.NOT_INVITED,
              'No invitation exists for this email.',
              401,
            ),
          },
          {
            example: ENVELOPE_EXAMPLE(
              ErrorCode.USER_DISABLED,
              'User account is disabled.',
              401,
            ),
          },
        ],
      },
    }),
  );
}

/**
 * `GET /me` — returns the calling user's identity + permission codes. Used
 * by the FE as a session probe and by the e2e suite to verify the JWT pipe.
 */
export function ApiMe(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({ summary: 'Return the current authenticated user' }),
    ApiOkResponse({
      description: 'Authenticated user payload',
      schema: {
        example: {
          id: '0d6b3f7a-2a40-4f74-9036-7d8ae8e29d33',
          email: 'staff1@gmail.com',
          roleCode: ROLE.STAFF,
          firstNameEn: 'Pim',
          lastNameEn: 'Sukjai',
          firstNameTh: 'พิม',
          lastNameTh: 'สุขใจ',
          picture: null,
          permissionCodes: [PERMISSION.APPOINTMENT_CREATE, PERMISSION.PATIENT_LIST],
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid session token',
      schema: {
        example: ENVELOPE_EXAMPLE(
          ErrorCode.AUTH_MISSING_TOKEN,
          'Missing session token.',
          401,
        ),
      },
    }),
  );
}

/**
 * `GET /me/permissions-check` — permission-gated stub used to verify the
 * `@RequirePermission` flow end-to-end (returns 200 only for callers
 * holding `permission.assign`, i.e. ADMIN in the seeded baseline).
 */
export function ApiMePermissionsCheck(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: `Permission-gated stub — verifies ${PERMISSION.PERMISSION_ASSIGN} flow`,
    }),
    ApiOkResponse({
      description: `Caller holds ${PERMISSION.PERMISSION_ASSIGN}`,
      schema: { example: { ok: true } },
    }),
    ApiForbiddenResponse({
      description: `Caller is missing ${PERMISSION.PERMISSION_ASSIGN}`,
      schema: {
        example: {
          ...ENVELOPE_EXAMPLE(
            ErrorCode.INSUFFICIENT_PERMISSION,
            'Caller is missing the required permission(s).',
            403,
          ),
          details: { required: [PERMISSION.PERMISSION_ASSIGN], held: [] },
        },
      },
    }),
  );
}
