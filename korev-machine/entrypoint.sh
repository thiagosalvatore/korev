#!/usr/bin/env bash
set -euo pipefail

DATA_DIR=/data
KOREV_USER=korev
KOREV_HOME="$DATA_DIR/home"
DOCKER_DATA="$DATA_DIR/docker"
KOREVD=/opt/korev/.vite/build/headless.cjs
export KOREV_DATA_DIR="${KOREV_DATA_DIR:-$DATA_DIR/korev}"

prepare_disk() {
  mkdir -p "$KOREV_HOME" "$KOREV_DATA_DIR" "$DOCKER_DATA"
  chown "$KOREV_USER:$KOREV_USER" "$KOREV_HOME" "$KOREV_DATA_DIR"
}

start_docker() {
  dockerd --data-root "$DOCKER_DATA" >/var/log/dockerd.log 2>&1 &
}

prepare_disk
start_docker
exec setpriv --reuid="$KOREV_USER" --regid="$KOREV_USER" --init-groups \
  env HOME="$KOREV_HOME" USER="$KOREV_USER" SHELL=/bin/bash \
  DISABLE_AUTOUPDATER=1 node "$KOREVD"
