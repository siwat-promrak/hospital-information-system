import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PERMISSION } from '../auth/permissions';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  PaginationQueryDto,
  type Paginated,
} from '../common/pagination';

import { DepartmentsService } from './departments.service';
import { ApiListDepartments } from './departments.swagger';
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
}
