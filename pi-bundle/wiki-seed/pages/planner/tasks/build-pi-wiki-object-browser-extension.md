---
id: task/build-pi-wiki-object-browser-extension
schema_version: 1
type: task
object_type: task
title: Build PI Wiki Object Browser Extension
aliases: []
tags: [task, pi, extension, wiki]
domain: technical
areas: [knowledge-system, tooling, ai]
hosts: [vps-nixos]
status: open
validation_level: seed
priority: medium
due:
scheduled:
schedule:
created: 2026-04-21
updated: 2026-04-21
projects: [project/nixpi, project/personal-second-brain]
people: [person/operator]
systems: [host/vps-nixos]
sources: [source/wiki-architecture-robustness-research]
related: [home/start-here, home/object-map, concept/object-based-knowledge-system]
depends_on: []
blocked_by: []
completed:
source_ids: []
summary: Future task to build a simple PI extension for browsing wiki notes with object-based filtering and a minimal read-only view.
---

# Build PI Wiki Object Browser Extension

## Outcome

Create a PI extension that makes the wiki easy to browse by object properties instead of only by filesystem path.

## First version scope

Keep the first version intentionally small:

- list wiki notes from the registry
- filter by `object_type`
- filter by `domain`
- filter by `status`
- filter by `areas`
- open a simple read-only note view

## Later ideas

- follow related IDs
- show backlinks
- show notes grouped by project or area
- quick jump to source note or task note
- local search over summaries and titles

## Related

- [NixPI](../../projects/nixpi/index.md)
- [Object Map](../../home/object-map.md)
- [Wiki Architecture Robustness Research](../../sources/wiki-architecture-robustness-research.md)
