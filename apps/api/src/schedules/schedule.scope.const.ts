/**
 * Write-verb discriminator consumed by `assertCanActOnDoctor` so the scope
 * resolution stays per-verb (post the Item-1 fix). DOCTOR holds READ scope
 * `.own-department` for cross-coverage visibility but only `.own` on the
 * write verbs — a single combined resolver would conflate the two, so the
 * mutation paths pass the verb explicitly.
 *
 * Re-using `PERMISSION.SCHEDULE_*_OWN` codes here as values would couple
 * the discriminator to the wire-string format; the standalone catalog keeps
 * the verbs UPPER_SNAKE so the consumer reads as `SCHEDULE_VERB.CREATE`.
 */
export const SCHEDULE_VERB = {
  READ: 'READ',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;

export type ScheduleVerb = (typeof SCHEDULE_VERB)[keyof typeof SCHEDULE_VERB];
