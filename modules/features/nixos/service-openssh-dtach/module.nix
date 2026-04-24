{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.openssh.dtachShell;

  socketDir = "\${HOME}/.dtach";
  pendingDir = "\${HOME}/.dtach/pending";

  dtachShellScript = pkgs.writeShellApplication {
    name = "dtach-ssh-shell";
    runtimeInputs = [pkgs.dtach pkgs.coreutils];
    text = ''
      if [ -z "''${SSH_ORIGINAL_COMMAND:-}" ]; then
        # Interactive SSH — check for pending sudo-ask sessions first
        if [ -d "${pendingDir}" ]; then
          for marker in "${pendingDir}"/*; do
            [ -f "$marker" ] || continue
            session_name=$(basename "$marker")
            cmd=$(cat "$marker")
            rm -f "$marker"
            mkdir -p "${socketDir}"
            echo "sudo-ask: prompting for '$cmd'"
            dtach -A "${socketDir}/$session_name" -r winch "''${SHELL:-/run/current-system/sw/bin/bash}" -l -c "sudo $cmd; echo ''''; echo ''--- sudo-ask done, press Enter ---''; read -r" || true
          done
        fi

        # Also resume any orphaned sudo-ask sessions (user detached before completing)
        for socket in "${socketDir}"/sudo-ask-*; do
          [ -S "$socket" ] || continue
          echo "sudo-ask: resuming $(basename "$socket")"
          dtach -a "$socket" || true
        done

        # Normal session — attach or create dtach session running bash
        mkdir -p "${socketDir}"
        exec dtach -A "${socketDir}/main" -r winch "''${SHELL:-/run/current-system/sw/bin/bash}" -l
      elif [ "''${SSH_ORIGINAL_COMMAND}" = "${cfg.skipKeyword}" ]; then
        # Skip keyword — drop to plain bash login shell (no dtach)
        exec "''${SHELL:-/run/current-system/sw/bin/bash}" -l
      else
        # Any other command (rsync, git, scp, pi, etc.) — pass through
        exec "''${SHELL:-/run/current-system/sw/bin/bash}" -c "$SSH_ORIGINAL_COMMAND"
      fi
    '';
  };

  sudoAskScript = pkgs.writeShellApplication {
    name = "sudo-ask";
    runtimeInputs = [pkgs.coreutils];
    text = ''
      if [ $# -eq 0 ]; then
        echo "Usage: sudo-ask <command> [args...]" >&2
        exit 1
      fi
      session_name="sudo-ask-$(date +%s)"
      mkdir -p "${pendingDir}"
      printf '%s' "$*" > "${pendingDir}/$session_name"
      echo "sudo-ask: queued '$*'. Next SSH login will prompt for password."
    '';
  };
in {
  options.services.openssh.dtachShell = {
    enable = lib.mkEnableOption "dtach as default SSH shell with skip parameter";

    skipKeyword = lib.mkOption {
      type = lib.types.str;
      default = "ndt";
      description = ''
        Keyword that bypasses dtach when passed as the SSH command.
        Users connect normally to get dtach, or use:
          ssh -t host ndt
        to get a plain bash shell instead.
      '';
    };

    sudoAsk = {
      enable = lib.mkEnableOption "sudo-ask: queue sudo commands that prompt for password on next SSH login";
    };

    excludeUsers = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = ["git"];
      description = ''
        Users excluded from the dtach ForceCommand.
        These users keep their default shell (e.g. git-shell for the git user).
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    services.openssh.extraConfig = ''
      Match User *,!${lib.concatStringsSep ",!" cfg.excludeUsers}
        ForceCommand ${dtachShellScript}/bin/dtach-ssh-shell
    '';

    environment.systemPackages = lib.mkIf cfg.sudoAsk.enable [sudoAskScript];
  };
}
