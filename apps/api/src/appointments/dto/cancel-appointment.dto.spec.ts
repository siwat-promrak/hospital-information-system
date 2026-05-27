import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CancelAppointmentDto } from './cancel-appointment.dto';

/**
 * Replicates the global ValidationPipe transform options so this unit
 * test exercises the same pipeline the controller runs through.
 */
function toDto(raw: Record<string, unknown>): CancelAppointmentDto {
  return plainToInstance(CancelAppointmentDto, raw, {
    enableImplicitConversion: true,
  });
}

describe('CancelAppointmentDto', () => {
  it('accepts a non-empty reason', () => {
    const dto = toDto({ cancellationReason: 'Patient no-show' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.cancellationReason).toBe('Patient no-show');
  });

  it('trims surrounding whitespace before validating', () => {
    const dto = toDto({ cancellationReason: '  Patient no-show  ' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.cancellationReason).toBe('Patient no-show');
  });

  it('rejects an empty string with IsNotEmpty', () => {
    const dto = toDto({ cancellationReason: '' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cancellationReason');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('rejects a whitespace-only string (trimmed → empty)', () => {
    const dto = toDto({ cancellationReason: '   ' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cancellationReason');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('rejects a missing cancellationReason (undefined)', () => {
    const dto = toDto({});
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cancellationReason');
  });

  it('rejects a reason longer than 4000 characters', () => {
    const dto = toDto({ cancellationReason: 'x'.repeat(4001) });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cancellationReason');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });
});
