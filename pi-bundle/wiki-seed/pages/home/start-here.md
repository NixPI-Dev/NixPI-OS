---
id: home/start-here
schema_version: 1
type: synthesis
object_type: dashboard
title: Start Here
aliases: []
tags: [dashboard, index]
domain: technical
areas: [knowledge-system, organization]
hosts: []
status: active
validation_level: working
review_cycle_days: 30
last_reviewed: 2026-04-21
next_review: 2026-05-21
created: 2026-04-21
updated: 2026-04-21
projects: [project/nixpi, project/personal-second-brain]
people: [person/operator]
systems: [host/evo-nixos, service/syncthing]
sources: [source/capacities-object-model-research]
related: [home/today-dashboard, home/object-map, concept/object-based-knowledge-system]
source_ids: []
summary: Main entry point into the rebuilt plain-Markdown wiki and its example object graph.
---

# Start Here

This is the main entry point for the new wiki.

## Core docs

- [README](../../README.md)
- [Canonical Structure](../../WIKI_CANONICAL_STRUCTURE.md)
- [Schema](../../WIKI_SCHEMA.md)
- [Rules](../../WIKI_RULES.md)
- [Object Model](../../WIKI_OBJECT_MODEL.md)

## Dashboards

- [Today Dashboard](today-dashboard.md)
- [Object Map](object-map.md)

## Example projects

- [NixPI](../projects/nixpi/index.md)
- [Personal Second Brain](../projects/personal-second-brain/index.md)

## Example objects

- [Operator](../resources/people/operator.md)
- [evo-nixos](../resources/technical/evo-nixos.md)
- [Syncthing](../resources/technical/syncthing.md)
- [Object-Based Knowledge System](../resources/knowledge/object-based-knowledge-system.md)
- [Capacities Object Model Research](../sources/capacities-object-model-research.md)

## How to use the wiki

1. capture rough material in [raw](../../raw/README.md)
2. convert it into a structured note under `pages/`
3. assign `id`, `type`, `object_type`, and a strong `summary`
4. connect it to related objects via frontmatter IDs
5. link to it in the body with standard Markdown links
