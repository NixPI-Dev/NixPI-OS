# NixPI-OS

Public NixOS and Home Manager module library for the NixPI ecosystem.

## Goals

- Keep public infrastructure code reusable across hosts and users
- Keep host-specific and user-specific config out of this repo
- Export composable NixOS modules, Home Manager modules, overlays, and packages
- Keep the private fleet config in a separate repo consumed as a flake input

## Structure

```text
flake.nix                         # flake-parts entrypoint
modules/core/                     # option definitions + auto-discovery
modules/features/nixos/*/         # reusable NixOS feature modules (auto-registered)
modules/features/home/*/          # reusable Home Manager modules (auto-registered)
modules/packages/flake-module.nix # overlay, packages, apps, dev shell, formatter
modules/checks/flake-module.nix   # public flake checks
pkgs/                             # locally maintained packages, exposed via overlay
pi-bundle/                        # public PI runtime bundle: extensions, skills, agents, prompts, wiki seed
```

Adding a new feature: create `modules/features/{nixos,home}/my-feature/module.nix` — it's auto-registered, no boilerplate needed.

### `modules/`

Features are auto-discovered from `modules/features/{nixos,home}/` — any directory containing a `module.nix` is registered automatically as `flake.nixosModules.<name>` or `flake.homeModules.<name>`.

Notable features:

- `common`, `desktop`, `laptop`
- `role-gaming`, `role-nvidia`
- `service-networkmanager`, `service-openssh`, `service-reaction`, `service-syncthing`
- `service-llama-cpp`, `service-pi-gateway`

Private host definitions now live in the separate fleet config repo and consume these exported modules.

### `pkgs/`

Locally maintained package definitions.

- `pkgs/pi` builds the Pi binary under our control
- `pkgs/pi-gateway` is the generic transport gateway (Signal and WhatsApp)
- `pkgs/pi-web-access` provides the web-search extension
- `pkgs/llm-wiki` provides the wiki extension
- packages are exported through `overlays.default` and reused everywhere

### `service-pi-gateway`

The `modules/features/nixos/service-pi-gateway/` NixOS module manages the pi-gateway service.

It provides:
- `services.pi-gateway.enable`
- `services.pi-gateway.signal.*` — Signal transport config
- `services.pi-gateway.whatsapp.*` — WhatsApp transport config (Baileys-based)
- `services.pi-gateway.maxReplyChars` / `maxReplyChunks`
- runs as the primary user so it inherits pi auth credentials

Typical usage (e.g. in a host file):

```nix
services.pi-gateway = {
  enable = true;

  signal = {
    enable = true;
    account = "+15550001111";
    allowedNumbers = [ "+15550002222" ];
    adminNumbers = [ "+15550002222" ];
  };

  whatsapp = {
    enable = true;
    trustedNumbers = [ "+15550002222" ];
    adminNumbers = [ "+15550002222" ];
  };
};
```

The Signal transport requires `signal-cli-rest-api` running at `http://127.0.0.1:8080` (configurable).

The WhatsApp transport uses Baileys and persists auth state under the gateway state directory.

### Home Manager

This repo exports reusable Home Manager modules under `homeModules.*`.

Typical consumption pattern from a private fleet config:
- import `nixpi-os.homeModules.*`
- add private user identity and host-specific Home Manager modules in the private repo
- keep `pi-bundle/` as the public PI runtime asset bundle and `modules/features/home/pi/` as the wiring layer

### Restored PI runtime capabilities

The Pi runtime includes several capabilities:

- `os` extension — `system_health`, `nixos_update`, `systemd_control`, `schedule_reboot`
- `nixpi` extension — `nixpi_status`, `nixpi_evolution_note`, `/nixpi status`
- `nixpi-permissions` extension — deny-only guard for dangerous Pi shell commands
- `subagent` extension — isolated helper agents (scout/planner/worker/reviewer)
- restored PI skills — `wiki`, `os-operations`, `self-evolution`

These runtime files are installed under `~/.pi/agent/` by Home Manager.

### Synthetic + local llama provider wiring

Pi seeds a Nix-managed `~/.pi/agent/models.json` for custom providers:

- `synthetic` — OpenAI-compatible, authenticated by resolving the configured runtime secret path at request time
- `llama` — local llama.cpp endpoint on `evo-nixos`

Maintained hosts should set `home-manager.users.<name>.pi.syntheticApiKeyFile` to a runtime secret such as `/run/secrets/synthetic_api_key`.

This keeps the key out of the Nix store and out of long-lived PI model config while preserving it across rebuilds.

### Privileged PI flows

PI stays unprivileged:

- read-only inspection tools run directly without sudo
- privileged mutations use `sudo -n` after ensuring credentials are available
- common operations have NOPASSWD sudoers rules
- `sudoers` uses `timestamp_type=global` so credentials propagate across sessions

### Private fleet config

The private fleet repo is expected at `~/NixPI/config` and should import this repo as a flake input.

It owns:
- host compositions
- hardware configs
- user accounts and SSH keys
- private host overrides
- personal Git identity
- private technical and personal wiki content

## NixPI helper command

```bash
nix run .#nixpi-vcp              # validate + commit + push
nix run .#nixpi-vcp -- "message" # with custom commit message
```

## Consumption example

```nix
inputs.nixpi-os.url = "github:NixPI-Dev/NixPI-OS";

{
  nixpkgs.overlays = [inputs.nixpi-os.overlays.default];

  imports = [
    inputs.nixpi-os.nixosModules.common
    inputs.nixpi-os.nixosModules.service-openssh
  ];
}
```

## Quality checks

```bash
nix fmt                          # format all Nix files
nix flake check --accept-flake-config  # run all checks
```

### Current check coverage

- formatting for all Nix files
- `llm-wiki` upstream test suite via flake input

## Notes

- `system.stateVersion` stays host-local
- shared user config lives in Home Manager
- machine-specific overrides should stay small and obvious
- repo-specific binary cache settings live in `flake.nix` via `nixConfig`
