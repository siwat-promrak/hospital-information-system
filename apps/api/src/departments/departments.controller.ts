import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  PaginationQueryDto,
  type Paginated,
} from '../common/pagination';

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
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DepartmentDto>> {
    return this.departments.listAll({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id/doctors')
  @RequirePermission(PERMISSION.DOCTOR_LIST)
  @ApiListDepartmentDoctors()
  listDoctors(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<DepartmentDoctorDto>> {
    return this.departments.listDoctorsForDepartment(id, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
