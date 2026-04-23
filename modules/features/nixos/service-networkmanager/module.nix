{...}: {
  networking.networkmanager.enable = true;

  # ModemManager is split from NetworkManager since 25.05. Disable it
  # explicitly — we don't use cellular/LTE modems on any of our machines.
  networking.modemmanager.enable = false;
}
