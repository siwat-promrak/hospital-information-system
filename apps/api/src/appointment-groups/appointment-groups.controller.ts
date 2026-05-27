import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';
import type { AuthenticatedUser } from '../users/users.types';

import { AppointmentGroupsService } from './appointment-groups.service';
import {
  ApiGetAppointmentGroup,
  ApiListAppointmentGroups,
} from './appointment-groups.swagger';
import {
  AppointmentGroupDetailResponseDto,
  AppointmentGroupResponseDto,
} from './dto/appointment-group.response.dto';
import { ListAppointmentGroupsQueryDto } from './dto/list-appointment-groups.query.dto';

/**
 * F14 appointment-groups controller. Surfaces the multi-visit case
 * timeline (list + detail) — read-only surface after F18.
 *
 * The `POST /:id/close` route has been removed in F18. Group closure is
 * now handled atomically by `POST /appointments/:id/complete`.
 *
 * Permission gating:
 *   - `GET /appointment-groups`     → any `appointment.read.*` (scope filters list).
 *   - `GET /appointment-groups/:id` → any `appointment.read.*` (scope filters detail).
 */
@ApiTags('appointment-groups')
@Controller('appointment-groups')
export class AppointmentGroupsController {
  constructor(
    private readonly appointmentGroups: AppointmentGroupsService,
  ) {}

  @Get()
  @RequirePermission(
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_ALL,
  )
  @ApiListAppointmentGroups()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentGroupsQueryDto,
  ): Promise<Paginated<AppointmentGroupResponseDto>> {
    return this.appointmentGroups.list(user, {
      page: query.page,
      pageSize: query.pageSize,
      patientId: query.patientId,
      status: query.status,
    });
  }

  @Get(':id')
  @RequirePermission(
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_ALL,
  )
  @ApiGetAppointmentGroup()
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentGroupDetailResponseDto> {
    return this.appointmentGroups.getById(user, id);
  }
}
