# PI Bundle

Public, portable runtime bundle for the NixPI Home Manager PI module.

## Contents

- `extensions/` — in-house PI extensions
- `skills/` — reusable PI skills
- `agents/` — bundled subagents
- `prompts/` — prompt templates and focused session prompts
- `wiki-seed/` — generic plain-Markdown wiki seed content

## Design rules

- No user-specific absolute paths
- No machine-specific assumptions in bundled docs or scripts
- Keep runtime assets tool-agnostic where possible
- Private host, user, and secret material belongs in the private fleet config repo
