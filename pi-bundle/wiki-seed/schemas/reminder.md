---
id: schema/reminder
schema_version: 1
type: concept
object_type: schema
title: Schema - Reminder
domain: personal
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for reminder objects — time-based prompts that are not full tasks or events.
---

# Schema: Reminder

A reminder is a lightweight time-based prompt. Use it for follow-ups, renewal notices, scheduled check-backs, or anything that needs to surface at a future date without becoming a full task.

## Required fields

| field | value |
|---|---|
| `id` | `reminder/<slug>-YYYY-MM-DD` |
| `schema_version` | `1` |
| `type` | `reminder` |
| `object_type` | `reminder` |
| `title` | description of what to remember |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `open`, `snoozed`, `done`, or `cancelled` |
| `remind_at` | ISO datetime `YYYY-MM-DD HH:MM` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | what to do and when in one sentence |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `seed` |
| `snooze_until` | datetime | ISO |
| `for` | string | plain text description of the reason |
| `completed` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | |
| `people` | `person/*` | |
| `related` | any | |

## Status values

- `open` — active, waiting for its time
- `snoozed` — deferred, see `snooze_until`
- `done` — actioned
- `cancelled` — no longer needed

## Recommended body sections

- `## Context`
- `## What to do`
- `## Related`

## Example

```yaml
id: reminder/review-wiki-structure-2026-05-21
schema_version: 1
type: reminder
object_type: reminder
title: Review Wiki Structure - 2026-05-21
domain: personal
areas: [knowledge-system, organisation]
status: open
validation_level: seed
remind_at: 2026-05-21 09:00
for: Check whether the current schema still feels natural after real use.
created: 2026-04-21
updated: 2026-04-21
related: [home/start-here, concept/object-based-knowledge-system]
summary: Reminder to revisit the wiki structure after a month of real usage to spot friction.
```
