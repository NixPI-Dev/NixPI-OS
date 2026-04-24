{config, ...}: {
  programs.bash = {
    enable = true;
    enableCompletion = true;

    shellAliases = {
      ls = "eza";
      ll = "eza -lah";
      la = "eza -a";
    };

    historySize = 10000;
    historyFileSize = 10000;
    historyFile = "${config.home.homeDirectory}/.bash_history";
    historyControl = [
      "erasedups"
      "ignoredups"
    ];

    # wiki-technical() and wiki-personal() switch the active wiki context.
    # The llm-wiki extension also receives both roots via dedicated env vars.
    initExtra = ''
      if [ -f "$HOME/.config/nixos-secrets/synthetic-api-key" ] && {
        [ -z "''${SYNTHETIC_API_KEY:-}" ] || [ "''${SYNTHETIC_API_KEY:-}" = "PLACEHOLDER_SYNTHETIC_KEY" ]
      }; then
        export SYNTHETIC_API_KEY="$(tr -d '[:space:]' < "$HOME/.config/nixos-secrets/synthetic-api-key")"
      fi

      wiki-technical() {
        export PI_LLM_WIKI_DIR="${config.nixpi.wiki.technical}"
        echo "Wiki context: technical ($PI_LLM_WIKI_DIR)"
      }

      wiki-personal() {
        export PI_LLM_WIKI_DIR="${config.nixpi.wiki.personal}"
        echo "Wiki context: personal ($PI_LLM_WIKI_DIR)"
      }
    '';
  };

  programs.fzf = {
    enable = true;
    enableBashIntegration = true;
  };

  programs.zoxide = {
    enable = true;
    enableBashIntegration = true;
  };

  programs.vivid = {
    enable = true;
    enableBashIntegration = true;
    activeTheme = "molokai";
  };
}
