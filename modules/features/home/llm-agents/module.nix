{
  lib,
  pkgs,
  ...
}: {
  home.packages = [
    pkgs.llm-agents.claude-code
    pkgs.llm-agents.codex
    pkgs.llm-agents.copilot-cli
  ];

  programs.bash.initExtra = lib.mkAfter ''
    # AI coding CLIs on this host use OAuth subscriptions.
    # Avoid token/API-key env vars taking precedence over the interactive login.
    claude() {
      env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN command claude "$@"
    }

    codex() {
      env -u OPENAI_API_KEY command codex "$@"
    }

    copilot() {
      env -u COPILOT_GITHUB_TOKEN -u GH_TOKEN -u GITHUB_TOKEN command copilot "$@"
    }
  '';
}
