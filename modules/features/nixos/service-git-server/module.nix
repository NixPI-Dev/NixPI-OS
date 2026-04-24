{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.nixpi-git-server;
  primaryUser = config.users.users.${config.nixpi.user.name} or {};
  primaryKeys = primaryUser.openssh.authorizedKeys.keys or [];
  authorizedKeys =
    if cfg.authorizedKeys != []
    then cfg.authorizedKeys
    else primaryKeys;
in {
  options.services.nixpi-git-server = {
    enable = lib.mkEnableOption "a restricted bare Git repository server";

    root = lib.mkOption {
      type = lib.types.str;
      default = "/srv/git";
      description = "Directory containing the bare Git repositories.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "git";
      description = "System user that owns the bare Git repositories.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "git";
      description = "System group that owns the bare Git repositories.";
    };

    repos = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      example = ["config.git" "wiki-technical.git" "wiki-personal.git"];
      description = "Bare repository directory names to initialize under services.nixpi-git-server.root.";
    };

    authorizedKeys = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "SSH public keys authorized for the Git transport user. Defaults to the primary user's keys.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.repos != [];
        message = "services.nixpi-git-server.repos must not be empty when the service is enabled.";
      }
      {
        assertion = authorizedKeys != [];
        message = "services.nixpi-git-server.authorizedKeys must be set, or the primary user must have authorized SSH keys.";
      }
    ];

    users.groups.${cfg.group} = {};

    users.users.${cfg.user} = {
      isSystemUser = true;
      description = "Git repository owner";
      group = cfg.group;
      home = cfg.root;
      createHome = true;
      useDefaultShell = false;
      shell = "${pkgs.git}/bin/git-shell";
      openssh.authorizedKeys.keys = authorizedKeys;
    };

    services.openssh.extraConfig = ''
      Match User ${cfg.user}
        AuthenticationMethods publickey
        PasswordAuthentication no
        KbdInteractiveAuthentication no
        PermitTTY no
        X11Forwarding no
        AllowAgentForwarding no
        AllowTcpForwarding no
        PermitTunnel no
    '';

    systemd.tmpfiles.rules = [
      "d ${cfg.root} 0755 ${cfg.user} ${cfg.group} -"
    ];

    systemd.services.nixpi-git-repos = {
      description = "Initialize bare Git repositories";
      wantedBy = ["multi-user.target"];
      after = ["systemd-tmpfiles-setup.service"];
      requires = ["systemd-tmpfiles-setup.service"];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      path = [pkgs.coreutils pkgs.git];
      script = ''
        install -d -o ${cfg.user} -g ${cfg.group} -m 0755 ${cfg.root}

        ${lib.concatMapStringsSep "\n\n        " (repo: ''
            if [ ! -d ${cfg.root}/${repo}/objects ]; then
              git init --bare --initial-branch=main ${cfg.root}/${repo}
            fi

            chown -R ${cfg.user}:${cfg.group} ${cfg.root}/${repo}
            chmod -R g+rwX ${cfg.root}/${repo}
            git --git-dir=${cfg.root}/${repo} config receive.denyNonFastForwards true
            git --git-dir=${cfg.root}/${repo} config transfer.fsckObjects true
            git --git-dir=${cfg.root}/${repo} config core.sharedRepository group
          '')
          cfg.repos}
      '';
    };

    system.activationScripts.gitRepoPerms = lib.stringAfter ["users" "groups"] ''
      chmod 0755 ${cfg.root}
      for repo in ${lib.concatStringsSep " " cfg.repos}; do
        if [ -e ${cfg.root}/$repo ]; then
          chown -R ${cfg.user}:${cfg.group} ${cfg.root}/$repo
          chmod -R g+rwX ${cfg.root}/$repo
        fi
      done
    '';
  };
}
