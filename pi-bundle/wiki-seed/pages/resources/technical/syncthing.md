---
id: service/syncthing
schema_version: 1
type: entity
object_type: service
title: Syncthing
aliases: []
tags: [service, sync]
domain: technical
areas: [infrastructure, sync]
hosts: []
status: active
validation_level: trusted
review_cycle_days: 60
last_reviewed: 2026-04-21
next_review: 2026-06-20
created: 2026-04-21
updated: 2026-04-21
projects: [project/nixpi, project/personal-second-brain]
people: [person/operator]
systems: [host/vps-nixos]
sources: []
related: [area/infrastructure]
source_ids: []
summary: Sync layer that keeps the wiki portable across devices while preserving a plain-file workflow.
---

# Syncthing

## Purpose

Keep the wiki available across machines without locking it into one app or one host.

## Operational context

- runs with [vps-nixos](vps-nixos.md)
- supports [NixPI](../../projects/nixpi/index.md)
- supports [Personal Second Brain](../../projects/personal-second-brain/index.md)
