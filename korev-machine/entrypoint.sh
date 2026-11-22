#!/usr/bin/env bash
set -euo pipefail

DATA_DIR=/data
KOREV_USER=korev
KOREV_HOME="$DATA_DIR/home"
DOCKER_DATA="$DATA_DIR/docker"
KOREVD=/opt/korev/.vite/build/headless.cjs
KOREV_PORT="${KOREV_REMOTE_PORT:-7420}"
PORT_POLL_SECONDS=0.1
export KOREV_DATA_DIR="${KOREV_DATA_DIR:-$DATA_DIR/korev}"

prepare_disk() {
  mkdir -p "$KOREV_HOME" "$KOREV_DATA_DIR" "$DOCKER_DATA"
  chown "$KOREV_USER:$KOREV_USER" "$KOREV_HOME" "$KOREV_DATA_DIR"
}

korev_is_listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/$KOREV_PORT") 2>/dev/null
}

start_docker_after_korev() {
  (
    until korev_is_listening; do sleep "$PORT_POLL_SECONDS"; done
    exec dockerd --data-root "$DOCKER_DATA"
  ) >/var/log/dockerd.log 2>&1 &
}

prepare_disk
start_docker_after_korev
exec setpriv --reuid="$KOREV_USER" --regid="$KOREV_USER" --init-groups \
  env HOME="$KOREV_HOME" USER="$KOREV_USER" SHELL=/bin/bash \
  DISABLE_AUTOUPDATER=1 node "$KOREVD"
