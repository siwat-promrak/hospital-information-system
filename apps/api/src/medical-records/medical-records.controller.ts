import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';

import { ListMedicalRecordsQueryDto } from './dto/list-medical-records.query.dto';
import { MedicalRecordResponseDto } from './dto/medical-record.response.dto';
import { MedicalRecordsService } from './medical-records.service';
import {
  ApiGetMedicalRecord,
  ApiListMedicalRecords,
} from './medical-records.swagger';

/**
 * F18-updated medical records controller. Records are write-once and
 * created exclusively inside appointment-action transactions. The
 * standalone `POST /medical-records` and `PATCH /medical-records/:id`
 * routes have been removed — only read-only endpoints remain.
 *
 * Permission gating:
 *  - `GET /medical-records`     → `medical_records.read.all` (scope-less)
 *  - `GET /medical-records/:id` → `medical_records.read.all`
 */
@ApiTags('medical-records')
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly medicalRecords: MedicalRecordsService) {}

  @Get()
  @RequirePermission(PERMISSION.MEDICAL_RECORDS_READ_ALL)
  @ApiListMedicalRecords()
  list(
    @Query() query: ListMedicalRecordsQueryDto,
  ): Promise<Paginated<MedicalRecordResponseDto>> {
    return this.medicalRecords.list({
      page: query.page,
      pageSize: query.pageSize,
      patientId: query.patientId,
      doctorId: query.doctorId,
      appointmentId: query.appointmentId,
      appointmentGroupId: query.appointmentGroupId,
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSION.MEDICAL_RECORDS_READ_ALL)
  @ApiGetMedicalRecord()
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MedicalRecordResponseDto> {
    return this.medicalRecords.getById(id);
  }
}
