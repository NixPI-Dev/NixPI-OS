{pkgs, ...}: {
  services.displayManager.sddm = {
    enable = true;
    # Use the native Wayland compositor instead of X11 for the greeter.
    # Required for Plasma 6 HDR / variable refresh rate support at login.
    wayland.enable = true;
  };
  services.desktopManager.plasma6.enable = true;

  environment.plasma6.excludePackages = [pkgs.kdePackages.konsole];

  fonts.packages = [pkgs.nerd-fonts.jetbrains-mono];
  fonts.fontconfig.defaultFonts.monospace = ["JetBrainsMono Nerd Font Mono"];

  hardware.graphics.enable = true;

  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    wireplumber.enable = true;
  };

  hardware.bluetooth.enable = true;
  hardware.bluetooth.powerOnBoot = true;

  programs.firefox.enable = true;

  # Plymouth boot splash — clean spinner theme, works with NVIDIA modesetting.
  boot.plymouth.enable = true;

  # nix-ld: stub dynamic linker so pre-built Linux binaries run without patching.
  # Useful for vendor SDKs, downloaded tools, and VSCode native extensions.
  programs.nix-ld.enable = true;

  # nohang (new in 26.05): user-space OOM prevention daemon.
  # Intervenes before the kernel OOM killer fires, keeping the desktop
  # responsive under heavy load (gaming, compilation, etc.).
  services.nohang.enable = true;
}
