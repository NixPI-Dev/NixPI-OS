{
  config,
  pkgs,
  ...
}: let
  nixpiTui = pkgs.writeShellApplication {
    name = "nixpi-tui";
    runtimeInputs = [
      pkgs.bashInteractive
      pkgs.coreutils
      pkgs.gnugrep
      pkgs.pi
      pkgs.zellij
    ];
    text = ''
      set -euo pipefail

      session="''${NIXPI_TUI_SESSION:-nixpi}"
      root="''${NIXPI_ROOT:-${config.nixpi.root}}"

      usage() {
        cat <<EOF
      Usage: nixpi-tui [command] [args...]

      Commands:
        attach        Attach to or create the main NixPI Zellij session
        pi [args...]  Open PI in a pane rooted at $root
        shell         Open a login shell pane rooted at $root
        status        Ask PI for NixPI status in a pane
        sudo [LABEL]  Open a small sudo authentication panel
        run CMD...    Run an arbitrary command in a pane rooted at $root
        watch         Watch the NixPI session read-only

      Environment:
        NIXPI_TUI_SESSION  Zellij session name (default: nixpi)
        NIXPI_ROOT         Workspace root (default: ${config.nixpi.root})
      EOF
      }

      if [ "$#" -eq 0 ]; then
        set -- attach
      fi

      command="$1"
      shift || true

      case "$command" in
        attach)
          exec zellij attach --create "$session"
          ;;
        pi)
          exec zellij --session "$session" run --name pi --cwd "$root" -- pi "$@"
          ;;
        shell)
          exec zellij --session "$session" run --name shell --cwd "$root" -- bash -l
          ;;
        status)
          exec zellij --session "$session" run --name status --cwd "$root" -- bash -lc 'pi --print "Show local NixPI runtime status using the nixpi_status tool."; printf "\nPress enter to close."; read -r _'
          ;;
        sudo)
          label="''${*:-NixPI privileged operation}"
          if ! zellij list-sessions --short | grep -Fx -- "$session" >/dev/null; then
            echo "NixPI Zellij session '$session' is not active. Run: nixpi-tui attach" >&2
            exit 69
          fi
          # shellcheck disable=SC2016
          exec zellij --session "$session" run \
            --floating \
            --width 60% \
            --height 9 \
            --x 20% \
            --y 35% \
            --name sudo-auth \
            -- bash -lc '
              label="$1"
              printf "NixPI sudo authentication\n\n%s\n\n" "$label"
              sudo -v
              status="$?"
              if [ "$status" -eq 0 ]; then
                printf "\nSudo credentials refreshed. You can close this panel.\n"
              else
                printf "\nSudo authentication failed with exit code %s.\n" "$status"
              fi
              printf "\nPress enter to close."
              read -r _
              exit "$status"
            ' bash "$label"
          ;;
        run)
          if [ "$#" -eq 0 ]; then
            usage >&2
            exit 64
          fi
          exec zellij --session "$session" run --name command --cwd "$root" -- "$@"
          ;;
        watch)
          exec zellij watch "$session"
          ;;
        -h|--help|help)
          usage
          ;;
        *)
          echo "Unknown nixpi-tui command: $command" >&2
          usage >&2
          exit 64
          ;;
      esac
    '';
  };
in {
  # Set a writable npm global prefix so `npm install -g` (used by `pi install`)
  # doesn't try to write into the read-only nix store.
  home.file.".npmrc".text = ''
    prefix = ${config.home.homeDirectory}/.npm-global
  '';
  home.sessionPath = ["${config.home.homeDirectory}/.npm-global/bin"];

  home.packages = with pkgs; [
    ripgrep
    fd
    jq
    tree
    unzip
    fastfetch
    eza
    gh
    chromium
    ffmpeg
    yt-dlp
    libsecret
    zellij
    nixpiTui
    pi
    # Modern CLI replacements (added 2026-04-20)
    dua # interactive disk-usage analyser — faster than `du`
    procs # colourised `ps` with tree view and search
    bottom # GPU-aware `htop` replacement with charts
    qmd # hybrid BM25/vector search for markdown
    llm-wiki # portable wiki runtime CLI + Pi extension payload
    nodejs # node + npm, needed for `pi install npm:...`
  ];
}
