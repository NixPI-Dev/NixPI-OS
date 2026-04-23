# Canonical Wiki Structure

This wiki uses a **hybrid PARA + object model**.

- **Folders** express the role of a note.
- **Frontmatter** expresses what the note is.
- **Stable IDs** express relationships.
- **Markdown links** connect the readable graph.

The structure is intentionally shallow and tool-agnostic.

## Root

```text
Knowledge/
├── README.md
├── WIKI_CANONICAL_STRUCTURE.md
├── WIKI_SCHEMA.md          # current schema reference
├── WIKI_RULES.md
├── WIKI_OBJECT_MODEL.md
├── meta/
│   ├── index.md
│   ├── log.md
│   ├── registry.json
│   ├── tags.md             # controlled tag vocabulary
│   └── relation-types.md   # controlled relation type vocabulary
├── raw/
├── schemas/                # per-object-type schemas
│   ├── project.md
│   ├── area.md
│   ├── person.md
│   ├── host.md
│   ├── service.md
│   ├── concept.md
│   ├── source.md
│   ├── task.md
│   ├── meeting.md
│   ├── event.md
│   ├── reminder.md
│   ├── daily-note.md
│   ├── review.md
│   └── dashboard.md
├── templates/
│   └── markdown/
└── pages/
```

## Pages

```text
pages/
├── home/                     # dashboards, maps, entry points
├── planner/                  # operational layer
│   ├── tasks/
│   ├── calendar/
│   ├── reminders/
│   └── reviews/
├── projects/                 # finite outcomes
├── areas/                    # ongoing responsibilities
├── resources/                # reference knowledge
│   ├── knowledge/
│   ├── people/
│   ├── technical/
│   └── personal/
├── sources/                  # imported / captured source notes
├── journal/                  # time-based logs
│   ├── daily/
│   ├── weekly/
│   └── monthly/
└── archives/                 # inactive material
    ├── planner/
    ├── projects/
    ├── areas/
    ├── resources/
    └── journal/
```

## Placement rules

### `pages/home/`
Use for dashboards, indexes, maps of content, and navigation notes.

### `pages/planner/tasks/`
Use for actions with an owner, status, and next step.

### `pages/planner/calendar/`
Use for meetings, appointments, deadlines, and scheduled events.

### `pages/planner/reminders/`
Use for prompts, follow-ups, and check-back notes.

### `pages/planner/reviews/`
Use for weekly, monthly, quarterly, and annual reviews.

### `pages/projects/`
Use for finite efforts with a clear outcome.

### `pages/areas/`
Use for ongoing responsibilities and life/system domains.

### `pages/resources/`
Use for evergreen references, people notes, technical entities, and personal reference material.

### `pages/sources/`
Use for captured research notes, imported evidence, transcripts, PDFs, article notes, and source summaries.

### `pages/journal/`
Use for daily, weekly, and monthly logs and reflection.

### `pages/archives/`
Use only for inactive material.

## Non-page folders

### `meta/`
Machine-oriented support files:
- registry
- index
- logs
- generated views

### `raw/`
Inbox for unprocessed capture.

### `templates/markdown/`
Plain Markdown templates with no editor-specific assumptions.

## What is no longer canonical

Do not use folder structure as the primary personal-vs-technical split.
That distinction now lives in frontmatter via `domain:`.

Avoid creating new material in legacy layouts from the old vault.
