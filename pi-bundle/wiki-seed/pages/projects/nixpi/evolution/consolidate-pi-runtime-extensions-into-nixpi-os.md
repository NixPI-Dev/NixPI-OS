---
id: evolution/nixpi-consolidate-pi-runtime-extensions-into-nixpi-os
schema_version: 1
type: evolution
object_type: evolution
title: Consolidate PI runtime extensions into NixPI-OS
tags: [nixpi, evolution]
domain: technical
areas: [ai, infrastructure]
status: validating
risk: medium
area: extensions
validation_level: working
summary: Merge llm-wiki and nixpi-permissions into the NixPI-OS pi-bundle so PI runtime extensions, tests, and Home Manager wiring evolve in one repo.
created: 2026-04-24
updated: 2026-04-24
---

# Consolidate PI runtime extensions into NixPI-OS

## Motivation

NixPI currently ships PI runtime behavior from three repositories:

- `NixPI-LLM-Wiki` provides wiki tools, persona context, caveman-lite state, compaction context, and wiki path protection
- `nixpi-permissions` provides the deny-only shell guard for PI agent and user shell hooks
- `NixPI-OS` provides the PI bundle, OS wiring, status command, subagents, search extension, prompts, skills, wiki seed, and evolution notes

That split creates coordination cost for changes that naturally span one runtime lifecycle. Extension hooks such as `session_start`, `tool_call`, and `before_agent_start` are configured and deployed together, but changes currently require separate repo updates, separate flake input updates, and cross-repo validation.

The `nixpi-permissions` repo is tiny and NixPI-specific. `llm-wiki` still has a larger test suite and package boundary, but it now carries NixPI-specific persona, compaction, and guardrail behavior. Its reuse story outside NixPI is weak compared with the operational cost of keeping it separate.

## Plan

1. keep each extension as its own directory under `pi-bundle/extensions/nixpi/`
2. keep `nixpi-permissions` at `pi-bundle/extensions/nixpi/nixpi-permissions/`
3. move `NixPI-LLM-Wiki/extension/` to `pi-bundle/extensions/nixpi/llm-wiki/`
4. move the `llm-wiki` Nix package and tests into NixPI-OS as a local sub-package
5. run `llm-wiki` tests from the NixPI-OS flake check
6. remove the `llm-wiki` flake input from NixPI-OS after the local package is wired
7. keep Home Manager installing `.pi/agent/extensions/llm-wiki` from `${pkgs.llm-wiki}/share/llm-wiki`, now built locally by NixPI-OS
8. update NixPI path metadata and docs so `repos/NixPI-LLM-Wiki` is no longer treated as an active runtime dependency

## Validation

- `nix flake check` passes in `~/NixPI/repos/NixPI-OS`
- `nix build .#llm-wiki --no-link` passes in `~/NixPI/repos/NixPI-OS`
- `nix flake check` passes in `~/NixPI/config` against the local NixPI-OS path input
- after publishing NixPI-OS, update any remote-pinned config lock to the consolidated NixPI-OS revision
- a rebuilt host contains:
  - `~/.pi/agent/extensions/llm-wiki/index.ts`
  - `~/.pi/agent/extensions/nixpi-permissions/index.ts`
  - no active Home Manager dependency on a separate `NixPI-LLM-Wiki` checkout

## Rollout

1. merge the local package and test move in NixPI-OS
2. remove the `llm-wiki` input from NixPI-OS and refresh `repos/NixPI-OS/flake.lock`
3. update the config flake lock to the new NixPI-OS revision after committing and pushing NixPI-OS
4. run `nix flake check` in `~/NixPI/config`
5. rebuild the host
6. archive or retire the standalone `NixPI-LLM-Wiki` and `nixpi-permissions` repos once the deployed system no longer reads from them

## Rollback

If the `llm-wiki` move breaks tests or runtime extension loading:

1. restore the `llm-wiki` flake input in NixPI-OS
2. restore `pkgs.llm-wiki` to `inputs.llm-wiki.packages.${system}.default`
3. point `.pi/agent/extensions/llm-wiki` back to `${pkgs.llm-wiki}/share/llm-wiki`
4. rebuild the host

If `nixpi-permissions` breaks after consolidation, disable only `~/.pi/agent/extensions/nixpi-permissions` while keeping the rest of the PI bundle active.

## Linked files

- `~/NixPI/repos/NixPI-OS/flake.nix`
- `~/NixPI/repos/NixPI-OS/modules/packages/flake-module.nix`
- `~/NixPI/repos/NixPI-OS/modules/checks/flake-module.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/home/pi/resources.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/home/nixpi-paths/module.nix`
- `~/NixPI/repos/NixPI-OS/modules/features/nixos/nixpi-paths/module.nix`
- `~/NixPI/repos/NixPI-OS/pi-bundle/extensions/nixpi/llm-wiki/`
- `~/NixPI/repos/NixPI-OS/pi-bundle/extensions/nixpi/nixpi-permissions/`
- `~/NixPI/repos/NixPI-LLM-Wiki/`
- `~/NixPI/repos/nixpi-permissions/`
