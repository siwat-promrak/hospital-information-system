import { ApiProperty } from '@nestjs/swagger';

/**
 * Trivial response shape for `GET /me/permissions-check`. The endpoint is
 * a smoke test for the `@RequirePermission` flow — a successful call
 * means the caller holds `permission.assign`. Carries `ok: true` so the
 * FE has a stable field to assert against rather than an empty body.
 */
export class PermissionCheckResponseDto {
  @ApiProperty({ example: true })
  ok!: true;
}
