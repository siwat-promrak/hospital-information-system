import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';
import type { AuthenticatedUser } from '../users/users.types';

import { FindSlotsQueryDto } from './dto/find-slots.query.dto';
import { SlotResponseDto } from './dto/slot.response.dto';
import { SlotsService } from './slots.service';
import { ApiFindSlots } from './slots.swagger';

/**
 * Mounted under `/slots` as a flat resource — the doctor isn't more
 * fundamental than the other three required filters
 * (`departmentId` / `date` / `type`), so promoting `doctorId` to a query
 * param matches the rest of the API surface (`/doctors`, `/schedules`,
 * `/appointment-types`, `/medical-records` are all flat) and removes the
 * nested-resource intrusion where the controller previously borrowed
 * `@Controller('doctors')`.
 *
 * Permission gating: `appointment.create.own-department` — the caller is
 * about to book, so the same code that guards `POST /appointments` (F08)
 * guards the probe too. NURSE holds it by default; ADMIN does NOT.
 *
 * Scope: a NURSE caller can only query slots for doctors in their own
 * department. Cross-department requests return `403
 * INSUFFICIENT_PERMISSION_SCOPE` so probing for foreign doctors does not
 * leak existence.
 */
@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @RequirePermission(PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT)
  @ApiFindSlots()
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindSlotsQueryDto,
  ): Promise<SlotResponseDto[]> {
    return this.slots.findSlots(user, {
      doctorId: query.doctorId,
      departmentId: query.departmentId,
      date: query.date,
      type: query.type,
    });
  }
}
