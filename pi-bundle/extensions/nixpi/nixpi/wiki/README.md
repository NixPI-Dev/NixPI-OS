# nixpi-wiki

The wiki module inside the bundled `nixpi` Pi extension. It stores structured data next to human-readable Markdown notes and keeps derived indexes current.

It provides these Pi tools:

- `wiki_status`
- `wiki_capture`
- `wiki_search`
- `wiki_ensure_page`
- `wiki_lint`
- `wiki_rebuild`

## Storage path

By default it uses `PI_LLM_WIKI_DIR` when set.

NixPI split-root sessions should set `PI_LLM_WIKI_ROOTS`, for example:

```text
technical:/home/alex/NixPI/wiki/technical,personal:/home/alex/NixPI/wiki/personal
```

When a tool call includes `domain: technical` or `domain: personal`, the extension routes that operation to the matching root. Calls without a domain use `PI_LLM_WIKI_DIR`.

## Obsidian support

Open `~/NixPI/wiki/technical` or `~/NixPI/wiki/personal` directly as Obsidian vaults.
The extension uses plain markdown and frontmatter, so manual edits work naturally.
The starter seeds the canonical `templates/markdown/` structure used by the workspace wiki.

## Domain separation and PARA

Use frontmatter to separate technical and personal knowledge:

```yaml
domain: technical
areas: [infrastructure, ai]
```

You can organize notes in PARA-style folders such as:

- `pages/projects/`
- `pages/areas/`
- `pages/resources/`
- `pages/archives/`
- `pages/journal/daily/`

For quick separation, direct folders such as `pages/technical/` and `pages/personal/` also work.

`wiki_ensure_page` accepts `folder`, so you can create pages directly under paths like:

- `technical`
- `personal`
- `resources/technical`
- `areas/personal`
- `journal/daily` when creating `type: journal`

## Host-specific knowledge

Pages and captured sources may include an optional frontmatter field:

```yaml
hosts:
  - yoga-nixos
```

If `hosts` is omitted, the page is global.
If `hosts` is present, the page applies only to those hosts.

`wiki_search` defaults to the current host scope plus global pages.
The current host can be overridden with `PI_LLM_WIKI_HOST` if needed.
