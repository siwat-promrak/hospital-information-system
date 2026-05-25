import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';
import type { AuthenticatedUser } from '../users/users.types';

import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { ListMedicalRecordsQueryDto } from './dto/list-medical-records.query.dto';
import { MedicalRecordResponseDto } from './dto/medical-record.response.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MedicalRecordsService } from './medical-records.service';
import {
  ApiCreateMedicalRecord,
  ApiGetMedicalRecord,
  ApiListMedicalRecords,
  ApiUpdateMedicalRecord,
} from './medical-records.swagger';

/**
 * F11-prep medical records controller. Per the catalog, records are
 * permanent — there is NO delete endpoint by design.
 *
 * Permission gating:
 *  - `GET /medical-records`        → `medical_records.read.all` (scope-less)
 *  - `GET /medical-records/:id`    → `medical_records.read.all`
 *  - `POST /medical-records`       → `medical_records.create.own`
 *    (DOCTOR-only by default; service writes `doctorId = caller.doctor.id`)
 *  - `PATCH /medical-records/:id`  → `medical_records.update.own` OR
 *    `medical_records.update.all` (service enforces scope)
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

  @Post()
  @RequirePermission(PERMISSION.MEDICAL_RECORDS_CREATE_OWN)
  @ApiCreateMedicalRecord()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.medicalRecords.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission(
    PERMISSION.MEDICAL_RECORDS_UPDATE_OWN,
    PERMISSION.MEDICAL_RECORDS_UPDATE_ALL,
  )
  @ApiUpdateMedicalRecord()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.medicalRecords.update(user, id, dto);
  }
}
