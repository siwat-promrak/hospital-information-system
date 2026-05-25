import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { PERMISSION } from "../auth/permissions";
import type { Paginated } from "../common/pagination";
import type { AuthenticatedUser } from "../users/users.types";

import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { ListSchedulesQueryDto } from "./dto/list-schedules.query.dto";
import { ScheduleResponseDto } from "./dto/schedule.response.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";
import { SchedulesService } from "./schedules.service";
import {
  ApiCreateSchedule,
  ApiDeleteSchedule,
  ApiGetSchedule,
  ApiListSchedules,
  ApiUpdateSchedule,
} from "./schedules.swagger";

@ApiTags("schedules")
@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @RequirePermission(
    PERMISSION.SCHEDULE_READ_OWN,
    PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_READ_ALL,
  )
  @ApiListSchedules()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSchedulesQueryDto,
  ): Promise<Paginated<ScheduleResponseDto>> {
    return this.schedules.list(user, {
      page: query.page,
      pageSize: query.pageSize,
      doctorId: query.doctorId,
      departmentId: query.departmentId,
      from: query.from,
      to: query.to,
    });
  }

  @Get(":id")
  @RequirePermission(
    PERMISSION.SCHEDULE_READ_OWN,
    PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_READ_ALL,
  )
  @ApiGetSchedule()
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<ScheduleResponseDto> {
    return this.schedules.getById(user, id);
  }

  @Post()
  @RequirePermission(
    PERMISSION.SCHEDULE_CREATE_OWN,
    PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
  )
  @ApiCreateSchedule()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    return this.schedules.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission(
    PERMISSION.SCHEDULE_UPDATE_OWN,
    PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT,
  )
  @ApiUpdateSchedule()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    return this.schedules.update(user, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(
    PERMISSION.SCHEDULE_DELETE_OWN,
    PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT,
  )
  @ApiDeleteSchedule()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.schedules.softDelete(user, id);
  }
}
