{...}: {
  services.power-profiles-daemon.enable = true;

  # Plymouth boot splash — inherits the same spinner theme as the desktop.
  boot.plymouth.enable = true;

  # nohang (new in 26.05): same OOM prevention as on the desktop,
  # especially valuable during long compile runs on battery.
  services.nohang.enable = true;

  # iwd: superior WPA3 support, faster scanning, better roaming vs wpa_supplicant.
  networking.networkmanager.wifi.backend = "iwd";
}
