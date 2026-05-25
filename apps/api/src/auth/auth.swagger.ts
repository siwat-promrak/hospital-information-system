import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorCode } from '../common/errors';

import { MeResponseDto } from './dto/me.response.dto';
import { PermissionCheckResponseDto } from './dto/permission-check.response.dto';
import { ResolveResponseDto } from './dto/resolve.response.dto';
import { PERMISSION } from './permissions';

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
      type: MeResponseDto,
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
 * `POST /auth/signout` — records a SIGN_OUT event in `auth_logs`. The
 * cookie itself is cleared by NextAuth on the FE; this endpoint is purely
 * an audit hook so we capture voluntary session termination alongside
 * sign-in events.
 */
export function ApiAuthSignOut(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Record a SIGN_OUT auth-log event for the current user',
      description:
        'Cookie clearing is handled client-side by NextAuth. This endpoint ' +
        'only writes the audit row.',
    }),
    ApiNoContentResponse({ description: 'Auth-log row written' }),
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
      summary: `Permission-gated stub — verifies ${PERMISSION.ROLE_UPDATE} flow`,
    }),
    ApiOkResponse({
      description: `Caller holds ${PERMISSION.ROLE_UPDATE}`,
      type: PermissionCheckResponseDto,
    }),
    ApiForbiddenResponse({
      description: `Caller is missing ${PERMISSION.ROLE_UPDATE}`,
      schema: {
        example: {
          ...ENVELOPE_EXAMPLE(
            ErrorCode.INSUFFICIENT_PERMISSION,
            'Caller is missing the required permission(s).',
            403,
          ),
          details: { required: [PERMISSION.ROLE_UPDATE], held: [] },
        },
      },
    }),
  );
}
