import { Module } from '@nestjs/common';

import { MedicalRecordsModule } from '../medical-records/medical-records.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

/**
 * F09 appointments module. Front-desk booking + queue management +
 * cancel. Standalone CRUD-ish endpoints (`/appointments`) gated on the
 * scope-aware `appointment.{create|read|update|delete}.{own|own-department|all}`
 * permission family.
 *
 * F17 — imports `MedicalRecordsModule` so `AppointmentsService` can inject
 * `MedicalRecordsService.createInsideTx` for the workspace-action endpoints.
 */
@Module({
  imports: [PrismaModule, MedicalRecordsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
