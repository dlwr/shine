#!/usr/bin/env bash
set -euo pipefail

front="$(cd "$(dirname "$0")/.." && pwd)"
branch="$(git -C "$front" branch --show-current)"
run="${1:-$(gh run list --workflow VRT --branch "$branch" --limit 1 --json databaseId --jq '.[0].databaseId')}"
downloaded="$(mktemp -d)"
trap 'rm -rf "$downloaded"' EXIT

gh run download "$run" --name vrt-snapshots --dir "$downloaded"
cp -R "$downloaded/." "$front/vrt/__screenshots__/"
git -C "$front" status --short vrt/__screenshots__
