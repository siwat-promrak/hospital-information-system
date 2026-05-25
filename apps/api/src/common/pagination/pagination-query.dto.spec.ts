import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { PaginationQueryDto } from './pagination-query.dto';
import {
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
} from './pagination.const';

/**
 * Replicates the global ValidationPipe transform options so the unit
 * test exercises the same pipeline the controllers run through.
 */
function toDto(raw: Record<string, unknown>): PaginationQueryDto {
  return plainToInstance(PaginationQueryDto, raw, {
    enableImplicitConversion: true,
  });
}

describe('PaginationQueryDto / @IsPageSize', () => {
  it('accepts pageSize as an integer string and coerces to number', () => {
    const dto = toDto({ pageSize: '20' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.pageSize).toBe(20);
  });

  it('accepts pageSize as PAGE_SIZE_ALL string', () => {
    const dto = toDto({ pageSize: PAGE_SIZE_ALL });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.pageSize).toBe(PAGE_SIZE_ALL);
  });

  it('rejects pageSize=0', () => {
    const dto = toDto({ pageSize: '0' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects pageSize above MAX_PAGE_SIZE', () => {
    const dto = toDto({ pageSize: String(MAX_PAGE_SIZE + 1) });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects an arbitrary string that is not PAGE_SIZE_ALL', () => {
    const dto = toDto({ pageSize: 'foo' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects a non-integer numeric value', () => {
    const dto = toDto({ pageSize: '1.5' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects PAGE_SIZE_ALL in upper-case (sentinel is lowercase-exact)', () => {
    const dto = toDto({ pageSize: 'ALL' });
    const errors = validateSync(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('treats omitted pageSize as undefined (valid)', () => {
    const dto = toDto({});
    const errors = validateSync(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.pageSize).toBeUndefined();
  });
});
