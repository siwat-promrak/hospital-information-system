import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { DepartmentsService } from './departments.service';
import {
  ApiListDepartmentDoctors,
  ApiListDepartments,
} from './departments.swagger';
import {
  DepartmentDoctorDto,
  DepartmentDto,
} from './dto/department.dto';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission(PERMISSION.DOCTOR_LIST)
  @ApiListDepartments()
  list(): Promise<DepartmentDto[]> {
    return this.departments.listAll();
  }

  @Get(':id/doctors')
  @RequirePermission(PERMISSION.DOCTOR_LIST)
  @ApiListDepartmentDoctors()
  listDoctors(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DepartmentDoctorDto[]> {
    return this.departments.listDoctorsForDepartment(id);
  }
}
