import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Request body for `POST /appointments/:id/refer` (F14 — US-14.4).
 *
 * Atomic action invoked by the appointment's doctor at the end of a
 * visit when deciding to send the patient to another specialist.
 * The service sets `status = COMPLETED`, `referredToDepartmentId =
 * toDepartmentId`, and `referredAt = now()` in one transaction. The
 * group stays open — closing is the separate "complete + close"
 * action (`POST /appointment-groups/:id/close`).
 */
export class ReferAppointmentDto {
  @ApiProperty({
    example: 'bb3d2f17-3c0b-4b4f-a3e8-31f2bbb55ccc',
    description:
      'Destination department id. Free choice — any valid `departmentId` ' +
      'is accepted (the patient may have never visited the destination ' +
      'department before). FK existence is validated by the service.',
  })
  @IsUUID()
  toDepartmentId!: string;
}
