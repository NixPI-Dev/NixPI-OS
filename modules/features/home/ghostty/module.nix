{
  config,
  lib,
  pkgs,
  ...
}: let
  kwriteconfig = "${pkgs.kdePackages.kconfig}/bin/kwriteconfig6";
  kdeglobals = "${config.home.homeDirectory}/.config/kdeglobals";
in {
  home.sessionVariables.TERMINAL = "ghostty";

  programs.ghostty = {
    enable = true;
    enableBashIntegration = true;
    settings = {
      theme = "iTerm2 Default";
      gtk-titlebar = false;
      window-padding-x = 8;
      window-padding-y = 8;
      font-family = "JetBrainsMono Nerd Font Mono";
      font-size = 12.5;
      shell-integration-features = "no-cursor";
      confirm-close-surface = false;
      auto-update = "off";
      clipboard-read = "allow";
      clipboard-write = "allow";
    };
  };

  home.activation.ghosttyDefaultTerminal = lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD mkdir -p "${config.home.homeDirectory}/.config"
    $DRY_RUN_CMD ${kwriteconfig} --file "${kdeglobals}" --group General --key TerminalApplication "ghostty"
    $DRY_RUN_CMD ${kwriteconfig} --file "${kdeglobals}" --group General --key TerminalService "com.mitchellh.ghostty.desktop"
  '';
}
