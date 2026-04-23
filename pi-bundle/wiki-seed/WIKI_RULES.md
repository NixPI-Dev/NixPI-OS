# Wiki Rules

These rules keep the wiki understandable by humans, LLMs, and generic Markdown tooling.

## 1. Use plain Markdown

Use standard Markdown for:
- headings
- lists
- code fences
- tables
- relative links

Avoid relying on app-specific syntax as the canonical representation.

## 2. Every note has stable frontmatter

Every note should have at minimum:

```yaml
id:
type:
object_type:
title:
domain:
areas:
status:
created:
updated:
summary:
```

## 3. Use stable IDs for relationships

In frontmatter, relation fields store IDs, not editor-specific link syntax.

Example:

```yaml
projects: [project/nixpi]
people: [person/operator]
related: [concept/object-based-knowledge-system]
```

## 4. Use standard Markdown links in the body

Example:

```md
See [NixPI](pages/projects/nixpi/index.md).
```

## 5. Folders describe role, not domain

A note can live in the same wiki and still be clearly personal or technical through metadata.

- `domain: personal`
- `domain: technical`

## 6. Prefer structure over prose when repeated

If the same kind of note appears repeatedly, give it a consistent `object_type` and fields.

Examples:
- `person`
- `project`
- `meeting`
- `host`
- `service`
- `task`
- `event`
- `reminder`

## 7. Use ISO dates

- `2026-04-21`
- `2026-04-21 14:00`

## 8. Use kebab-case filenames

Examples:
- `plan-wiki-migration.md`
- `review-wiki-structure-2026-05-21.md`

## 9. Keep titles human-readable

The filename is for the filesystem.
The title is for readers.

## 10. Summaries are mandatory

`summary:` should be dense and specific.
It is the first routing hint for LLMs.

## 11. Relationships should be explicit

Prefer explicit fields over hidden context.

Examples:
- `projects:`
- `people:`
- `systems:`
- `sources:`
- `related:`
- `depends_on:`
- `blocked_by:`

## 12. Keep the body useful without the tool

A note should still make sense if someone opens it in:
- a terminal editor
- GitHub
- a plain text viewer
- a future note tool

## 13. Reviews and dashboards are pages too

A dashboard is just a note with a strong navigation role.
A review is just a note with time-based synthesis.

## 14. Raw capture is allowed to be messy

`raw/` is the only place where incomplete structure is acceptable.
Everything else should be normalized over time.

## 15. The wiki is maintained incrementally

The expected workflow is:

```text
capture -> raw
triage -> structured page
link -> related objects
review -> update summaries and relations
archive -> move inactive material
```
