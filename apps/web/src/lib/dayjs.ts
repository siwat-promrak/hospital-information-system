/**
 * Single dayjs entry-point for the web app. Imported as a side-effect from
 * the root layout (`apps/web/src/app/[locale]/layout.tsx`) so the plugins
 * register before any client component runs.
 *
 * Plugins enabled here (and only here — register-once, anywhere-else-just-
 * import-`dayjs`):
 *   - `utc` / `timezone` — UTC-aware math + zoned formatting.
 *   - `localizedFormat` — `LT` / `LL` / `LLLL` tokens that follow the
 *      active locale.
 *   - `isSameOrBefore` / `isSameOrAfter` — inclusive comparisons.
 *   - `customParseFormat` — strict format-string parsing (e.g.
 *      `dayjs.utc("2026-05-25 09:00", "YYYY-MM-DD HH:mm")`).
 *
 * Locales `en` + `th` are also imported so `.locale(currentLocale)` switches
 * between them in lockstep with next-intl.
 *
 * Per CLAUDE.md rule 9, `dayjs` is the only allowed surface for date math
 * on the FE. Direct `Date` arithmetic is banned outside of the documented
 * boundary cases (capturing "now" then immediately wrapping, ISO parsing,
 * test fixtures).
 */

import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import localizedFormat from "dayjs/plugin/localizedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/en";
import "dayjs/locale/th";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(customParseFormat);

export { dayjs };
