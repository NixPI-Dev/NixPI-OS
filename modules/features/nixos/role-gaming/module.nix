{...}: {
  programs.steam = {
    enable = true;
    remotePlay.openFirewall = true;
    dedicatedServer.openFirewall = true;
  };

  # GameMode: resource-management daemon that applies CPU/GPU optimisations
  # when a game requests it (via the `gamemoderun` wrapper or Steam launch option).
  # Steam's per-game launch option: `gamemoderun %command%`
  programs.gamemode.enable = true;
}
