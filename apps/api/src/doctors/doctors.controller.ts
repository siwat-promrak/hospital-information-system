import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';

import { DoctorsService } from './doctors.service';
import { ApiGetDoctor, ApiListDoctors } from './doctors.swagger';
import {
  DoctorDetailResponseDto,
  DoctorResponseDto,
} from './dto/doctor.response.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors.query.dto';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @RequirePermission(PERMISSION.DOCTOR_READ)
  @ApiListDoctors()
  list(@Query() query: ListDoctorsQueryDto): Promise<Paginated<DoctorResponseDto>> {
    return this.doctors.listAll({
      page: query.page,
      pageSize: query.pageSize,
      departmentId: query.departmentId,
      q: query.q,
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSION.DOCTOR_READ)
  @ApiGetDoctor()
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DoctorDetailResponseDto> {
    return this.doctors.getById(id);
  }
}
