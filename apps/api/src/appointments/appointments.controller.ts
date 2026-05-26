import {
  Body,
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

import { AppointmentsService } from './appointments.service';
import {
  ApiCancelAppointment,
  ApiCreateAppointment,
  ApiGetAppointment,
  ApiListAppointments,
} from './appointments.swagger';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { AppointmentResponseDto } from './dto/appointment.response.dto';

/**
 * F09 appointments controller. Front-desk booking + queue management.
 *
 * Permission gating per CRUD verb:
 *  - `POST /appointments`              → `appointment.create.{own|own-department}`.
 *  - `GET /appointments`               → any of `appointment.read.{own|own-department|all}`.
 *  - `GET /appointments/:id`           → any of `appointment.read.{own|own-department|all}`.
 *  - `POST /appointments/:id/cancel`   → `appointment.delete.{own|own-department}`.
 */
@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @RequirePermission(
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_ALL,
  )
  @ApiListAppointments()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<Paginated<AppointmentResponseDto>> {
    return this.appointments.list(user, {
      page: query.page,
      pageSize: query.pageSize,
      doctorId: query.doctorId,
      patientId: query.patientId,
      departmentId: query.departmentId,
      from: query.from,
      to: query.to,
      status: query.status,
      order: query.order,
    });
  }

  @Get(':id')
  @RequirePermission(
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_ALL,
  )
  @ApiGetAppointment()
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.getById(user, id);
  }

  @Post()
  @RequirePermission(
    PERMISSION.APPOINTMENT_CREATE_OWN,
    PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  )
  @ApiCreateAppointment()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.create(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(
    PERMISSION.APPOINTMENT_DELETE_OWN,
    PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT,
  )
  @ApiCancelAppointment()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointments.cancel(user, id, dto);
  }
}
