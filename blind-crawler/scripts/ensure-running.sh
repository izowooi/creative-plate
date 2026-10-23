#!/bin/sh
# launchd retries after login/mount; do not restart an already running PM2 app.
set -eu
PATH=/opt/homebrew/bin:/usr/bin:/bin
export PATH
cd /Volumes/sn850x/git/creative-plate/blind-crawler
[ -x .venv/bin/python ] || exit 0
[ -d /Volumes/sn850x/blind-archive-data ] || exit 0
blind_pid=$(pm2 pid blind-archive 2>/dev/null | tail -1)
case "$blind_pid" in ''|0|*[!0-9]*) ;; *) kill -0 "$blind_pid" 2>/dev/null && exit 0 ;; esac
pm2 startOrRestart ecosystem.config.cjs
pm2 save
