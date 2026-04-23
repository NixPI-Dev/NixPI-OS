---
name: wiki
description: >
  Manage the plain-Markdown wiki roots at ~/NixPI/wiki/technical and
  ~/NixPI/wiki/personal. Use for daily note creation, task capture and
  updates, showing today's agenda, weekly review, archiving, linting, and any
  general wiki operation. Loads schema and context automatically. Works
  alongside qmd for full-text search.
---

# Wiki Operations Skill

Daily wiki management. Covers capture, planning, review, and maintenance.

## Paths

| Role | Path |
|---|---|
| Technical wiki | `~/NixPI/wiki/technical` |
| Personal wiki | `~/NixPI/wiki/personal` |
| Schema | `<wiki-root>/WIKI_SCHEMA.md` |
| Rules | `<wiki-root>/WIKI_RULES.md` |
| Object model | `<wiki-root>/WIKI_OBJECT_MODEL.md` |
| Object schemas | `<wiki-root>/schemas/<object_type>.md` |
| Templates | `<wiki-root>/templates/markdown/` |
| Controlled tags | `<wiki-root>/meta/tags.md` |
| Relation types | `<wiki-root>/meta/relation-types.md` |
| Registry | `<wiki-root>/meta/registry.json` |
| Log | `<wiki-root>/meta/log.md` |

---

## Session start

Always do this at the start of a wiki session:

```bash
wiki_status
```

The planner digest in the system prompt already shows today's agenda.
Read it before asking the user what they want.

---

## Daily note

Create or open today's daily note:

```
wiki_ensure_page type=journal title=YYYY-MM-DD
```

Replace `YYYY-MM-DD` with today's date.

The note will be created at `pages/journal/daily/YYYY-MM-DD.md`.

If the note already exists, `wiki_ensure_page` resolves and returns its path.

---

## Capture a task

```
wiki_ensure_page type=task object_type=task title="Task title" domain=personal summary="One-line summary"
```

Then open the file and fill in:
- `due:` if there is a deadline
- `schedule:` if recurring (e.g. `every sunday`)
- `priority:` low / medium / high
- `projects:` if linked to a project

---

## Capture an event or meeting

```
wiki_ensure_page type=event object_type=meeting title="Meeting name" domain=technical
```

Then fill in `start:`, `end:`, `location:`, `people:`.

---

## Capture a reminder

```
wiki_ensure_page type=reminder title="Reminder text" domain=personal
```

Then fill in `remind_at: YYYY-MM-DD HH:MM` and `for:` context.

---

## Capture a raw note

For rough input that needs processing later:

```
wiki_capture input_type=text value="..." title="Optional title" domain=personal
```

This lands in `raw/` and gets a source page at `pages/sources/`.

---

## Show today's agenda

The planner digest in the system prompt already covers:
- today's daily note
- overdue tasks
- tasks due today and this week
- upcoming events
- open reminders

If you need more detail, use:

```
wiki_search type=task domain=personal
wiki_search type=event domain=personal
wiki_search type=reminder domain=personal
```

Or search by object_type:

```
wiki_search object_type=task query="open"
```

Or use qmd for full-text search:

```bash
qmd search "due today" -c wiki --files
```

---

## Mark a task done

1. Read the task file
2. Set `status: done`
3. Set `completed: YYYY-MM-DD`
4. If it has `schedule:`, create the next occurrence

### Recurring task — next occurrence

When a scheduled task is marked done:

1. Compute the next date based on `schedule:`
   - `every sunday` → next Sunday
   - `every thursday` → next Thursday
   - `every N days` → today + N
2. Create a new task file with the same title, `status: open`, new `due:` date
3. Log the completion

---

## Weekly review

1. Read today's date and the past week's daily notes
2. Summarise: wins, friction, open tasks, completed tasks
3. Create a review note:

```
wiki_ensure_page type=journal object_type=review title="Weekly Review YYYY-MM-DD" domain=personal
```

4. Fill in: wins, friction, lessons, next focus

---

## Archive a done task or project

Move inactive notes to `pages/archives/`:

1. Read the file
2. Update `status: archived`
3. Move to `pages/archives/<section>/<slug>.md`
4. Update the registry

---

## Lint the wiki

```
wiki_lint mode=all
```

Common issues to fix:
- `frontmatter` errors → fix missing or invalid fields
- `orphan` warnings → link the note from somewhere relevant
- `coverage` warnings → add `source_ids:` or update the note
- `staleness` → process captured sources

---

## Search and retrieve

### By type or object_type

```
wiki_search query="..." type=entity object_type=person
wiki_search query="..." folder=planner/tasks
wiki_search query="..." domain=technical areas=[infrastructure]
```

### Full-text body search via qmd

```bash
# Lexical only — fast, no LLM
qmd search "topic" -c wiki-personal --files
qmd search "topic" -c wiki-technical --files

# Hybrid — better recall
qmd query "topic" -c wiki-personal --no-rerank --files -n 5
qmd query "topic" -c wiki-technical --no-rerank --files -n 5

# Get a specific file
qmd get ~/NixPI/wiki/personal/pages/...
```

---

## Frontmatter rules for new notes

All new notes must have:

```yaml
id: <object_type>/<slug>
schema_version: 1
type: <type>
object_type: <object_type>
title: ...
domain: technical | personal
areas: [...]
status: ...
validation_level: seed
created: YYYY-MM-DD
updated: YYYY-MM-DD
summary: One dense sentence.
```

Use `wiki_ensure_page` — it injects all of these automatically.

---

## What NOT to do

- Do not write directly to `raw/` or `meta/` — those are managed by the extension
- Do not invent tags not in `meta/tags.md`
- Do not write summaries longer than one sentence
- Do not leave `summary:` empty
- Do not use Obsidian-style `[[wikilinks]]` in note bodies — use standard Markdown links
- Do not add relation IDs without verifying the target exists
