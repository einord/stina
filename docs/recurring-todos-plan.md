## Recurring todos implementation plan (temporary, checkable)

### Goals
- [ ] Add recurring templates with clear overlap policy, lead time, and predictable instancing.
- [ ] Enable manual management in Settings → Work and via tools for Stina.
- [ ] Keep scheduler idempotent across restarts.

### Data model
- [ ] New table `recurring_templates`: id, title, description, projectId?, isAllDay, timeOfDay (HH:MM), timezone?, frequency (daily | weekday | weekly + dayOfWeek | monthly + dayOfMonth | custom/cron), leadTimeMinutes, overlapPolicy (skip_if_open | allow_multiple | replace_open), maxAdvanceCount, lastGeneratedDueAt, enabled.
- [ ] `todos` gains `recurringTemplateId` (nullable).
- [ ] Optional defaults for lead time / overlap in settings.

### Scheduler updates
- [ ] Compute next occurrences (respect maxAdvanceCount) per template.
- [ ] Create todo when `now >= occurrence - leadTimeMinutes`.
- [ ] Overlap policy: skip_if_open / allow_multiple / replace_open (cancel open then create).
- [ ] Idempotence: skip if `lastGeneratedDueAt >= occurrence`; update after creating.
- [ ] Respect timezone if set; default to local.

### UI (Settings → Work)
- [ ] Section “Återkommande att göra” listing templates with next due, status, overlap badge.
- [ ] Modal/form: title, description, project, all-day + time, frequency (daily/weekday/weekly/monthly/custom), lead time, overlap policy radio, max advance count, enable/pause toggle.
- [ ] Actions: edit, pause/resume, delete, “create next now” (optional).
- [ ] (Low priority) Badge/link in todo panel showing recurrence/template.

### Tools for Stina
- [ ] Tool commands: `recurring_list`, `recurring_add`, `recurring_update`, `recurring_delete`.
- [ ] Natural-language mapping (e.g., “vardag kl 11:30” → weekday, 11:30, leadTime=0, overlap=skip_if_open).

### Migration + repos
- [ ] Migration to add table + column.
- [ ] Repo API: list/create/update/delete templates, find open todos for template, updateLastGeneratedDueAt.
- [ ] Extend todos repo to accept `recurringTemplateId`.

### Edge cases
- [ ] Monthly day overflow → clamp to last day of month.
- [ ] All-day uses date-only + 00:00; still uses leadTime for creation.
- [ ] Flood protection: maxAdvanceCount + idempotence; optional cleanup of stale items.
- [ ] Pause → skip template.

### Implementation order (happy path)
1. [ ] Migration and types/interfaces.
2. [ ] Repo layer for recurring templates + todo link.
3. [ ] Scheduler logic with overlapPolicy/idempotence.
4. [ ] Tool endpoints for Stina.
5. [ ] Settings UI section (list + modal).
6. [ ] Optional: badge in todo panel.
