import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AppointmentGroupsController } from './appointment-groups.controller';
import { AppointmentGroupsService } from './appointment-groups.service';

/**
 * F14 appointment-groups module. Provides the case-timeline view +
 * close-case mutation. Groups are materialised lazily inside the
 * appointments module's create transaction — there is no standalone
 * "open group" endpoint here.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AppointmentGroupsController],
  providers: [AppointmentGroupsService],
  exports: [AppointmentGroupsService],
})
export class AppointmentGroupsModule {}
