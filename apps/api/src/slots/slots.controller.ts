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
 * Permission gating (any-of) — mirrors the FE sidebar gate so the
 * widest-scope-wins resolver in the service can rely on the route guard
 * having let through every shape of authorised caller:
 *  - `appointment.create.own` — DOCTOR self-booking probes their own row.
 *  - `appointment.create.own-department` — NURSE probes any doctor in
 *    their own department.
 *  - `schedule.read.all` — MRO (cross-department read role) uses the
 *    slot finder as a read-only visibility tool.
 *  - `schedule.read.own-department` — F15 widening: a DOCTOR with this
 *    code (DOCTOR + NURSE both hold it in the seeded baseline) may
 *    enumerate slots for any doctor in their own department — the
 *    "dept" half of US-15.2's `OWN_PLUS_DEPT` toggle. The service-layer
 *    `assertScope` re-validates the department match.
 *  - `schedule.read.own` — symmetric tail; today only matters in
 *    combination with the above codes but the route guard accepts it so
 *    a future role with only this code wouldn't be silently blocked.
 *
 * PHARMACY remains excluded — they hold none of these codes. ADMIN holds
 * none by default.
 *
 * Scope: a NURSE caller can only query slots for doctors in their own
 * department; a DOCTOR caller may enumerate any doctor in their own
 * department (read scope) AND query themselves cross-department for
 * cross-coverage probes (write/read `.own` scope). A `schedule.read.all`
 * caller is implicitly `SCOPE.ALL` here with no doctor / department
 * narrowing. Out-of-scope requests return
 * `403 INSUFFICIENT_PERMISSION_SCOPE` so probing for foreign doctors
 * does not leak existence.
 */
@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @RequirePermission(
    PERMISSION.APPOINTMENT_CREATE_OWN,
    PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_READ_ALL,
    PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
    PERMISSION.SCHEDULE_READ_OWN,
  )
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
