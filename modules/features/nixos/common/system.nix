{config, ...}: {
  time.timeZone = "Europe/Bucharest";
  i18n.defaultLocale = "en_US.UTF-8";
  console.keyMap = "us";

  programs.bash = {
    enable = true;
    completion.enable = true;
  };

  # whois (new NixOS module in 26.05) — intelligent WHOIS client.
  programs.whois.enable = true;

  # nh — a modern nix CLI helper with beautiful build diffs (via nvd).
  # NH_FLAKE is picked up automatically by `nh os switch`, `nh os boot`, etc.
  programs.nh = {
    enable = true;
    flake = config.nixpi.config;

    # Weekly automatic garbage collection — keeps the store tidy without
    # manual intervention.
    clean = {
      enable = true;
      extraArgs = "--keep-since 14d --keep 5";
    };
  };

  nix = {
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
        # pipe-operators: Nix 2.26+ |> operator for chained function calls.
        "pipe-operators"
      ];
      extra-substituters = ["https://cache.numtide.com"];
      extra-trusted-public-keys = [
        "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
      ];
      # Hard-link identical files in the store — reduces disk usage with
      # no build-time cost.
      auto-optimise-store = true;
    };

    # Periodic scheduled store optimisation (complements auto-optimise-store).
    optimise.automatic = true;
    # nix.gc is intentionally omitted — programs.nh.clean handles GC instead,
    # giving richer output and avoiding the conflicting-settings warning.
  };
}
