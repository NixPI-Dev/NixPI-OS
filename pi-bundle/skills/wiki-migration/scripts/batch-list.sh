#!/usr/bin/env bash
# batch-list.sh — list backup files for a migration batch
# Usage: bash batch-list.sh <batch>
# Batches: projects | areas | people | knowledge | digital-garden | misc | tasks | technical | journal
# For journal: bash batch-list.sh journal <year> <MM-Month>
#   e.g.  bash batch-list.sh journal 2025 03-March

BACKUP_ROOT="${WIKI_BACKUP_ROOT:-$HOME/Wiki_backup}"
BACKUP="$BACKUP_ROOT/pages"

batch="${1:-}"

case "$batch" in
  projects)
    find "$BACKUP/projects" -type f -name '*.md' | sort
    ;;
  areas)
    find "$BACKUP/areas" -type f -name '*.md' \
      | grep -v '/journal/' | sort
    ;;
  people)
    find "$BACKUP/resources/people" -type f -name '*.md' | sort
    ;;
  knowledge)
    find "$BACKUP/resources/knowledge" -type f -name '*.md' | sort
    ;;
  digital-garden)
    find "$BACKUP/resources/digital-garden" -type f -name '*.md' | sort
    ;;
  misc)
    find "$BACKUP/resources/personal" "$BACKUP/resources/technical" \
      -type f -name '*.md' 2>/dev/null | sort
    ;;
  tasks)
    find "$BACKUP/tasks" -type f -name '*.md' | sort
    ;;
  technical)
    find "$BACKUP/technical" -type f -name '*.md' | sort
    ;;
  journal)
    year="${2:-}"
    month="${3:-}"
    if [ -z "$year" ] || [ -z "$month" ]; then
      printf 'Usage: batch-list.sh journal <year> <MM-Month>\n'
      printf 'Available:\n'
      find "$BACKUP/areas/journal" -maxdepth 2 -type d | sort | grep -v '^'"$BACKUP/areas/journal"'$'
      exit 1
    fi
    find "$BACKUP/areas/journal/$year/$month" -type f -name '*.md' | sort
    ;;
  *)
    printf 'Usage: batch-list.sh <batch>\n'
    printf 'Batches: projects | areas | people | knowledge | digital-garden | misc | tasks | technical | journal\n'
    printf 'For journal: batch-list.sh journal <year> <MM-Month>\n'
    exit 1
    ;;
esac
