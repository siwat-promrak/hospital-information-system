import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import { MAX_PAGE_SIZE, PAGE_SIZE_ALL } from '../pagination.const';

/**
 * `pageSize` accepts EITHER an integer in `[1, MAX_PAGE_SIZE]` OR the
 * literal sentinel string `PAGE_SIZE_ALL` ("all"). Standard
 * `@IsInt() @Min(1) @Max(MAX_PAGE_SIZE)` chains reject the string outright,
 * so this custom validator implements the union case once for every
 * paginated endpoint to consume via `@IsPageSize()`.
 *
 * The companion `@Transform` on the DTO keeps `"all"` as a string while
 * coercing every other input to a `Number`, so by the time this validator
 * runs the value is either:
 *   - `PAGE_SIZE_ALL` (string), or
 *   - a finite number (possibly `NaN` if coercion failed).
 *
 * `NaN` / non-integer / out-of-range numbers are rejected.
 */
export function IsPageSize(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isPageSize',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value === PAGE_SIZE_ALL) {
            return true;
          }

          if (typeof value !== 'number') {
            return false;
          }

          if (!Number.isFinite(value) || !Number.isInteger(value)) {
            return false;
          }

          return value >= 1 && value <= MAX_PAGE_SIZE;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be an integer between 1 and ${MAX_PAGE_SIZE}, or the string "${PAGE_SIZE_ALL}".`;
        },
      },
    });
  };
}
