---
description: Start a focused wiki session — loads schema, shows today's agenda, and orients PI for note management, planning, or review.
argument-hint: "[focus area or task]"
---

Start a wiki session.

1. Call `wiki_status` to check the current state.
2. Read the planner digest already in context — it shows today's note, overdue tasks, upcoming events, and open reminders.
3. Read the active wiki root's `WIKI_SCHEMA.md` briefly to confirm the schema version.
4. If the user provided an argument, focus on that: $@
5. Otherwise ask: "What would you like to do today — daily note, capture, review, or something else?"

Remember:
- All new notes use `wiki_ensure_page` which injects `id`, `object_type`, `schema_version`, `validation_level`, and relation fields automatically.
- Use `wiki_search` with `type=`, `object_type=`, `domain=`, `folder=` to find notes.
- Use `qmd search` for full-text body search.
- Use `wiki_lint` if the user asks for a health check.
- Standard Markdown links in note bodies — no `[[wikilinks]]`.
