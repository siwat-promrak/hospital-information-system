import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

/**
 * F07 part 2 — slot finder. Mounts `GET /slots` via a standalone
 * controller so the F05 doctors module's controller stays untouched.
 * `doctorId` is one of four mandatory query params alongside
 * `departmentId` / `date` / `type`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
