{config, ...}: let
  userName = config.nixpi.user.name;
  userHome = config.nixpi.user.homeDirectory;
in {
  services.syncthing = {
    enable = true;
    user = userName;
    dataDir = userHome;
    configDir = "${userHome}/.config/syncthing";
    openDefaultPorts = true;
  };
}
