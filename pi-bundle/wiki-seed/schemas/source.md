---
id: schema/source
schema_version: 1
type: concept
object_type: schema
title: Schema - Source
domain: technical
areas: [knowledge-system]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for source objects — structured notes derived from external evidence.
---

# Schema: Source

A source note represents processed external material: an article, paper, video, conversation, or raw document. Sources are static once processed — they record what an external thing said, not ongoing knowledge.

## Required fields

| field | value |
|---|---|
| `id` | `source/<slug>` |
| `schema_version` | `1` |
| `type` | `source` |
| `object_type` | `source` |
| `source_id` | stable external/source capture ID |
| `title` | descriptive title of the source |
| `status` | `captured`, `integrated`, or `superseded` |
| `captured_at` | ISO timestamp |
| `created` | ISO date |
| `updated` | ISO date |
| `origin_type` | `text`, `file`, or `url` |
| `origin_value` | source path, URL, or text label |
| `source_ids` | external reference IDs or URLs |
| `summary` | what the source says and why it matters |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `domain` | string | `technical` or `personal` when known |
| `areas` | array | area slugs when known |
| `validation_level` | enum | default: `seed` |
| `integrated_at` | ISO timestamp | set after ingestion |
| `integration_targets` | array | target pages created or updated from this source |

Do **not** add review-cycle fields to source notes — sources are static.

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | |
| `people` | `person/*` | authors, interviewees |
| `related` | any | concepts or notes derived from this |

## Status values

- `captured` — stored as raw evidence, not yet integrated
- `integrated` — processed into wiki pages
- `superseded` — replaced by newer or better evidence

## Recommended body sections

- `## Source details`
- `## Key takeaways`
- `## Open questions`
- `## Related`

## Example

```yaml
id: source/capacities-object-model-research
schema_version: 1
type: source
object_type: source
source_id: web:nixpi-wiki-pattern
title: Capacities Object Model Research
domain: technical
areas: [knowledge-system, research]
status: integrated
validation_level: working
captured_at: 2026-04-21T00:00:00.000Z
created: 2026-04-21
updated: 2026-04-21
origin_type: url
origin_value: https://example.invalid/nixpi-wiki-pattern
source_ids: [web:capacities-docs-object-types, web:nixpi-wiki-pattern]
integration_targets: [project/nixpi, project/personal-second-brain]
projects: [project/nixpi, project/personal-second-brain]
summary: Research on translating Capacities-style objects into plain Markdown and nixpi-wiki conventions.
```
