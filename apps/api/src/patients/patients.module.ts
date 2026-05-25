import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

/**
 * F09 patients module. Front-desk walk-in registration + search.
 * Standalone CRUD-ish endpoints (`/patients`) gated on the existing
 * `patient.*` permission catalog (NURSE + MEDICAL_RECORDS_OFFICER write;
 * DOCTOR + PHARMACY read).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
