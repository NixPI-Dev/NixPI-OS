---
name: wiki-migration
description: >
  Migrate personal knowledge notes from ~/Wiki_backup into the plain-Markdown
  personal wiki at ~/NixPI/wiki/personal. Use when asked to migrate notes,
  convert legacy frontmatter to the current schema with stable ids and
  object_type, or move files from the old structure. Uses qmd for local hybrid
  retrieval to narrow candidates before reading. Works in small ordered batches
  suited to a local or weak model. Covers projects, areas, people, knowledge,
  sources, tasks, technical notes, and journal entries.
---

# Wiki Migration Skill

Migrate notes from `~/Wiki_backup/pages/` → `~/NixPI/wiki/personal/pages/` one batch at a time.

## Paths

| Role | Path |
|---|---|
| Backup vault | `~/Wiki_backup/pages/` |
| New wiki | `~/NixPI/wiki/personal/pages/` |
| Schema | `~/NixPI/wiki/personal/WIKI_SCHEMA.md` |
| Rules | `~/NixPI/wiki/personal/WIKI_RULES.md` |
| Object model | `~/NixPI/wiki/personal/WIKI_OBJECT_MODEL.md` |
| Object schemas | `~/NixPI/wiki/personal/schemas/<object_type>.md` |
| Templates | `~/NixPI/wiki/personal/templates/markdown/` |
| Controlled tags | `~/NixPI/wiki/personal/meta/tags.md` |
| Relation types | `~/NixPI/wiki/personal/meta/relation-types.md` |
| Registry | `~/NixPI/wiki/personal/meta/registry.json` |
| Log | `~/NixPI/wiki/personal/meta/log.md` |
| Scan script | `scripts/scan.sh` |
| Batch list script | `scripts/batch-list.sh` |

---

## qmd Setup (do once)

qmd is the local retrieval layer. Use it to narrow candidates before reading files.

```bash
# Register collections
qmd collection add wiki-personal ~/NixPI/wiki/personal
qmd collection add wiki-backup ~/Wiki_backup
qmd update

# Generate embeddings (optional — needed for hybrid/vsearch)
# Skip on low-power hardware; lexical search alone works fine
qmd embed
```

Attach the schema as context so qmd can use it for reranking:

```bash
qmd context add wiki-schema ~/NixPI/wiki/personal/WIKI_SCHEMA.md
qmd context add wiki-rules ~/NixPI/wiki/personal/WIKI_RULES.md
```

Check index health:

```bash
qmd status
```

---

## qmd Usage During Migration

### Find candidates in the backup

```bash
# Fast lexical — no LLM required, best for low-power hardware
qmd search "topic or person name" -c wiki-backup --files

# Hybrid with no reranking — better coverage, still no LLM calls
qmd query "topic description" -c wiki-backup --no-rerank --files -n 5

# Get a specific file
qmd get ~/Wiki_backup/pages/resources/people/dan-bunescu.md
```

### Check if a note was already migrated

```bash
qmd search "title or slug" -c wiki-personal --files
```

### Low-power / local model tips

- Prefer `qmd search` (BM25 only, fastest, no LLM)
- Use `--no-rerank` with `qmd query` for hybrid without LLM reranking
- Use `--files` to get paths, then `qmd get` the one that looks right
- Use `-n 3` to keep context load small
- Skip `qmd embed` entirely if on minimal hardware — `qmd search` still works

---

## Backup inventory

| Batch | Source path | Files | Destination |
|---|---|---|---|
| 1. Projects | `projects/forgedance/`, `projects/active-quests/` | 7 | `pages/projects/` |
| 2. Areas | `areas/{career,vitality,wealth,habits,trips,misc,ideas,environment}/` | ~37 | `pages/areas/` |
| 3. People | `resources/people/` | 20 | `pages/resources/people/` |
| 4. Knowledge | `resources/knowledge/` | 38 | `pages/resources/knowledge/` |
| 5. Digital garden | `resources/digital-garden/` | 8 | `pages/sources/` |
| 6. Resources misc | `resources/personal/`, `resources/technical/` | 4 | `pages/resources/personal/`, `pages/resources/technical/` |
| 7. Tasks | `tasks/` | 5 | `pages/planner/tasks/` |
| 8. Technical | `technical/ai/`, `technical/nixos/` | 5 | `pages/resources/technical/` or `pages/areas/` |
| 9. Journal | `areas/journal/YYYY/MM-Month/` | 265 | `pages/journal/daily/` |

Process in this order. Always finish one batch and verify before starting the next.

---

## Session start — always do this first

```bash
# 1. Check migration status
bash ~/.pi/agent/skills/wiki-migration/scripts/scan.sh

# 2. Check qmd index is current
qmd status

# 3. Read the schema (do once per session)
cat ~/NixPI/wiki/personal/WIKI_SCHEMA.md
```

