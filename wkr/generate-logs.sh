#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_file="$script_dir/sample.log"
reset_file=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)
      reset_file=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: generate-logs.sh [--reset]

Generate random log lines into wkr/sample.log.
  --reset   Truncate the file before starting generation.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$script_dir"
touch "$log_file"

if [[ "$reset_file" == true ]]; then
  : > "$log_file"
fi

levels=(INFO INFO INFO WARN ERROR DEBUG)
services=(api auth worker gateway cache scheduler)
actions=(started completed failed retried connected disconnected processed queued)
subjects=(request session job message query sync backup notification)
details=("latency above threshold" "timeout while waiting for response" "database connection restored" "cache entry refreshed" "offset updated successfully" "stream resumed from last checkpoint" "temporary retry scheduled" "payload accepted")
oracle_errors=(
  "ORA-00904: invalid identifier"
  "ORA-00001: unique constraint violated"
  "ORA-01555: snapshot too old"
  "ORA-03113: end-of-file on communication channel"
  "ORA-12541: TNS:no listener"
)

random_item() {
  local -n options_ref="$1"
  local index=$((RANDOM % ${#options_ref[@]}))
  printf '%s' "${options_ref[$index]}"
}

while true; do
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  level="$(random_item levels)"
  service="$(random_item services)"
  action="$(random_item actions)"
  subject="$(random_item subjects)"
  detail="$(random_item details)"
  if [[ "$level" == "ERROR" && $((RANDOM % 2)) -eq 0 ]]; then
    detail="$(random_item oracle_errors)"
  fi

  printf '%s [%s] %s - %s %s (%s)\n' "$timestamp" "$level" "$service" "$subject" "$action" "$detail" >> "$log_file"
  sleep 1
done