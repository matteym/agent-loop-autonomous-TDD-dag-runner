#!/usr/bin/env bash
# Shared helpers for dag/run/mobile and dag/run/desktop.
# shellcheck shell=bash

RUN_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAG_ROOT="$(cd "$RUN_LIB_DIR/.." && pwd)"
STATUS_FILE="$DAG_ROOT/logs/status"
TMUX_SESSION="dag"

TASK_FLAGS=()
DAGFILE=""
PROMPT_TEXT=""
FORCE_UNATTENDED=0
DEFAULT_PUSH="Y"
DEFAULT_MERGE="N"
DEFAULT_UNATTENDED="N"

dag_tmux_running() {
  command -v tmux >/dev/null 2>&1 && tmux has-session -t "$TMUX_SESSION" 2>/dev/null
}

dag_ask_yn() {
  local prompt="$1"
  local default="${2:-N}"
  local reply
  if [ "$default" = "Y" ]; then
    read -r -p "$prompt [O/n] : " reply || true
    case "$reply" in
      n|N|non|no) return 1 ;;
      *) return 0 ;;
    esac
  fi
  read -r -p "$prompt [o/N] : " reply || true
  case "$reply" in
    o|O|oui|y|Y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

dag_show_status() {
  mkdir -p "$DAG_ROOT/logs"
  if [ ! -f "$STATUS_FILE" ]; then
    echo "Aucun logs/status pour le moment. En attente (Ctrl+C pour quitter)..."
    while [ ! -f "$STATUS_FILE" ]; do
      sleep 1
    done
  fi
  clear 2>/dev/null || true
  echo "=== STATUT DE L'AGENT (Ctrl+C quitte le suivi, la tache continue) ==="
  echo "fichier: $STATUS_FILE"
  echo ""
  tail -n 25 -f "$STATUS_FILE"
}

dag_attach() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux introuvable."
    exit 1
  fi
  if dag_tmux_running; then
    tmux attach -t "$TMUX_SESSION"
    return 0
  fi
  echo "Aucune session tmux '$TMUX_SESSION' en cours."
  exit 1
}

dag_offer_existing_session() {
  local self="$1"
  if ! dag_tmux_running; then
    return 0
  fi
  echo "================================================="
  echo "  UNE SESSION DE L'AGENT EST DEJA EN COURS !     "
  echo "================================================="
  echo "1) Voir le log iPhone (status)"
  echo "2) Reprendre le terminal complet (attach)"
  echo "3) Annuler"
  read -r -p "Choix [1-3] : " ACTION || true
  case "$ACTION" in
    1) exec "$self" status ;;
    2) exec "$self" attach ;;
    *) exit 0 ;;
  esac
}

# Fills TASK_FLAGS, DAGFILE. Caller may preset DAGFILE / PROMPT_TEXT.
dag_ask_run_options() {
  TASK_FLAGS=()

  echo ""
  echo "Parametres de ce run (flags yarn task) :"
  echo "  push    = git push + ouvrir/reutiliser la PR  (--push / --no-push)"
  echo "  merge   = merger la PR dans main a la fin     (--merge)"
  echo "  provider= cursor | claude | auto"
  echo "  dagfile = JSON deja planifie (sinon le planner part de ton prompt)"
  echo ""

  if dag_ask_yn "Autoriser git push + ouvrir/reutiliser la PR" "$DEFAULT_PUSH"; then
    TASK_FLAGS+=(--push=true)
  else
    TASK_FLAGS+=(--no-push)
  fi

  if dag_ask_yn "Merger dans main a la fin du DAG" "$DEFAULT_MERGE"; then
    TASK_FLAGS+=(--merge)
  fi

  local provider=""
  read -r -p "Provider [auto|cursor|claude] (defaut auto) : " provider || true
  provider="$(echo "$provider" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
  case "$provider" in
    cursor|claude) TASK_FLAGS+=(--provider="$provider") ;;
    ""|auto) ;;
    *)
      echo "Provider inconnu: $provider (attendu auto, cursor ou claude)."
      exit 1
      ;;
  esac

  if [ "$FORCE_UNATTENDED" = 1 ]; then
    TASK_FLAGS+=(--unattended)
  elif dag_ask_yn "Mode unattended (pas de still continue o/n)" "$DEFAULT_UNATTENDED"; then
    TASK_FLAGS+=(--unattended)
  fi

  if [ -z "$DAGFILE" ]; then
    read -r -p "DAG existant --dagfile (vide = planner) : " DAGFILE || true
    DAGFILE="$(echo "$DAGFILE" | tr -d '[:space:]')"
  fi
}

dag_require_prompt_or_dagfile() {
  if [ -n "$DAGFILE" ]; then
    return 0
  fi
  if [ -n "$PROMPT_TEXT" ]; then
    return 0
  fi
  read -r -p "Entre ton prompt : " PROMPT_TEXT || true
  if [ -z "$PROMPT_TEXT" ]; then
    echo "Prompt vide. Annulation."
    exit 1
  fi
}

dag_print_launch() {
  echo ""
  echo "cwd: $DAG_ROOT"
  echo -n "cmd: yarn task"
  local flag
  for flag in "${TASK_FLAGS[@]}"; do
    printf ' %s' "$flag"
  done
  if [ -n "$DAGFILE" ]; then
    printf ' --dagfile=%s' "$DAGFILE"
  else
    printf ' %q' "$PROMPT_TEXT"
  fi
  echo ""
  echo ""
}

dag_write_launch_script() {
  local path="$1"
  {
    echo "#!/usr/bin/env bash"
    echo "set -euo pipefail"
    echo "cd $(printf '%q' "$DAG_ROOT")"
    echo -n "yarn task"
    local flag
    for flag in "${TASK_FLAGS[@]}"; do
      printf ' %q' "$flag"
    done
    if [ -n "$DAGFILE" ]; then
      printf ' --dagfile=%q' "$DAGFILE"
    else
      printf ' %q' "$PROMPT_TEXT"
    fi
    echo
  } > "$path"
  chmod +x "$path"
}

dag_start_tmux() {
  local detach="${1:-}"
  if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux introuvable. Installe tmux, ou utilise dag/run/desktop/run.sh"
    exit 1
  fi
  mkdir -p "$DAG_ROOT/logs"
  local cmd_file="$DAG_ROOT/logs/next-run.sh"
  dag_write_launch_script "$cmd_file"
  dag_print_launch
  local inner="bash $(printf '%q' "$cmd_file"); rm -f $(printf '%q' "$cmd_file"); echo; echo '[agent-loop] termine. Ctrl+D pour fermer.'; exec bash"
  if [ "$detach" = "detach" ]; then
    echo "Lancement detache dans tmux session '$TMUX_SESSION'..."
    tmux new-session -d -s "$TMUX_SESSION" -c "$DAG_ROOT" "$inner"
    echo "La tache tourne. Ctrl+C quitte ce suivi (la tache continue)."
    echo "Reprendre le terminal: ./run/mobile/run.sh attach"
    dag_show_status
  else
    echo "Lancement dans tmux session '$TMUX_SESSION'..."
    tmux new-session -s "$TMUX_SESSION" -c "$DAG_ROOT" "$inner"
  fi
}

dag_start_foreground() {
  dag_print_launch
  echo "Lancement..."
  cd "$DAG_ROOT"
  if [ -n "$DAGFILE" ]; then
    yarn task "${TASK_FLAGS[@]}" --dagfile="$DAGFILE"
  else
    yarn task "${TASK_FLAGS[@]}" "$PROMPT_TEXT"
  fi
}
