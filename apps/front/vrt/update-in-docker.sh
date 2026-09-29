#!/usr/bin/env bash
set -euo pipefail

front="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$front/../.." && pwd)"
version="$(node -p "require('$front/node_modules/@playwright/test/package.json').version")"

docker run --rm \
  -v "$root":/src:ro \
  -v "$front/vrt/__screenshots__":/out \
  "mcr.microsoft.com/playwright:v$version-noble" \
  bash -euo pipefail -c '
    apt-get update -qq && apt-get install -y -qq fonts-noto-cjk >/dev/null
    mkdir /work && cd /src
    tar cf - --exclude=node_modules --exclude=.git --exclude=.claude --exclude=.wrangler \
      --exclude=apps/front/build --exclude=apps/front/vrt/.state --exclude=apps/front/vrt/.generated . \
      | tar xf - -C /work
    cd /work
    corepack enable >/dev/null
    CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile >/dev/null
    rm -rf apps/front/vrt/__screenshots__
    status=0
    pnpm --filter @shine/front run vrt --update-snapshots "$@" || status=$?
    rm -rf /out/*
    cp -r apps/front/vrt/__screenshots__/. /out/
    exit "$status"
  ' _ "$@"
