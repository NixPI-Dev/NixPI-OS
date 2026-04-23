# Wiki

A tool-agnostic, plain-Markdown wiki for both:

- personal life organization
- NixPI / system memory
- tasks, events, reminders, and reviews
- projects, areas, resources, sources, and journals

This wiki is designed to be readable by **any editor, any LLM, and any future tool**.

## Principles

1. **One wiki** for personal and technical knowledge.
2. **Plain Markdown first** — no app-specific syntax required.
3. **Folders describe note role**.
4. **Frontmatter describes structure**.
5. **Stable IDs describe relationships**.
6. **LLM-wiki maintains the graph over time**.

## Quick start

Start with these files:

- [WIKI_CANONICAL_STRUCTURE.md](WIKI_CANONICAL_STRUCTURE.md)
- [WIKI_SCHEMA.md](WIKI_SCHEMA.md)
- [WIKI_RULES.md](WIKI_RULES.md)
- [WIKI_OBJECT_MODEL.md](WIKI_OBJECT_MODEL.md)
- [Start Here](pages/home/start-here.md)

## Canonical structure

```text
pages/
  home/
  planner/
    tasks/
    calendar/
    reminders/
    reviews/
  projects/
  areas/
  resources/
    knowledge/
    people/
    technical/
    personal/
  sources/
  journal/
    daily/
    weekly/
    monthly/
  archives/
    planner/
    projects/
    areas/
    resources/
    journal/
meta/
raw/
templates/markdown/
```

## Placement rule

- actionable item -> `pages/planner/`
- finite outcome -> `pages/projects/`
- ongoing responsibility -> `pages/areas/`
- reference knowledge -> `pages/resources/`
- imported evidence -> `pages/sources/`
- time-based reflection -> `pages/journal/`
- navigation / dashboards -> `pages/home/`
- inactive material -> `pages/archives/`
- unprocessed capture -> `raw/`

## Linking rule

- Use standard Markdown links in note bodies:
  - `[NixPI](pages/projects/nixpi/index.md)`
- Use stable IDs in frontmatter relation fields:
  - `projects: [project/nixpi]`

## Notes

- Canonical roots: `~/NixPI/wiki/technical` and `~/NixPI/wiki/personal`.
- Optional migration source backup: `~/Wiki_backup`.
- This wiki is a clean rebuild with a stricter schema and example notes.
