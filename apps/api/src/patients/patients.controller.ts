import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { Paginated } from '../common/pagination';
import type { AuthenticatedUser } from '../users/users.types';

import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { PatientResponseDto } from './dto/patient.response.dto';
import { PatientsService } from './patients.service';
import { ApiCreatePatient, ApiGetPatient, ApiListPatients } from './patients.swagger';

/**
 * F09 patients controller. Front-desk walk-in registration + search.
 *
 * Permission gating:
 *  - `POST /patients`    → `patient.create` (NURSE + MRO by default).
 *  - `GET /patients`     → `patient.read` (DOCTOR + NURSE + MRO + PHARMACY).
 *  - `GET /patients/:id` → `patient.read` (same gate as the list).
 */
@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermission(PERMISSION.PATIENT_READ)
  @ApiListPatients()
  list(
    @Query() query: ListPatientsQueryDto,
  ): Promise<Paginated<PatientResponseDto>> {
    return this.patients.list({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSION.PATIENT_READ)
  @ApiGetPatient()
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PatientResponseDto> {
    return this.patients.getById(id);
  }

  @Post()
  @RequirePermission(PERMISSION.PATIENT_CREATE)
  @ApiCreatePatient()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePatientDto,
  ): Promise<PatientResponseDto> {
    return this.patients.create(user, dto);
  }
}
