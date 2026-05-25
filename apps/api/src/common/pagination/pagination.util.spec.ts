import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_ALL,
} from './pagination.const';
import { buildPaginatedResponse, resolvePagination } from './pagination.util';

describe('pagination.util — resolvePagination', () => {
  it('returns defaults when input is undefined', () => {
    const r = resolvePagination();

    expect(r.page).toBe(DEFAULT_PAGE);
    expect(r.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(r.skip).toBe(0);
    expect(r.take).toBe(DEFAULT_PAGE_SIZE);
  });

  it('echoes a valid numeric page/pageSize', () => {
    const r = resolvePagination({ page: 3, pageSize: 25 });

    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(25);
    expect(r.skip).toBe(50);
    expect(r.take).toBe(25);
  });

  it('clamps pageSize to MAX_PAGE_SIZE', () => {
    const r = resolvePagination({ page: 1, pageSize: MAX_PAGE_SIZE + 100 });

    expect(r.pageSize).toBe(MAX_PAGE_SIZE);
    expect(r.take).toBe(MAX_PAGE_SIZE);
  });

  it('returns the "all" sentinel with take=undefined when pageSize=all', () => {
    const r = resolvePagination({ page: 7, pageSize: PAGE_SIZE_ALL });

    expect(r.pageSize).toBe(PAGE_SIZE_ALL);
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.take).toBeUndefined();
  });

  it('forces page=1 when pageSize=all, even if caller passed page>1', () => {
    const r = resolvePagination({ page: 99, pageSize: PAGE_SIZE_ALL });

    expect(r.page).toBe(1);
  });
});

describe('pagination.util — buildPaginatedResponse', () => {
  it('echoes page/pageSize and computes totalPages for numeric pageSize', () => {
    const resolved = { page: 2, pageSize: 10 } as const;
    const res = buildPaginatedResponse(['a', 'b'], 25, resolved);

    expect(res.data).toEqual(['a', 'b']);
    expect(res.total).toBe(25);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(10);
    expect(res.totalPages).toBe(3);
  });

  it('clamps totalPages to >= 1 when total = 0', () => {
    const res = buildPaginatedResponse([], 0, { page: 1, pageSize: 20 });

    expect(res.totalPages).toBe(1);
  });

  it('echoes pageSize=total and totalPages=1 when pageSize=all', () => {
    const resolved = { page: 1, pageSize: PAGE_SIZE_ALL } as const;
    const data = [1, 2, 3, 4, 5];
    const res = buildPaginatedResponse(data, 5, resolved);

    expect(res.data).toEqual(data);
    expect(res.total).toBe(5);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(5);
    expect(res.totalPages).toBe(1);
  });

  it('echoes pageSize=0 when pageSize=all and total=0', () => {
    const resolved = { page: 1, pageSize: PAGE_SIZE_ALL } as const;
    const res = buildPaginatedResponse([], 0, resolved);

    expect(res.pageSize).toBe(0);
    expect(res.totalPages).toBe(1);
  });
});
