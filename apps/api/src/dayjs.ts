/**
 * dayjs plugin registration (BE side — see Rule 9 in `CLAUDE.md`).
 *
 * Imported exactly once from `apps/api/src/main.ts` so every plugin is
 * registered BEFORE any request handler runs. Pure side-effect module — no
 * exports. Importing `dayjs` elsewhere transparently picks up the loaded
 * plugins because dayjs mutates the prototype.
 *
 * Plugins enabled here mirror the FE setup in
 * `apps/web/src/lib/dayjs.ts` so cross-tier date math stays interchangeable:
 *
 *  - `utc`               — UTC-safe arithmetic (BE math runs in UTC).
 *  - `timezone`          — needed by callers that translate UTC → tz.
 *  - `localizedFormat`   — `LL` / `LLL` / `LT` tokens.
 *  - `isSameOrBefore`    — past-schedule guard (`isSameOrBefore(now)`).
 *  - `isSameOrAfter`     — counterpart for "future-only" checks.
 *  - `customParseFormat` — explicit format parsing (`YYYY-MM-DD`).
 */
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(customParseFormat);
