---
id: schema/meeting
schema_version: 1
type: concept
object_type: schema
title: Schema - Meeting
domain: technical
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for meeting objects — structured time-bound conversations with decisions and follow-ups.
---

# Schema: Meeting

A meeting note records what was discussed, what was decided, and what needs to happen next. Meetings live in `pages/planner/calendar/`.

## Required fields

| field | value |
|---|---|
| `id` | `meeting/<slug>-YYYY-MM-DD` |
| `schema_version` | `1` |
| `type` | `event` |
| `object_type` | `meeting` |
| `title` | descriptive title including date |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `scheduled`, `done`, or `cancelled` |
| `start` | ISO datetime `YYYY-MM-DD HH:MM` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | purpose + expected outcome in one sentence |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `hosts` | array | if host-specific |
| `validation_level` | enum | default: `seed` |
| `end` | datetime | ISO |
| `location` | string | physical or virtual |
| `completed` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | which project this belongs to |
| `people` | `person/*` | attendees |
| `systems` | `host/*` or `service/*` | relevant systems |
| `related` | any | related notes |

## Status values

- `scheduled` — future meeting
- `done` — meeting has happened
- `cancelled` — will not happen

## Recommended body sections

- `## Agenda`
- `## Notes`
- `## Decisions`
- `## Follow-ups`
- `## Related`

## Example

```yaml
id: meeting/nixpi-weekly-sync-2026-04-25
schema_version: 1
type: event
object_type: meeting
title: NixPI Weekly Sync - 2026-04-25
domain: technical
areas: [infrastructure, knowledge-system]
status: scheduled
validation_level: seed
start: 2026-04-25 10:00
end: 2026-04-25 10:30
location: Virtual
created: 2026-04-21
updated: 2026-04-21
projects: [project/nixpi]
people: [person/operator]
summary: Weekly sync to review the wiki build, migration plan, and NixPI next steps.
```
