#!/usr/bin/env bash
set -euo pipefail

FLY_API_SOCKET=/.fly/api
SUSPEND_URL="http://flaps/v1/apps/$FLY_APP_NAME/machines/$FLY_MACHINE_ID/suspend"

sudo -n curl -fsS --unix-socket "$FLY_API_SOCKET" -X POST "$SUSPEND_URL" >/dev/null