Then ask the user which batch to work on, or continue from where the last session stopped by checking `meta/log.md`.

---

## Batch sizes

| Batch type | Max files per session |
|---|---|
| Projects, tasks, technical | All in one session (small counts) |
| Areas | All in one session |
| People, knowledge | 10 files per session |
| Digital garden | All in one session |
| Journal | 30 files per session, one month at a time |

---

## Per-file migration workflow

For each file in the batch:

1. Use `qmd search` to check if already migrated
2. Read the backup file
3. Determine the canonical destination path
4. Transform the frontmatter (see rules below)
5. Fix the body (see rules below)
6. Write to the new wiki path
7. Add an entry to `meta/registry.json`

After the full batch:

8. Append a log entry to `meta/log.md`
9. Run `qmd update` to re-index the new wiki
10. Run the post-batch verification

---

## Path mapping rules

| Source pattern | Destination pattern |
|---|---|
| `areas/journal/YYYY/MM-Month/YYYY-MM-DD.md` | `journal/daily/YYYY-MM-DD.md` |
| `resources/people/<slug>.md` | `resources/people/<slug>.md` |
| `resources/knowledge/<slug>.md` | `resources/knowledge/<slug>.md` |
| `resources/digital-garden/<slug>.md` | `sources/<slug>.md` |
| `resources/personal/<slug>.md` | `resources/personal/<slug>.md` |
| `resources/technical/<slug>.md` | `resources/technical/<slug>.md` |
| `projects/<project-slug>/<file>.md` | `projects/<project-slug>/<file>.md` |
| `areas/<area-slug>/<file>.md` | `areas/<area-slug>/<file>.md` |
| `tasks/<slug>.md` | `planner/tasks/<slug>.md` |
| `technical/ai/<slug>.md` | `resources/technical/<slug>.md` |
| `technical/nixos/<slug>.md` | `resources/technical/<slug>.md` |

---

## Frontmatter transformation rules

### 1. Add `id`

Generate a stable ID from the object type and filename slug.

| object_type | id pattern | example |
|---|---|---|
| `person` | `person/<slug>` | `person/dan-bunescu` |
| `concept` | `concept/<slug>` | `concept/feco-recipe` |
| `area` | `area/<slug>` | `area/career` |
| `project` | `project/<slug>` | `project/forgedance` |
| `task` | `task/<slug>` | `task/weekly-review` |
| `source` | `source/<slug>` | `source/article-name` |
| `daily-note` | `journal/YYYY-MM-DD` | `journal/2025-03-07` |
| `host` | `host/<slug>` | `host/evo-nixos` |
| `service` | `service/<slug>` | `service/syncthing` |

Slug = filename without `.md`, already kebab-case.

### 2. Add `schema_version: 1`

Insert directly after `id:`.

### 3. Add `object_type`

Infer from `type` + source folder:

| type | source folder | object_type |
|---|---|---|
| `journal` | `areas/journal/` | `daily-note` |
| `entity` | `resources/people/` | `person` |
| `concept` | `resources/knowledge/` | `concept` |
| `concept` | `areas/<area>/` | `area` |
| `evolution` | `projects/` | `project` |
| `concept` or `synthesis` | `resources/digital-garden/` | `source` |
| `task` | `tasks/` | `task` |
| `concept` | `technical/` | `concept` |
| `entity` | `technical/` | `host` or `service` |

### 4. Add `validation_level: seed`

Insert after `status:`. All migrated notes start as `seed`.

### 5. Add review fields (durable notes only)

For `project`, `area`, `person`, `host`, `service`, `concept`, `dashboard`:

```yaml
review_cycle_days: <days>
last_reviewed: 2026-04-21
next_review: <computed>
```

| object_type | review_cycle_days | next_review |
|---|---|---|
| `project` | 90 | 2026-07-20 |
| `area` | 90 | 2026-07-20 |
| `person` | 60 | 2026-06-20 |
| `concept` | 180 | 2026-10-18 |
| `host` / `service` | 60 | 2026-06-20 |

Do **not** add review fields to: `task`, `event`, `reminder`, `daily-note`, `review`, `source`.

### 6. Add empty relation fields

Insert after `updated:` (and before review fields):

```yaml
projects: []
people: []
systems: []
sources: []
related: []
source_ids: []
```

For tasks also add:

```yaml
depends_on: []
blocked_by: []
completed:
```

### 7. Fix bad summaries

These are not real summaries — detect and replace them:

```yaml
summary: "type: journal"
summary: "type: entity"
summary: "type: concept"
summary: "type: synthesis"
summary: "type: evolution"
```

Replacement rules:

