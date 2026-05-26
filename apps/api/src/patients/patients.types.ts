import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `PatientsService#list`.
 *
 * `q` is a free-text search across `firstNameEn` / `lastNameEn` /
 * `firstNameTh` / `lastNameTh` / `phone` / `identificationNo` / `hn`
 * (case-insensitive `contains`). Missing `q` returns the unfiltered
 * paginated list ordered by `createdAt DESC`.
 */
export interface ListPatientsArgs extends PaginationParams {
  q?: string;
}
