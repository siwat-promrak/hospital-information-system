import { ApiProperty } from '@nestjs/swagger';

/**
 * Wire DTO for one open slot returned by `GET /slots`.
 *
 * The response is a flat array of these — no pagination envelope, no
 * count: a single calendar day rarely produces more than a few dozen
 * slots, and the FE consumes the full list to render the picker grid.
 *
 * `departmentId` is echoed back so the booker UI can pass it verbatim
 * into the `POST /appointments` payload (the spec mandates
 * `Appointment.departmentId` is inherited from the chosen schedule, not
 * looked up from the doctor — a doctor may span departments).
 */
export class SlotResponseDto {
  @ApiProperty({
    example: '2026-06-15T09:00:00.000Z',
    description: 'Slot start (ISO 8601 UTC, inclusive).',
  })
  startAt!: string;

  @ApiProperty({
    example: '2026-06-15T09:20:00.000Z',
    description:
      'Slot end (ISO 8601 UTC, exclusive). Equal to `startAt + APPOINTMENT_TYPE_DURATION_MINUTES[type]`.',
  })
  endAt!: string;

  @ApiProperty({
    example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9',
    description:
      'Department of the owning `DoctorSchedule`. Echoed so the booker UI ' +
      'can pass it back to `POST /appointments`.',
  })
  departmentId!: string;
}
