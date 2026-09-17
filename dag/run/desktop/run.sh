#!/usr/bin/env bash
# Lanceur desktop : plus besoin de taper yarn task a la main.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
# shellcheck source=../common.sh
. "$(cd "$(dirname "$0")/.." && pwd)/common.sh"

cd "$DAG_ROOT" || exit 1

FORCE_UNATTENDED=0
DEFAULT_PUSH="Y"
DEFAULT_MERGE="Y"
DEFAULT_UNATTENDED="N"

case "${1:-}" in
  status|log|logs)
    dag_show_status
    exit 0
    ;;
  attach|resume)
    dag_attach
    exit 0
    ;;
esac

if [ -n "${1:-}" ]; then
  PROMPT_TEXT="$*"
fi

if dag_tmux_running; then
  dag_offer_existing_session "$SELF"
fi

echo "=========================================="
echo "  LANCEMENT DE L'AGENT TDD (DESKTOP)      "
echo "=========================================="
echo "cwd: $DAG_ROOT"

dag_ask_run_options
dag_require_prompt_or_dagfile

USE_TMUX="N"
if command -v tmux >/dev/null 2>&1; then
  if dag_ask_yn "Lancer dans tmux (survit a la fermeture du terminal)" "N"; then
    USE_TMUX="Y"
  fi
fi

if [ "$USE_TMUX" = "Y" ]; then
  dag_start_tmux
else
  dag_start_foreground
fi
