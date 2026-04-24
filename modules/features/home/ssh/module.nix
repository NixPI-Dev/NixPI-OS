{lib, ...}: {
  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;
    matchBlocks = {
      "github.com" = {
        user = "git";
        identityFile = "~/.ssh/id_ed25519";
      };
    };
  };

  # OpenSSH rejects Home Manager's normal Nix-store symlink because the target
  # is not user-owned. Keep the config declarative, then materialize it as a
  # regular user-owned file after Home Manager links the generation.
  home.file.".ssh/config".force = true;
  home.activation.materializeSshConfig = lib.hm.dag.entryAfter ["linkGeneration"] ''
    ssh_config="$HOME/.ssh/config"
    if [ -L "$ssh_config" ]; then
      ssh_config_target="$(readlink -f "$ssh_config")"
      if [ -n "$ssh_config_target" ] && [ -f "$ssh_config_target" ]; then
        tmp="$ssh_config.hm-tmp"
        install -m 0600 "$ssh_config_target" "$tmp"
        mv "$tmp" "$ssh_config"
      fi
    elif [ -f "$ssh_config" ]; then
      chmod 0600 "$ssh_config"
    fi
  '';
}
