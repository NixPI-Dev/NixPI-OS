---
id: source/wiki-architecture-robustness-research
type: synthesis
object_type: source
title: Wiki Architecture Robustness Research
aliases: []
tags: [source, research, architecture]
domain: technical
areas: [knowledge-system, research]
hosts: []
status: active
created: 2026-04-21
updated: 2026-04-21
projects: [project/nixpi, project/personal-second-brain]
people: [person/operator]
systems: [host/vps-nixos]
sources: []
related: [concept/object-based-knowledge-system, source/capacities-object-model-research, task/build-pi-wiki-object-browser-extension]
source_ids: [web:jamalhansen-notes-need-metadata, web:understandingdata-frontmatter-schema, web:basic-memory-note-format, web:deadwater-markdown-knowledge-systems, web:gno-local-knowledge-workspace]
summary: Research note on strengthening the new plain-Markdown wiki with schema discipline, controlled taxonomies, validation, review cycles, and local search.
---

# Wiki Architecture Robustness Research

## Main conclusions

The current wiki direction is good: plain Markdown, structured frontmatter, stable IDs, and object-style notes.

The strongest improvements to make next are:

1. add explicit schema versioning
2. add validation and confidence fields
3. define controlled vocabularies for tags and relation types
4. add review-cycle fields for staleness management
5. formalize object-type schemas for validation
6. strengthen machine-generated registry and linting
7. add a local retrieval/search layer for privacy-preserving navigation

## Recommended enhancements

### 1. Add `schema_version`

Reason: schema evolution is easier if each note declares which schema generation it follows.

Suggested field:

```yaml
schema_version: 1
```

This will help future migration tooling and the migration skill.

### 2. Add knowledge confidence / validation level

Research strongly supports distinguishing trusted notes from draft or speculative ones.

Suggested field:

```yaml
validation_level: seed | working | trusted | superseded
```

This complements `status` instead of replacing it.

### 3. Add note freshness / review metadata

Suggested fields:

```yaml
review_cycle_days:
next_review:
last_reviewed:
```

Useful for procedures, infrastructure notes, reminders, and high-value reference pages.

### 4. Define controlled vocabularies

Two important registries should exist:

- a tag registry
- a relation type registry

This reduces drift like:
- `infra` vs `infrastructure`
- `depends_on` vs `dependency`

### 5. Formalize object-type schemas

The current `WIKI_SCHEMA.md` is a global schema.
The next step is per-object-type schema definitions, for example:

- `schemas/project.md`
- `schemas/person.md`
- `schemas/task.md`
- `schemas/meeting.md`
- `schemas/host.md`

This would make linting and migration safer.

### 6. Add change logs to critical notes

For durable notes like projects, hosts, procedures, and architecture notes, a simple change-log section increases traceability.

Example:

```md
## Change log
- 2026-04-21: Created initial note.
- 2026-05-02: Added migration workflow.
```

### 7. Use tables for invariant operational data

Markdown tables are a strong format for stable, parseable reference data such as:

- environments
- host inventories
- service owners
- review schedules

### 8. Strengthen generated machine indexes

The current `meta/registry.json` is a good start.
Later we should add generated artifacts such as:

- backlinks index
- unresolved-ID report
- stale-note report
- orphan-note report
- tag inventory
- relation inventory

### 9. Keep summaries short but precise

Multiple sources stressed that metadata is only useful when consistently maintained.
So the system should prefer a few high-value fields over many low-discipline fields.

### 10. Add a fully local retrieval layer

For private use with local models, a tool like GNO or a similar local indexer could sit on top of the wiki for:

- hybrid search
- cited local answers
- graph browsing
- agent integration

This is especially relevant for the future migration workflow with local-only models.

## Best next steps

1. add `schema_version` to the canonical schema
2. add `validation_level`, `review_cycle_days`, `last_reviewed`, `next_review`
3. create `meta/tags.md` and `meta/relation-types.md`
4. add per-object-type schema files under `schemas/`
5. create local lint scripts for schema and relation validation
6. build a PI extension for simple object-based wiki browsing

## Related

- [Object-Based Knowledge System](../resources/knowledge/object-based-knowledge-system.md)
- [Capacities Object Model Research](capacities-object-model-research.md)
- [NixPI](../projects/nixpi/index.md)
- [Build PI Wiki Object Browser Extension](../planner/tasks/build-pi-wiki-object-browser-extension.md)
