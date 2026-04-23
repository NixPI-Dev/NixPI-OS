#!/usr/bin/env bash
# scan.sh — wiki migration status report
# Usage: bash scan.sh [verify]

BACKUP_ROOT="${WIKI_BACKUP_ROOT:-$HOME/Wiki_backup}"
TARGET_ROOT="${WIKI_MIGRATION_TARGET_ROOT:-${PI_LLM_WIKI_DIR_PERSONAL:-$HOME/NixPI/wiki/personal}}"
BACKUP="$BACKUP_ROOT/pages"
NEW="$TARGET_ROOT/pages"

if [ "${1:-}" = "verify" ]; then
  printf '=== Post-batch verification ===\n'
  printf 'Wikilinks remaining in new wiki:\n'
  grep -rn '\[\[[^]]*\]\]' "$NEW" --include='*.md' || echo '  none'
  printf '\nNotes missing schema_version:\n'
  find "$NEW" -type f -name '*.md' -exec grep -L '^schema_version:' {} + | \
    sed "s|$NEW/||" || echo '  none'
  printf '\nNotes missing validation_level:\n'
  find "$NEW" -type f -name '*.md' -exec grep -L '^validation_level:' {} + | \
    sed "s|$NEW/||" || echo '  none'
  exit 0
fi

printf '=== Wiki Migration Status ===\n'
printf 'Date: %s\n\n' "$(date '+%Y-%m-%d')"

# Helper: count files in a path
count() { find "$1" -type f -name '*.md' 2>/dev/null | wc -l; }

printf '%-40s  %6s  %6s  %6s\n' 'Batch' 'Backup' 'New' 'Remaining'
printf '%s\n' '--------------------------------------------------------------------'

row() {
  local label="$1" src="$2" dst="$3"
  local b n r
  b=$(count "$BACKUP/$src")
  n=$(count "$NEW/$dst")
  r=$((b - n))
  printf '%-40s  %6s  %6s  %6s\n' "$label" "$b" "$n" "$r"
}

row "1. Projects"             "projects"                       "projects"
row "2. Areas (non-journal)"  "areas"                          "areas"
row "3. People"               "resources/people"               "resources/people"
row "4. Knowledge"            "resources/knowledge"            "resources/knowledge"
row "5. Digital garden"       "resources/digital-garden"       "sources"
row "6. Resources misc"       "resources/personal"             "resources/personal"
row "7. Tasks"                "tasks"                          "planner/tasks"
row "8. Technical"            "technical"                      "resources/technical"
row "9. Journal (all)"        "areas/journal"                  "journal/daily"

printf '%s\n' '--------------------------------------------------------------------'
total_b=$(($(count "$BACKUP/projects") + $(count "$BACKUP/areas") + \
           $(count "$BACKUP/resources") + $(count "$BACKUP/tasks") + \
           $(count "$BACKUP/technical")))
total_n=$(count "$NEW")
printf '%-40s  %6s  %6s  %6s\n' 'TOTAL' "$total_b" "$total_n" "$((total_b - total_n))"

printf '\n=== New wiki counts by folder ===\n'
for d in "$NEW"/*/; do
  [ -d "$d" ] || continue
  name=${d%/}; name=${name##*/}
  c=$(count "$d")
  printf '  %-30s %s\n' "$name" "$c"
done

printf '\n=== Journal batches remaining ===\n'
for year_dir in "$BACKUP/areas/journal"/*/; do
  year=${year_dir%/}; year=${year##*/}
  for month_dir in "$year_dir"*/; do
    [ -d "$month_dir" ] || continue
    month=${month_dir%/}; month=${month##*/}
    b=$(count "$month_dir")
    # count corresponding files in new wiki
    # journal files are YYYY-MM-DD.md; month dir is YYYY/MM-Month
    # get year-month prefix from dir name: e.g. 2025/03-March -> 2025-03
    mm=$(printf '%s' "$month" | cut -d- -f1)
    n=$(find "$NEW/journal/daily" -name "${year}-${mm}-*.md" 2>/dev/null | wc -l)
    r=$((b - n))
    [ "$r" -gt 0 ] && printf '  %s/%s  backup=%s  new=%s  remaining=%s\n' "$year" "$month" "$b" "$n" "$r"
  done
done
