{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.openssh.dtachShell;

  socketDir = "\${HOME}/.dtach";

  dtachShellScript = pkgs.writeShellApplication {
    name = "dtach-ssh-shell";
    runtimeInputs = [pkgs.dtach];
    text = ''
      if [ -z "''${SSH_ORIGINAL_COMMAND:-}" ]; then
        # Interactive SSH — attach or create dtach session running bash
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
  };
}
