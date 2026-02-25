#!/bin/bash
# Runs ONCE when session container starts

cd /usercode/FILESYSTEM

# Download pre-built release
if [ -f parse_solution.py ]; then
  wget -qO- https://github.com/CodeSignal/learn_card-game/releases/latest/download/release.tar.gz | tar xz
  cd card-game

  # Copy task-specific initial state if present
  if [ -f ../initial_state.json ]; then
    cp ../initial_state.json ./initial_state.json
  fi

  # Start production server
  IS_PRODUCTION=true nohup node server.js &
  disown
  exit 0
fi

# Development fallback
echo "parse_solution.py not found - this script should run in the task container"
exit 1
