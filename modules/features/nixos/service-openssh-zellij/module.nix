{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.openssh.zellijShell;

  zellijShellScript = pkgs.writeShellApplication {
    name = "zellij-ssh-shell";
    runtimeInputs = [pkgs.zellij];
    text = ''
      if [ -z "''${SSH_ORIGINAL_COMMAND:-}" ]; then
        # Interactive SSH — attach or create zellij session
        exec zellij attach -c main
      elif [ "''${SSH_ORIGINAL_COMMAND}" = "${cfg.skipKeyword}" ]; then
        # Skip keyword — drop to plain bash login shell
        exec "''${SHELL:-/run/current-system/sw/bin/bash}" -l
      else
        # Any other command (rsync, git, scp, pi, etc.) — pass through
        exec "''${SHELL:-/run/current-system/sw/bin/bash}" -c "$SSH_ORIGINAL_COMMAND"
      fi
    '';
  };
in {
  options.services.openssh.zellijShell = {
    enable = lib.mkEnableOption "zellij as default SSH shell with skip parameter";

    skipKeyword = lib.mkOption {
      type = lib.types.str;
      default = "nzel";
      description = ''
        Keyword that bypasses zellij when passed as the SSH command.
        Users connect normally to get zellij, or use:
          ssh -t host nzel
        to get a plain bash shell instead.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    services.openssh.extraConfig = ''
      Match User *
        ForceCommand ${zellijShellScript}/bin/zellij-ssh-shell
    '';
  };
}
