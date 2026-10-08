#!/usr/bin/env bash
set -u

attempts=3
for attempt in $(seq 1 "$attempts"); do
  "$@" && exit 0
  if [ "$attempt" -lt "$attempts" ]; then
    echo "::warning::$* が失敗しました（${attempt}/${attempts}）。30 秒後に再試行します"
    sleep 30
  fi
done
exit 1
