{
  config,
  lib,
  ...
}: let
  cfg = config.services.reaction;
in {
  options.services.reaction.ignoreCidrs = lib.mkOption {
    type = lib.types.listOf lib.types.str;
    default = [];
    description = "CIDR ranges to exclude from banning (e.g. VPN overlays).";
  };

  config = {
    services.reaction = {
      enable = true;

      # Run as the unprivileged `reaction` system user (created automatically).
      # Capabilities below grant just enough privilege to manage iptables rules.
      runAsRoot = false;

      settings = {
        # Create a dedicated iptables chain at startup so all bans live in one
        # place and are cleanly flushed when reaction stops.
        start = [
          ["iptables" "-w" "-N" "reaction"]
          ["ip6tables" "-w" "-N" "reaction"]
          ["iptables" "-w" "-I" "INPUT" "-p" "all" "-j" "reaction"]
          ["ip6tables" "-w" "-I" "INPUT" "-p" "all" "-j" "reaction"]
        ];

        stop = [
          ["iptables" "-w" "-D" "INPUT" "-p" "all" "-j" "reaction"]
          ["ip6tables" "-w" "-D" "INPUT" "-p" "all" "-j" "reaction"]
          ["iptables" "-w" "-F" "reaction"]
          ["ip6tables" "-w" "-F" "reaction"]
          ["iptables" "-w" "-X" "reaction"]
          ["ip6tables" "-w" "-X" "reaction"]
        ];

        patterns = {
          ip = {
            type = "ip";
            # Never ban loopback or trusted overlay peers.
            ignore = ["127.0.0.1" "::1"];
            ignorecidr = cfg.ignoreCidrs;
          };
        };

        streams = {
          ssh = {
            cmd = ["journalctl" "-n0" "-fu" "sshd.service"];

            filters = {
              failedlogin = {
                regex = [
                  "authentication failure;.*rhost=<ip>"
                  "Failed password for .* from <ip>"
                  "Invalid user .* from <ip>"
                  "Connection (reset|closed) by (authenticating|invalid) user .* <ip>"
                  "banner exchange: Connection from <ip> port [0-9]*: invalid format"
                ];

                # Ban after 5 failures within 10 minutes.
                retry = 5;
                retryperiod = "10m";

                actions = {
                  ban4 = {
                    cmd = ["iptables" "-w" "-A" "reaction" "-s" "<ip>" "-j" "DROP"];
                    ipv4only = true;
                  };
                  ban6 = {
                    cmd = ["ip6tables" "-w" "-A" "reaction" "-s" "<ip>" "-j" "DROP"];
                    ipv6only = true;
                  };
                  unban4 = {
                    cmd = ["iptables" "-w" "-D" "reaction" "-s" "<ip>" "-j" "DROP"];
                    after = "24h";
                    ipv4only = true;
                  };
                  unban6 = {
                    cmd = ["ip6tables" "-w" "-D" "reaction" "-s" "<ip>" "-j" "DROP"];
                    after = "24h";
                    ipv6only = true;
                  };
                };
              };
            };
          };
        };
      };
    };

    # Allow reaction to stream journal logs of other processes.
    users.users.reaction.extraGroups = ["systemd-journal"];

    # Grant only CAP_NET_ADMIN — the minimum needed to manage iptables rules.
    systemd.services.reaction.unitConfig.ConditionCapability = "CAP_NET_ADMIN";
    systemd.services.reaction.serviceConfig = {
      CapabilityBoundingSet = ["CAP_NET_ADMIN"];
      AmbientCapabilities = ["CAP_NET_ADMIN"];
    };
  };
}
