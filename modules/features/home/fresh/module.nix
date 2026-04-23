{...}: {
  programs.fresh-editor = {
    enable = true;
    defaultEditor = true;
    settings = {
      check_for_updates = false;
    };
  };
}
