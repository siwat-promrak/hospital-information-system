import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

/**
 * F09 appointments module. Front-desk booking + queue management +
 * cancel. Standalone CRUD-ish endpoints (`/appointments`) gated on the
 * scope-aware `appointment.{create|read|update|delete}.{own|own-department|all}`
 * permission family.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