- **daily notes**: `Daily log for YYYY-MM-DD.` — if body has a Focus section, use that instead
- **people**: `<Name> — <relationship context from body>.`
- **concepts/knowledge**: rephrase the title as a definition sentence
- **projects/areas**: title + current state or scope sentence
- **empty body**: `Migrated note — summary to be written.`

Use `qmd search "<title>" -c wiki-backup` to find related context if needed.

### 8. Normalize tags

Convert block format to inline. Filter to only tags present in `meta/tags.md`.

```yaml
# Old
tags:
  - journal
  - reflection

# New
tags: [journal, daily]
```

Remove duplicate tags (some backup files have tags listed twice).

### 9. Fix `areas` field

If `areas: []` and the note is in an area folder, set `areas: [<area-slug>]`.

| Source location | areas value |
|---|---|
| `areas/career/` | `[career]` |
| `areas/vitality/` | `[vitality]` |
| `areas/journal/` | `[journal]` |
| `resources/people/` | `[relationships]` |
| `resources/knowledge/` | `[knowledge-system]` |
| `technical/` | `[infrastructure]` |

### 10. Fix double frontmatter

Some backup files have a duplicated YAML block. If a second `---` block appears after the first body content and contains the same fields, remove the second block entirely.

---

## Body transformation rules

### Remove double frontmatter

If the body starts with a second `---` block, strip it.

### Convert wikilinks

```
[[Title]]             → Title (plain text, unknown target)
[[NixPI]]             → [NixPI](../../projects/nixpi/index.md)  (if exists in new wiki)
```

To check if a target exists in the new wiki:

```bash
qmd search "NixPI" -c wiki --files -n 1
```

If the target is not found in the new wiki, convert to plain text.

### Keep everything else

Do not rewrite note body content. Fix only structural issues.

---

## Canonical frontmatter field order

```yaml
---
id:
schema_version: 1
type:
object_type:
title:
aliases:
tags:
domain:
areas:
hosts:
status:
validation_level: seed
created:
updated:
review_cycle_days:
last_reviewed:
next_review:
# type-specific fields: priority, due, schedule, start, end, remind_at ...
projects: []
people: []
systems: []
sources: []
related: []
depends_on: []      # tasks only
blocked_by: []      # tasks only
completed:          # tasks only
source_ids: []
summary:
---
```

---

## Registry update

After each batch append entries to `~/NixPI/wiki/personal/meta/registry.json`:

```json
{"id":"person/dan-bunescu","title":"Dan Bunescu","path":"pages/resources/people/dan-bunescu.md","type":"entity","object_type":"person","domain":"personal","status":"active"}
```

---

## Log entry format

```
## [YYYY-MM-DD] migration | <batch name>
Migrated N files from <source> to <destination>. Notes: <any issues>.
```

---

## Post-batch verification

```bash
# Wikilinks remaining in new wiki
grep -rn '\[\[[^]]*\]\]' ~/NixPI/wiki/personal/pages/ || echo 'no wikilinks'

# Schema and broken-link check
bash ~/.pi/agent/skills/wiki-migration/scripts/scan.sh verify

# Re-index qmd so new notes are searchable
qmd update
```

---

## Journal batch workflow

265 files. Process one month at a time.

```bash
# List one month
bash ~/.pi/agent/skills/wiki-migration/scripts/batch-list.sh journal 2025 03-March

# Each file:
# id: journal/YYYY-MM-DD
# object_type: daily-note
# type: journal
# domain: personal
# areas: [journal]
# validation_level: seed
# No review fields
# destination: pages/journal/daily/YYYY-MM-DD.md
```

For journal notes: if the body is empty or just `---`, keep it as-is with the minimal summary `Daily log for YYYY-MM-DD.`

---

## Common problems

| Problem | Fix |
|---|---|
| `summary: "type: X"` | Write a real summary from title + body |
| Double frontmatter block | Remove second occurrence |
| Duplicate tags | Deduplicate |
| Tags not in vocabulary | Filter to only those in `meta/tags.md` |
| `areas: []` | Infer from folder (see table above) |
| Wikilinks `[[...]]` | Convert via qmd lookup then plain text fallback |
| Long dense file | Summarize the main idea only; body stays as-is |
| Journal note with no body | Summary = `Daily log for YYYY-MM-DD.` |

---

## What NOT to do

- Do not migrate the same file twice — check `meta/registry.json` or `qmd search`
- Do not create new object types not in `WIKI_SCHEMA.md`
- Do not write summaries longer than one sentence
- Do not change body content (fix structure only)
- Do not invent relation links — leave relation fields as `[]` unless explicit in the backup file
- Do not process more files than the batch size limit per session
- Do not call cloud APIs — use local qmd and the local model only
