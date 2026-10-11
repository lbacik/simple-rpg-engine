#!/bin/sh
# Container entrypoint: seed, migrate, then start (docs/spec/architecture.md,
# hosting and stack). Migrations run here, never in register(), so starting
# against an empty volume creates the schema before the server accepts
# traffic.
set -eu

SCENARIO_DIR="${SCENARIO_DIR:-/data/scenarios}"

# Seed the Scenario directory on first boot against an empty volume, so the
# container serves the bundled collection. An existing volume is untouched,
# so author edits on the volume survive image updates.
if [ -z "$(ls -A "$SCENARIO_DIR" 2>/dev/null)" ]; then
  echo "seeding scenarios into $SCENARIO_DIR"
  mkdir -p "$SCENARIO_DIR"
  cp -r /app/.scenario-seed/. "$SCENARIO_DIR"/
fi

npm run migrate

exec node server.js
