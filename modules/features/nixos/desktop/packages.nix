{pkgs, ...}: {
  environment.systemPackages = with pkgs; [
    kdePackages.kate
    kdePackages.dolphin
    kdePackages.plasma-nm
    vlc
  ];
}
