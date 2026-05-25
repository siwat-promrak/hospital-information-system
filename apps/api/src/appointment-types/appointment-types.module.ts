import { Module } from '@nestjs/common';

import { AppointmentTypesController } from './appointment-types.controller';

/**
 * F07 part 1 — `GET /appointment-types`. Pure controller, no service, no
 * Prisma dependency: the catalog is application-code constant. The matching
 * slot finder (`GET /slots`) lives in its own `SlotsModule`.
 */
@Module({
  controllers: [AppointmentTypesController],
})
export class AppointmentTypesModule {}
