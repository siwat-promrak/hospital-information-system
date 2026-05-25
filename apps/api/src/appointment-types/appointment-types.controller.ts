import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSION } from '../auth/permissions';

import { APPOINTMENT_TYPE_CATALOG } from './appointment-types.const';
import { ApiListAppointmentTypes } from './appointment-types.swagger';
import { AppointmentTypeResponseDto } from './dto/appointment-type.response.dto';

/**
 * `GET /appointment-types` — surfaces the per-`AppointmentType` duration
 * map (and English label) for the booking-wizard type picker. The catalog
 * is static (lives in `appointment-types.const.ts`) so the controller is a
 * one-liner.
 *
 * Gated on `appointment.create.own-department` because the only consumer
 * is the booker UI about to mint an appointment. NURSE holds it by
 * default; ADMIN / MEDICAL_RECORDS_OFFICER / PHARMACY do NOT — they must
 * self-grant via `permission.assign` (US-11.5) to probe this endpoint.
 */
@ApiTags('appointment-types')
@Controller('appointment-types')
export class AppointmentTypesController {
  @Get()
  @RequirePermission(PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT)
  @ApiListAppointmentTypes()
  list(): AppointmentTypeResponseDto[] {
    // Spread so the controller returns a fresh array (callers may mutate
    // it without leaking the change back into the frozen catalog).
    return [...APPOINTMENT_TYPE_CATALOG];
  }
}
