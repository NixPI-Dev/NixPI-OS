---
id: schema/event
schema_version: 1
type: concept
object_type: schema
title: Schema - Event
domain: personal
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for event objects — scheduled time-bound commitments that are not meetings.
---

# Schema: Event

An event is a scheduled commitment: an appointment, trip segment, deadline, or time-block. For structured conversations with decisions and follow-ups, use the `meeting` object type instead.

## Required fields

| field | value |
|---|---|
| `id` | `event/<slug>-YYYY-MM-DD` |
| `schema_version` | `1` |
| `type` | `event` |
| `object_type` | `event` |
| `title` | descriptive title |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `scheduled`, `done`, or `cancelled` |
| `start` | ISO datetime `YYYY-MM-DD HH:MM` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | what, when, and why in one sentence |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `seed` |
| `end` | datetime | ISO |
| `location` | string | |
| `completed` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | |
| `people` | `person/*` | |
| `related` | any | |

## Status values

- `scheduled` — future event
- `done` — event has happened
- `cancelled` — will not happen

## Recommended body sections

- `## Purpose`
- `## Notes`
- `## Related`

## Example

```yaml
id: event/dentist-appointment-2026-05-10
schema_version: 1
type: event
object_type: event
title: Dentist Appointment - 2026-05-10
domain: personal
areas: [health]
status: scheduled
validation_level: seed
start: 2026-05-10 09:00
end: 2026-05-10 10:00
location: City Centre Clinic
created: 2026-04-21
updated: 2026-04-21
people: [person/operator]
related: [area/health]
summary: Routine dental check-up on 2026-05-10 at City Centre Clinic.
```
