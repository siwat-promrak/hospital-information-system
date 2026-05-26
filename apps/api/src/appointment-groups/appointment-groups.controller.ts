import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
  ApiCloseAppointmentGroup,
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
 * timeline + the doctor-only "close case" action.
 *
 * Permission gating:
 *   - `GET /appointment-groups`             → any `appointment.read.*` (scope filters list).
 *   - `GET /appointment-groups/:id`         → any `appointment.read.*` (scope filters detail).
 *   - `POST /appointment-groups/:id/close`  → any `appointment.update.*`; service further
 *                                             rejects with `403 APPOINTMENT_GROUP_CLOSE_FORBIDDEN`
 *                                             unless the caller is the doctor of the latest
 *                                             non-cancelled visit.
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

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(
    PERMISSION.APPOINTMENT_UPDATE_OWN,
    PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT,
  )
  @ApiCloseAppointmentGroup()
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentGroupDetailResponseDto> {
    return this.appointmentGroups.close(user, id);
  }
}
