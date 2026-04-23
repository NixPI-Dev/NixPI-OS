# Schema: task

object_type: task
type: task
home: pages/planner/tasks/

## Required fields

| field | value |
|---|---|
| `id` | `task/<slug>` |
| `schema_version` | `1` |
| `type` | `task` |
| `object_type` | `task` |
| `title` | task name |
| `domain` | `personal` or `technical` |
| `status` | `open` / `in-progress` / `waiting` / `done` / `cancelled` |
| `priority` | `low` / `medium` / `high` |
| `summary` | action + why it matters sentence |

## Optional fields

| field | description |
|---|---|
| `due` | ISO date |
| `scheduled` | ISO date |
| `schedule` | recurrence string e.g. `every sunday` |
| `depends_on` | blocking task IDs |
| `blocked_by` | blocker IDs |
| `completed` | ISO date |
| `projects` | related project IDs |
| `people` | related person IDs |

## No review cycle for tasks

## Template structure

```markdown
# Task Name

## Outcome

## Next action

## Notes

## Related
```
