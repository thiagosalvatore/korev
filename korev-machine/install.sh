#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR=24
KOREV_USER=korev
KOREV_HOME=/data/home
AGENT_CLIS=(@anthropic-ai/claude-code @openai/codex)
KEYRINGS=/etc/apt/keyrings

export DEBIAN_FRONTEND=noninteractive

install_base_packages() {
  apt-get update
  apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl git gnupg jq less openssh-client \
    pkg-config python3 python3-venv ripgrep sudo tini unzip util-linux
}

install_node() {
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y --no-install-recommends nodejs
}

install_github_cli() {
  mkdir -p "$KEYRINGS"
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o "$KEYRINGS/githubcli-archive-keyring.gpg"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=$KEYRINGS/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list
  apt-get update
  apt-get install -y --no-install-recommends gh
}

install_docker() {
  curl -fsSL https://get.docker.com | sh
}

install_agent_clis() {
  npm install --global "${AGENT_CLIS[@]}"
}

create_korev_user() {
  id "$KOREV_USER" >/dev/null 2>&1 && return
  useradd --home-dir "$KOREV_HOME" --no-create-home --shell /bin/bash \
    --groups docker "$KOREV_USER"
  echo "$KOREV_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$KOREV_USER"
  chmod 0440 "/etc/sudoers.d/$KOREV_USER"
}

install_base_packages
install_node
install_github_cli
install_docker
install_agent_clis
create_korev_user
rm -rf /var/lib/apt/lists/*
