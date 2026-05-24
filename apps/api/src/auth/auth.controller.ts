import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../users/users.types';

import { AuthService } from './auth.service';
import { ApiAuthResolve, ApiMe, ApiMePermissionsCheck } from './auth.swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { InternalRoute } from './decorators/internal-route.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { ResolveDto, ResolveResponseDto } from './dto/resolve.dto';
import { PERMISSION } from './permissions';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/resolve')
  @InternalRoute()
  @HttpCode(HttpStatus.OK)
  @ApiAuthResolve()
  resolve(@Body() dto: ResolveDto): Promise<ResolveResponseDto> {
    return this.auth.resolve(dto);
  }

  @Get('me')
  @ApiMe()
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('me/permissions-check')
  @RequirePermission(PERMISSION.PERMISSION_ASSIGN)
  @ApiMePermissionsCheck()
  permissionCheck(): { ok: true } {
    return { ok: true };
  }
}
