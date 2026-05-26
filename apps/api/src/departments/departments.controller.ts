import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import {
  PaginationQueryDto,
  type Paginated,
} from '../common/pagination';

import { DepartmentsService } from './departments.service';
import {
  ApiListDepartmentAppointmentTypes,
  ApiListDepartments,
} from './departments.swagger';
import type { DepartmentAppointmentTypeResponseDto } from './dto/department-appointment-type.response.dto';
import { DepartmentResponseDto } from './dto/department.response.dto';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission(PERMISSION.DOCTOR_READ)
  @ApiListDepartments()
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DepartmentResponseDto>> {
    return this.departments.listAll({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * F13 — per-(department, type) booking rules catalog. Returns one row
   * per `department_appointment_types` entry for the chosen department
   * with `code` + `label` + `durationMinutes` + nullable booking window.
   *
   * Gated on the `appointment.read.*` family (any-of). DOCTOR (`.own`),
   * NURSE (`.own-department`), MEDICAL_RECORDS_OFFICER (`.all`), and
   * PHARMACY (`.all`) all hold one of these; ADMIN does NOT by default
   * (they self-grant via `role.update` if needed).
   */
  @Get(':id/appointment-types')
  @RequirePermission(
    PERMISSION.APPOINTMENT_READ_OWN,
    PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT,
    PERMISSION.APPOINTMENT_READ_ALL,
  )
  @ApiListDepartmentAppointmentTypes()
  listAppointmentTypes(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DepartmentAppointmentTypeResponseDto[]> {
    return this.departments.listAppointmentTypes(id);
  }
}
