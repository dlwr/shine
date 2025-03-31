#!/bin/sh
export LOCAL_DB_PATH=$(find db/dev/v3/d1/miniflare-D1DatabaseObject -type f -name '*.sqlite' -print -quit)
exec "$@"
