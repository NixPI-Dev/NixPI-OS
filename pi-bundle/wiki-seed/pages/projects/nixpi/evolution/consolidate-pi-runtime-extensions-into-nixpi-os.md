---
id: evolution/nixpi-consolidate-pi-runtime-extensions-into-nixpi-os
schema_version: 1
type: evolution
object_type: evolution
title: Consolidate PI runtime extensions into NixPI-OS
tags: [nixpi, evolution]
domain: technical
areas: [ai, infrastructure]
status: applied
risk: medium
area: extensions
validation_level: working
summary: Merge nixpi-wiki into the bundled nixpi extension and keep NixPI-specific PI runtime behavior in one repo.
created: 2026-04-24
updated: 2026-04-24
---

# Consolidate PI Runtime Extensions Into NixPI-OS

## Motivation

NixPI previously shipped PI runtime behavior from three repositories:

- `NixPI-LLM-Wiki` provided wiki tools, persona context, caveman-lite state, compaction context, and wiki path protection
- `nixpi-permissions` provided the deny-only shell guard for PI agent and user shell hooks before it was merged into the main `nixpi` extension
- `NixPI-OS` provides the PI bundle, OS wiring, status command, subagents, search extension, prompts, skills, wiki seed, and evolution notes

That split creates coordination cost for changes that naturally span one runtime lifecycle. Extension hooks such as `session_start`, `tool_call`, and `before_agent_start` are configured and deployed together, but changes currently require separate repo updates, separate flake input updates, and cross-repo validation.

The wiki runtime now carries NixPI-specific persona, compaction, and guardrail behavior. Its reuse story outside NixPI is weak compared with the operational cost of keeping it separate or exposing it as a standalone CLI.

## Plan

1. move the wiki implementation under `pi-bundle/extensions/nixpi/nixpi/wiki/`
2. register the wiki tools from the main `nixpi` extension entrypoint
3. remove the standalone wiki CLI and runtime package
4. keep a local `pkgs/nixpi-wiki` test package for the wiki module
5. run `nixpi-wiki` tests from the NixPI-OS flake check
6. keep Home Manager installing only the bundled `nixpi` runtime extension
7. update docs and path metadata so `repos/NixPI-LLM-Wiki` is no longer treated as an active runtime dependency

## Validation

- `nix flake check` passes in `~/NixPI/repos/NixPI-OS`
- `nix build .#nixpi-wiki-tests --no-link` passes in `~/NixPI/repos/NixPI-OS`
- `nix flake check` passes in `~/NixPI/host-configs/vps-nixos` against the local NixPI-OS path input
- after publishing NixPI-OS, update any remote-pinned config lock to the consolidated NixPI-OS revision
- a rebuilt host contains:
  - `~/.pi/agent/extensions/nixpi/index.ts`
  - `~/.pi/agent/extensions/nixpi/wiki/index.ts`
  - no separate `~/.pi/agent/extensions/nixpi-permissions/index.ts`
  - no active Home Manager dependency on a separate `NixPI-LLM-Wiki` checkout

## Rollout

1. merge the local wiki module and test move in NixPI-OS
2. remove the old standalone wiki package and Home Manager extension entry
3. update the config flake lock to the new NixPI-OS revision after committing and pushing NixPI-OS
4. run `nix flake check` in `~/NixPI/host-configs/vps-nixos`
5. rebuild the host
6. deleted the standalone `NixPI-LLM-Wiki` and `nixpi-permissions` local checkouts after the host rebuild validated the consolidated NixPI-OS runtime

## Rollback

If the `nixpi-wiki` merge breaks tests or runtime extension loading:

1. restore the previous separate wiki extension package
2. restore the Home Manager standalone wiki bundled extension entry
3. point the standalone wiki extension path back to the restored package
4. rebuild the host

If the permissions guard breaks after consolidation, disable the guard in the main `nixpi` extension or roll back the merged `permissions.ts` change.

## Linked files

- `~/NixPI/repos/NixPI-OS/flake.nix`
- `~/NixPI/repos/NixPI-OS/modules/packages/flake-module.nix`
- `~/NixPI/repos/NixPI-OS/modules/checks/flake-module.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/home/pi/resources.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/home/nixpi-paths/module.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/nixos/nixpi-paths/module.nix`
- `~/NixPI/repos/NixPI-OS/pi-bundle/extensions/nixpi/nixpi/wiki/`
- `~/NixPI/repos/NixPI-OS/pi-bundle/extensions/nixpi/nixpi/permissions.ts`
- `~/NixPI/repos/NixPI-LLM-Wiki/`
- `~/NixPI/repos/nixpi-permissions/`
