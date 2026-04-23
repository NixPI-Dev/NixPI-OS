# Controlled Tag Vocabulary

All tags used in wiki frontmatter must come from this list.
This prevents drift and ensures `qmd` retrieval stays clean.

## Personal domains

| tag | use for |
|---|---|
| `journal` | daily log entries |
| `daily` | daily note specifically |
| `weekly` | weekly review or log |
| `monthly` | monthly review or log |
| `health` | physical or mental health |
| `energy` | sleep, energy, substance patterns |
| `fitness` | movement, sport, training |
| `nutrition` | diet, food habits |
| `relationships` | people, social, family |
| `family` | immediate family |
| `self` | identity, self-knowledge |
| `career` | work, professional growth |
| `wealth` | money, savings, investing |
| `habits` | rituals, routines, patterns |
| `trips` | travel, places |
| `ideas` | speculative concepts, side ideas |
| `review` | retrospective or periodic review |
| `planning` | forward planning |
| `organization` | systems, structure, tooling |
| `decision` | a significant choice made |
| `learning` | books, courses, study |

## Technical domains

| tag | use for |
|---|---|
| `nixos` | NixOS system or config |
| `infrastructure` | machines, services, ops |
| `ai` | machine learning, LLMs, agents |
| `knowledge-system` | wiki, pkm, information architecture |
| `pi` | PI agent, pi extensions, pi skills |
| `extension` | PI extension |
| `skill` | PI skill |
| `migration` | data migration or schema change |
| `tooling` | developer tools, scripts |
| `sync` | Syncthing or sync layer |
| `networking` | networking, VPN, WireGuard |
| `research` | technical or personal research |
| `source` | captured or imported external source |
| `architecture` | system design, structural decisions |

## Operational types

| tag | use for |
|---|---|
| `task` | a task note |
| `meeting` | a meeting note |
| `event` | a scheduled event |
| `reminder` | a reminder or follow-up |
| `project` | a project note |
| `area` | an area note |
| `person` | a person note |
| `host` | a machine or host note |
| `service` | a service or process note |
| `dashboard` | a navigation or dashboard page |
| `index` | an index or catalog page |

## Rules

- Use 1–4 tags per note
- Prefer fewer, more specific tags over many loose tags
- Never use a tag not in this list without adding it here first
- The `domain:` field handles personal vs technical split — do not duplicate that via tags
