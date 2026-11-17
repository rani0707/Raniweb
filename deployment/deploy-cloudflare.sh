#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
unset DOCKER_CONTEXT
docker() { command docker --host unix:///var/run/docker.sock "$@"; }

exec 9>"$(git rev-parse --git-path raniweb-deploy.lock)"
flock -n 9

network=cloudflare-net
app=raniweb-web
candidate=raniweb-web-candidate
previous=raniweb-web-previous

docker network inspect "$network" >/dev/null
git switch main
git pull --ff-only origin main
revision=$(git rev-parse HEAD)
image="raniweb:$revision"

exists() { docker container inspect "$1" >/dev/null 2>&1; }

check_app() {
  local name=$1
  for ((attempt=0; attempt<20; attempt++)); do
    if docker exec "$name" node -e '
      Promise.all(["/api/health", "/"].map(path =>
        fetch("http://127.0.0.1:3000" + path, {signal: AbortSignal.timeout(2000)})
          .then(response => response.ok)
      )).then(results => process.exit(results.every(Boolean) ? 0 : 1))
        .catch(() => process.exit(1))
    ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

run_app() {
  docker run -d --name "$1" --restart "$2" --network "$network" \
    --read-only --tmpfs /tmp:rw,nosuid,noexec,size=64m \
    --cap-drop ALL --security-opt no-new-privileges "$image"
}

if ! exists "$app" && exists "$previous"; then
  docker rename "$previous" "$app"
  docker start "$app"
fi

if exists "$app" &&
   [[ "$(docker inspect --format '{{.Config.Image}} {{.State.Running}}' "$app")" == "$image true" ]] &&
   [[ "$(docker inspect --format '{{if index .NetworkSettings.Networks "cloudflare-net"}}attached{{end}}' "$app")" == attached ]] &&
   check_app "$app"; then
  exit 0
fi

docker build -t "$image" .
if exists "$candidate"; then
  docker rm -f "$candidate"
fi
trap 'docker rm -f "$candidate" >/dev/null 2>&1 || true' EXIT
run_app "$candidate" no
if ! check_app "$candidate"; then
  docker logs --tail 50 "$candidate"
  exit 1
fi
docker rm -f "$candidate"

if exists "$app"; then
  if exists "$previous"; then
    docker rm "$previous"
  fi
  docker stop "$app"
  docker rename "$app" "$previous"
fi

if run_app "$app" unless-stopped && check_app "$app"; then
  echo "Deployed $revision on $network as $app:3000"
else
  docker logs --tail 50 "$app" || true
  if exists "$app"; then
    docker rm -f "$app"
  fi
  if exists "$previous"; then
    docker rename "$previous" "$app"
    docker start "$app"
  fi
  exit 1
fi
