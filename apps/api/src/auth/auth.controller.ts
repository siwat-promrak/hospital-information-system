import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { buildAuthLogContext } from '../auth-log/request-context';
import type { AuthenticatedUser } from '../users/users.types';

import { AuthService } from './auth.service';
import {
  ApiAuthResolve,
  ApiAuthSignOut,
  ApiMe,
  ApiMePermissionsCheck,
} from './auth.swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { InternalRoute } from './decorators/internal-route.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { MeResponseDto } from './dto/me.response.dto';
import { PermissionCheckResponseDto } from './dto/permission-check.response.dto';
import { ResolveDto } from './dto/resolve.dto';
import { ResolveResponseDto } from './dto/resolve.response.dto';
import { PERMISSION } from './permissions';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/resolve')
  @InternalRoute()
  @HttpCode(HttpStatus.OK)
  @ApiAuthResolve()
  resolve(@Body() dto: ResolveDto, @Req() request: Request): Promise<ResolveResponseDto> {
    return this.auth.resolve(dto, buildAuthLogContext(request));
  }

  @Post('auth/signout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthSignOut()
  async signOut(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.signOut(user, buildAuthLogContext(request));
  }

  @Get('me')
  @ApiMe()
  me(@CurrentUser() user: AuthenticatedUser): MeResponseDto {
    // `AuthenticatedUser` (interface) IS structurally `MeResponseDto`
    // (class) — the JWT guard already populated every field.
    return user as MeResponseDto;
  }

  @Get('me/permissions-check')
  @RequirePermission(PERMISSION.ROLE_UPDATE)
  @ApiMePermissionsCheck()
  permissionCheck(): PermissionCheckResponseDto {
    return { ok: true };
  }
}
