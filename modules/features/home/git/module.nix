{...}: {
  programs.git = {
    enable = true;
    settings = {
      init.defaultBranch = "main";
      pull.rebase = false;
      core.editor = "nvim";
      # Allow pushing to bare repos owned by the git group (local /srv/git)
      safe.directory = "/srv/git/*";
    };
  };

  # delta: syntax-highlighted, side-by-side diffs with line numbers.
  programs.delta = {
    enable = true;
    enableGitIntegration = true;
    options = {
      navigate = true; # n/N to move between diff sections
      side-by-side = true;
      line-numbers = true;
    };
  };
}
