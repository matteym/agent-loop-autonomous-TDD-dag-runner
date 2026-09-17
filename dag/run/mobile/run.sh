#!/usr/bin/env bash
# Lanceur SSH / iPhone : tmux + unattended + status une page.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
# shellcheck source=../common.sh
. "$(cd "$(dirname "$0")/.." && pwd)/common.sh"

cd "$DAG_ROOT" || exit 1

FORCE_UNATTENDED=1
DEFAULT_PUSH="Y"
DEFAULT_MERGE="N"

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

dag_offer_existing_session "$SELF"

echo "=========================================="
echo "  LANCEMENT DE L'AGENT TDD (MOBILE/SSH)   "
echo "=========================================="
echo "Session tmux: $TMUX_SESSION"
echo "Unattended: oui (toujours, pour ne pas auto-accepter un merge)."
echo "Suivi telephone: $SELF status   ou   tail -f logs/status"

dag_ask_run_options
dag_require_prompt_or_dagfile
dag_start_tmux detach
