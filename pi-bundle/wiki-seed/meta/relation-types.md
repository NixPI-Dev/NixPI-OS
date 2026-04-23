# Controlled Relation Type Vocabulary

All relation types used in frontmatter arrays and Markdown body links should
come from this list. Consistent naming keeps `qmd` retrieval and registry
queries reliable.

## Frontmatter relation fields

These are the canonical typed relation arrays in frontmatter.

| field | meaning |
|---|---|
| `projects` | related project objects |
| `people` | related person objects |
| `systems` | related technical objects (hosts, services) |
| `sources` | related source or evidence objects |
| `related` | generic cross-cutting relation |
| `depends_on` | this note depends on another (tasks) |
| `blocked_by` | this task is blocked by another note or task |

All values are stable IDs like `project/nixpi` or `person/operator`.

## Body prose relation types

When describing a relationship in the body of a note, prefer these verbs.

| verb | use for |
|---|---|
| `implements` | this implements an idea or spec |
| `depends_on` | this requires another thing to work |
| `extends` | this builds on top of another note |
| `relates_to` | generic semantic connection |
| `inspired_by` | this was influenced by another |
| `contradicts` | this challenges or opposes another |
| `supersedes` | this replaces an older note |
| `part_of` | this is a component of a larger thing |
| `contains` | this contains or groups another |
| `pairs_with` | this works well alongside another |
| `authored` | this person wrote or created something |
| `works_at` | this person is affiliated with an org |
| `runs_on` | this service runs on a host |
| `managed_by` | this is managed by a person or service |

## Rules

- Use the controlled list before inventing new relation types
- Relation types in prose links are free-text but should be consistent
- Frontmatter relations use ID arrays, not prose
- Never use a frontmatter relation type not in the field list above
