import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';

import { DoctorsService } from './doctors.service';
import { ApiGetDoctor, ApiListDoctors } from './doctors.swagger';
import {
  DoctorDetailDto,
  DoctorDto,
  ListDoctorsQueryDto,
} from './dto/doctor.dto';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @RequirePermission(PERMISSION.DOCTOR_LIST)
  @ApiListDoctors()
  list(@Query() query: ListDoctorsQueryDto): Promise<Paginated<DoctorDto>> {
    return this.doctors.listAll({
      page: query.page,
      pageSize: query.pageSize,
      departmentId: query.departmentId,
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSION.DOCTOR_READ)
  @ApiGetDoctor()
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DoctorDetailDto> {
    return this.doctors.getById(id);
  }
}
