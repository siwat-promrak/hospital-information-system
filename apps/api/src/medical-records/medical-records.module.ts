import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';

/**
 * F11-prep medical records module. Standalone CRUD-ish endpoints
 * (`/medical-records`) gated by the new `medical_records.*` permission
 * catalog. Records are PERMANENT — no `DELETE` endpoint by design.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService],
  exports: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
